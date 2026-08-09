"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

interface ChatResponse {
  conversationId: string;
  answer: string;
}

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "tool" | null;
  body: string;
  toolCalls: Array<{ id: string; name: string; arguments: unknown }> | null;
  toolResults: Array<{ toolCallId: string; result: unknown }> | null;
  attachments: Array<{ mimeType: string; filename: string; kind: string }> | null;
  pendingActionId: string | null;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  lastMessageAt: string;
  createdAt: string;
}

export function useChat() {
  const restaurantId = useRestaurantId();

  return useMutation({
    mutationFn: ({ message, conversationId }: { message: string; conversationId?: string }) =>
      apiClient.post<ChatResponse>(`/restaurants/${restaurantId}/chat`, { message, conversationId }),
  });
}

export function useChatConversations() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["chat-conversations", restaurantId],
    queryFn: () => apiClient.get<ConversationRow[]>(`/restaurants/${restaurantId}/chat/conversations`),
    enabled: !!restaurantId,
  });
}

export function useChatMessages(conversationId: string | undefined) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["chat-messages", restaurantId, conversationId],
    queryFn: () =>
      apiClient.get<{ conversation: ConversationRow; messages: ChatMessageRow[] }>(
        `/restaurants/${restaurantId}/chat/conversations/${conversationId}/messages`,
      ),
    enabled: !!restaurantId && !!conversationId,
  });
}

export function useConfirmPendingAction() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pendingActionId: string) =>
      apiClient.post<ChatResponse>(`/restaurants/${restaurantId}/chat/pending-actions/${pendingActionId}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
  });
}

export function useCancelPendingAction() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pendingActionId: string) =>
      apiClient.post<{ conversationId: string; status: string }>(
        `/restaurants/${restaurantId}/chat/pending-actions/${pendingActionId}/cancel`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
  });
}

export function useUploadAttachment() {
  const restaurantId = useRestaurantId();
  return useMutation({
    mutationFn: ({ file, conversationId }: { file: File; conversationId?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (conversationId) form.append("conversationId", conversationId);
      return apiClient.post<ChatResponse>(`/restaurants/${restaurantId}/chat/attachments`, form);
    },
  });
}
