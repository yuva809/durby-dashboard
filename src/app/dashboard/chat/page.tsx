"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent, type DragEvent, type ClipboardEvent } from "react";
import { Send, Bot, User, Paperclip, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner } from "@/components/shared/query-states";
import { useChatMessages, useUploadAttachment, type ChatMessageRow } from "@/hooks/use-chat";
import { useChatStream, type ChatStreamEvent } from "@/hooks/use-chat-stream";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { MessageContent } from "@/components/dashboard/chat/message-content";
import { ConfirmationCard } from "@/components/dashboard/chat/confirmation-card";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingActionId?: string;
}

const SUGGESTED_PROMPTS = [
  "How is business today?",
  "Why is revenue down?",
  "What should I order?",
  "Show tomorrow's schedule.",
];

const CONVERSATION_STORAGE_KEY_PREFIX = "roofops-chat-conversation-";

function rowsToMessages(rows: ChatMessageRow[]): ChatMessage[] {
  // Only user-visible turns render as chat bubbles — tool-call/tool-result
  // rows are plumbing for the model, not something the owner needs to see.
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .filter((r) => r.body.trim().length > 0)
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.body,
      pendingActionId: r.pendingActionId ?? undefined,
    }));
}

export default function ChatPage() {
  const restaurantId = useRestaurantId();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Token-streaming state: the id of the assistant message currently being
  // grown in place, a buffer of deltas not yet flushed to React state, and
  // the pending rAF handle. Batching flush-per-frame (rather than
  // setState-per-token) keeps fast token bursts smooth instead of causing
  // layout jank — a pure frontend rendering concern, not a protocol change.
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingTextRef = useRef("");
  const rafIdRef = useRef<number | null>(null);

  const { send: sendStream, isStreaming } = useChatStream();
  const upload = useUploadAttachment();

  // Restore the last conversation on load so a page refresh doesn't lose
  // history (Phase 2/7 requirement) — a lightweight per-restaurant key
  // rather than a URL param, to keep the route shareable/clean.
  useEffect(() => {
    if (!restaurantId) return;
    const saved = localStorage.getItem(CONVERSATION_STORAGE_KEY_PREFIX + restaurantId);
    if (saved) setConversationId(saved);
  }, [restaurantId]);

  useEffect(() => {
    if (restaurantId && conversationId) {
      localStorage.setItem(CONVERSATION_STORAGE_KEY_PREFIX + restaurantId, conversationId);
    }
  }, [restaurantId, conversationId]);

  const history = useChatMessages(conversationId);
  useEffect(() => {
    if (history.data) setMessages(rowsToMessages(history.data.messages));
  }, [history.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusLabel]);

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  // Flushes buffered token deltas into the streaming message's content —
  // called once per animation frame, not once per token.
  function flushStreamingText() {
    rafIdRef.current = null;
    const id = streamingMessageIdRef.current;
    const text = pendingTextRef.current;
    if (!id || !text) return;
    pendingTextRef.current = "";
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)));
  }

  function scheduleStreamingFlush() {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(flushStreamingText);
  }

  // Drops the in-progress streaming message and resets streaming state —
  // used when a turn ends up not being the final answer after all (e.g. a
  // tool call arrives) or when a turn concludes via done/error, so the
  // next turn always starts clean.
  function resetStreamingMessage(removeDraft: boolean) {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const id = streamingMessageIdRef.current;
    if (removeDraft && id) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
    streamingMessageIdRef.current = null;
    pendingTextRef.current = "";
  }

  async function send(message: string) {
    if (!message.trim() || isStreaming) return;
    appendMessage({ id: crypto.randomUUID(), role: "user", content: message });
    setInput("");
    setStatusLabel("Thinking…");
    resetStreamingMessage(true);

    await sendStream(message, conversationId, (event: ChatStreamEvent) => {
      switch (event.type) {
        case "tool_call_start":
          // A tool call means this turn's answer isn't final yet — drop any
          // premature streamed draft (the backend only streams content
          // while it hasn't seen a tool call, so this is a rare edge case,
          // not the common path) and go back to the step-by-step indicator.
          resetStreamingMessage(true);
          setStatusLabel(toolStatusLabel(event.tool));
          break;
        case "tool_result":
          break;
        case "confirmation_required": {
          resetStreamingMessage(true);
          const data = event.data as { answer: string; pendingActionId: string } | undefined;
          setStatusLabel(null);
          if (data) appendMessage({ id: crypto.randomUUID(), role: "assistant", content: data.answer, pendingActionId: data.pendingActionId });
          break;
        }
        case "token": {
          const delta = String(event.data ?? "");
          if (!delta) break;
          setStatusLabel(null); // stop "Thinking…" the instant real generation starts
          if (!streamingMessageIdRef.current) {
            const id = crypto.randomUUID();
            streamingMessageIdRef.current = id;
            appendMessage({ id, role: "assistant", content: "" });
          }
          pendingTextRef.current += delta;
          scheduleStreamingFlush();
          break;
        }
        case "done": {
          const finalText = String(event.data ?? "");
          const id = streamingMessageIdRef.current;
          resetStreamingMessage(false);
          setStatusLabel(null);
          if (id) {
            // Reconcile with the authoritative final text — guards against
            // any dropped/reordered token frames rather than trusting the
            // client-side concatenation alone.
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: finalText } : m)));
          } else {
            appendMessage({ id: crypto.randomUUID(), role: "assistant", content: finalText });
          }
          break;
        }
        case "conversation":
          setConversationId(event.conversationId);
          break;
        case "error":
          resetStreamingMessage(true);
          setStatusLabel(null);
          appendMessage({ id: crypto.randomUUID(), role: "assistant", content: `Something went wrong: ${event.message}` });
          break;
      }
    });
  }

  const handleFile = useCallback(
    async (file: File) => {
      appendMessage({ id: crypto.randomUUID(), role: "user", content: `📎 ${file.name}` });
      setStatusLabel(`Analyzing ${file.name}…`);
      try {
        const result = await upload.mutateAsync({ file, conversationId });
        setConversationId(result.conversationId);
        appendMessage({ id: crypto.randomUUID(), role: "assistant", content: result.answer });
      } catch (err) {
        appendMessage({
          id: crypto.randomUUID(), role: "assistant",
          content: `I couldn't process that file. ${err instanceof Error ? err.message : ""}`,
        });
      } finally {
        setStatusLabel(null);
      }
    },
    [conversationId, upload],
  );

  if (!restaurantId) {
    return (
      <AppShell title="AI Chat">
        <ConfigMissingBanner />
      </AppShell>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const file = Array.from(e.clipboardData.files)[0];
    if (file) {
      e.preventDefault();
      handleFile(file);
    }
  }

  const busy = isStreaming || upload.isPending;

  return (
    <AppShell title="AI Chat">
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        <div
          ref={scrollRef}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "card-surface relative flex-1 overflow-y-auto p-5 transition-colors",
            isDragging && "outline outline-2 outline-dashed outline-accent",
          )}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm font-medium text-accent">
              Drop a photo or document to analyze it
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Bot className="h-8 w-8 text-accent" />
              <p className="text-muted-foreground">
                Ask anything about today's operations, or drag in a photo/invoice — answers are grounded in your live data.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      m.role === "user" ? "bg-accent/20 text-accent" : "bg-muted text-foreground",
                    )}
                  >
                    {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </span>
                  {m.pendingActionId ? (
                    <ConfirmationCard
                      pendingActionId={m.pendingActionId}
                      summary={m.content}
                      onResolved={(answer) => appendMessage({ id: crypto.randomUUID(), role: "assistant", content: answer })}
                    />
                  ) : (
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-4 py-2.5 text-sm",
                        m.role === "user" ? "bg-accent/15 text-foreground" : "bg-muted/50",
                      )}
                    >
                      {m.role === "assistant" ? <MessageContent content={m.content} /> : m.content}
                    </div>
                  )}
                </div>
              ))}
              {statusLabel && (
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {statusLabel}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="Attach a photo or document"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Ask about revenue, inventory, staffing… or paste/drop a photo"
            className="flex-1 rounded-md border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </AppShell>
  );
}

function toolStatusLabel(tool?: string): string {
  if (!tool) return "Thinking…";
  const [domain] = tool.split("_");
  const labels: Record<string, string> = {
    inventory: "Checking inventory…",
    analytics: "Checking analytics…",
    forecast: "Checking forecast…",
    menu: "Checking the menu…",
    scheduling: "Checking the schedule…",
    knowledge: "Looking that up…",
  };
  return labels[domain] ?? "Checking…";
}
