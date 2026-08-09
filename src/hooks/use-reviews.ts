"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewReplyStatus = "PENDING" | "AI_DRAFTED" | "APPROVED" | "EDITED" | "REJECTED" | "PUBLISHED" | "FAILED";
export type ReviewSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type ReviewUrgency = "LOW" | "MEDIUM" | "HIGH";
export type ReviewPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";

export interface GoogleReviewDto {
  id: string;
  reviewerName: string;
  rating: number;
  reviewText: string | null;
  reviewDate: string;
  replyText: string | null;
  replyStatus: ReviewReplyStatus;
  repliedAt: string | null;
  sentiment: ReviewSentiment | null;
  summary: string | null;
  topics: string[];
  urgency: ReviewUrgency | null;
  categories: string[];
  priority: ReviewPriority | null;
  detectedLanguage: string | null;
  aiSuggestedReply: string | null;
  possibleCause: string | null;
  causeConfidence: number | null;
  recommendedFix: string | null;
  assignedToUserId: string | null;
  assignedRole: string | null;
  resolvedAt: string | null;
}

export interface ReviewAnalyticsDto {
  averageRating: number | null;
  totalReviews: number;
  reviewsThisMonth: number;
  positive: number;
  neutral: number;
  negative: number;
  pendingReplies: number;
}

export interface GoogleConnectionStatusDto {
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  lastSync: string | null;
  locationName: string | null;
}

export interface ReviewSettingsDto {
  autoReplyEnabled: boolean;
  autoReplyMinRating: number;
  tone: "PROFESSIONAL" | "FRIENDLY" | "CASUAL" | "PREMIUM";
}

export interface ReviewOperationalTaskDto {
  id: string;
  taskType: string;
  title: string;
  description: string;
  priority: string;
  completedAt: string | null;
  dismissedAt: string | null;
  triggerType: string | null;
  createdAt: string;
}

// ─── Google connection ────────────────────────────────────────────────────────

export function useGoogleConnection() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-google-status", restaurantId],
    queryFn: () => apiClient.get<GoogleConnectionStatusDto>(`/restaurants/${restaurantId}/reviews/google/status`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useStartGoogleOAuth() {
  const restaurantId = useRestaurantId();
  return useMutation({
    mutationFn: () => apiClient.get<{ url: string }>(`/restaurants/${restaurantId}/reviews/google/oauth/start`),
  });
}

export function useDisconnectGoogle() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/restaurants/${restaurantId}/reviews/google/connection`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews-google-status", restaurantId] }),
  });
}

// ─── Reviews list/detail/sync ─────────────────────────────────────────────────

export function useReviewsList(filters?: { status?: string; rating?: number }) {
  const restaurantId = useRestaurantId();
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.rating) params.set("rating", String(filters.rating));
  const qs = params.toString();
  return useQuery({
    queryKey: ["reviews-list", restaurantId, filters?.status, filters?.rating],
    queryFn: () => apiClient.get<GoogleReviewDto[]>(`/restaurants/${restaurantId}/reviews${qs ? `?${qs}` : ""}`),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

export function useSyncReviews() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post(`/restaurants/${restaurantId}/reviews/sync`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews-list", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["reviews-analytics", restaurantId] });
    },
  });
}

// ─── Reply workflow ──────────────────────────────────────────────────────────

function useReplyMutation(action: "approve" | "edit" | "reject") {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, text }: { reviewId: string; text?: string }) =>
      apiClient.patch(`/restaurants/${restaurantId}/reviews/${reviewId}/${action}`, text !== undefined ? (action === "approve" ? { finalText: text } : { newText: text }) : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews-list", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["reviews-analytics", restaurantId] });
    },
  });
}

export const useApproveReply = () => useReplyMutation("approve");
export const useEditReply = () => useReplyMutation("edit");
export const useRejectReply = () => useReplyMutation("reject");

// ─── Analytics & Insights ────────────────────────────────────────────────────

export function useReviewAnalytics() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-analytics", restaurantId],
    queryFn: () => apiClient.get<ReviewAnalyticsDto>(`/restaurants/${restaurantId}/reviews/analytics/overview`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useReviewInsights() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-insights", restaurantId],
    queryFn: () =>
      apiClient.get<{ insights: string[]; recommendedActions: string[] } | null>(
        `/restaurants/${restaurantId}/reviews/analytics/insights`,
      ),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useAggregatedRecommendations() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-recommendations", restaurantId],
    queryFn: () =>
      apiClient.get<Array<{ category: string; recommendation: string; reviewCount: number }>>(
        `/restaurants/${restaurantId}/reviews/analytics/recommendations`,
      ),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useExtendedInsights() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-extended-insights", restaurantId],
    queryFn: () =>
      apiClient.get<{
        mostMentionedTopics: Array<{ label: string; count: number }>;
        mostMentionedStaffTopics: Array<{ label: string; count: number }>;
        mostMentionedComplaints: Array<{ label: string; count: number }>;
      }>(`/restaurants/${restaurantId}/reviews/analytics/extended`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useReputationScoreHistory() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-reputation-score", restaurantId],
    queryFn: () =>
      apiClient.get<Array<{ id: string; score: number; breakdown: Record<string, number>; computedAt: string }>>(
        `/restaurants/${restaurantId}/reviews/analytics/reputation-score`,
      ),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useWeeklyReports() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-weekly-reports", restaurantId],
    queryFn: () =>
      apiClient.get<Array<{ id: string; weekStart: string; weekEnd: string; summary: Record<string, unknown> }>>(
        `/restaurants/${restaurantId}/reviews/weekly-reports`,
      ),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

// ─── Operational tasks ───────────────────────────────────────────────────────

export function useReviewTasks(status: "open" | "completed" | "dismissed" = "open") {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-tasks", restaurantId, status],
    queryFn: () => apiClient.get<ReviewOperationalTaskDto[]>(`/restaurants/${restaurantId}/reviews/tasks?status=${status}`),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

export function useCompleteReviewTask() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.patch(`/restaurants/${restaurantId}/reviews/tasks/${taskId}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews-tasks", restaurantId] }),
  });
}

export function useDismissReviewTask() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.patch(`/restaurants/${restaurantId}/reviews/tasks/${taskId}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews-tasks", restaurantId] }),
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function useReviewSettings() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["reviews-settings", restaurantId],
    queryFn: () => apiClient.get<ReviewSettingsDto>(`/restaurants/${restaurantId}/reviews/settings`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useUpdateReviewSettings() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ReviewSettingsDto>) => apiClient.patch(`/restaurants/${restaurantId}/reviews/settings`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews-settings", restaurantId] }),
  });
}
