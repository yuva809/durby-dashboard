"use client";

import { useCallback, useRef, useState } from "react";
import { useRestaurantId } from "./use-restaurant-id";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ChatStreamEvent =
  | { type: "tool_call_start"; tool?: string }
  | { type: "tool_result"; tool?: string; data?: unknown }
  | { type: "confirmation_required"; tool?: string; data?: unknown }
  | { type: "token"; data?: unknown }
  | { type: "done"; data?: unknown }
  | { type: "conversation"; conversationId: string }
  | { type: "error"; message: string };

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const clerk = (window as unknown as {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk;
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * SSE streaming client for POST /chat/stream. Deliberately NOT
 * EventSource — the native browser SSE client can only issue unauthenticated
 * GET requests with no custom headers, and this backend requires a Bearer
 * token via the Authorization header (TenancyGuard). fetch() + a manual
 * ReadableStream/SSE-frame parser gets streaming with auth intact.
 */
export function useChatStream() {
  const restaurantId = useRestaurantId();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string, conversationId: string | undefined, onEvent: (event: ChatStreamEvent) => void) => {
      if (!restaurantId) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const token = await getAuthToken();
        const params = new URLSearchParams({ message, ...(conversationId ? { conversationId } : {}) });
        const res = await fetch(`${API_BASE_URL}/restaurants/${restaurantId}/chat/stream?${params}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: controller.signal,
        });
        if (!res.body) throw new Error("Streaming not supported by this response");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; each frame has
          // "event: <type>\ndata: <json>".
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;
            const type = eventLine.slice("event: ".length).trim();
            try {
              const data = JSON.parse(dataLine.slice("data: ".length));
              onEvent({ type, ...data } as ChatStreamEvent);
            } catch {
              // malformed frame — skip rather than crash the stream
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          onEvent({ type: "error", message: err instanceof Error ? err.message : "Streaming failed" });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [restaurantId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { send, stop, isStreaming };
}
