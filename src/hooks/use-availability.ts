"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AvailabilityProposal {
  id: string;
  weekday: number; // 0=Mon … 6=Sun
  // Present → one-off exception for this calendar date; null → recurring weekly pattern
  date: string | null;
  startTime: string;
  endTime: string;
  available: boolean;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface AvailabilityMessage {
  id: string;
  direction: "IN" | "OUT";
  channel: string;
  body: string;
  parseStatus: "PENDING" | "PARSED" | "FAILED" | "N_A";
  parseError: string | null;
  createdAt: string;
  employee: { id: string; name: string; role: string };
  proposals: AvailabilityProposal[];
}

export interface AvailabilityInbox {
  messages: AvailabilityMessage[];
  pendingCount: number;
}

export interface EmployeeWeeklyAvailability {
  id: string;
  name: string;
  role: string;
  availability: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    available: boolean;
  }>;
  availabilityOverrides: Array<{
    date: string;
    startTime: string;
    endTime: string;
    available: boolean;
    note: string;
  }>;
}

export interface SubmitReplyResult {
  messageId: string;
  parseStatus: "PARSED" | "FAILED";
  summary?: string;
  confidence?: number;
  proposalsCreated?: number;
  parseError?: string;
}

export interface EmployeeAvailabilityStatus {
  employeeId: string;
  employeeName: string;
  role: string;
  status: "replied" | "pending" | "not_requested";
  requestedAt: string | null;
  repliedAt: string | null;
  remindersSent: number;
}

export interface AvailabilityStatusSummary {
  totalEmployees: number;
  repliedCount: number;
  pendingCount: number;
  notRequestedCount: number;
  remindersSent: number;
  estimatedCompletionAt: string | null;
  employees: EmployeeAvailabilityStatus[];
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

// WhatsApp replies land via webhook, outside any user action in this tab —
// polling is how the dashboard notices without a manual refresh. 10s keeps
// "18/21 replied -> 19/21 replied" feeling close to real-time without the
// cost of a websocket/SSE layer for what's still a low-frequency event
// (a handful of replies per outreach round, not a live chat feed).
const AVAILABILITY_POLL_INTERVAL_MS = 10_000;

export function useAvailabilityInbox() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["availability-inbox", restaurantId],
    queryFn: () =>
      apiClient.get<AvailabilityInbox>(`/restaurants/${restaurantId}/availability/inbox`),
    enabled: !!restaurantId,
    refetchInterval: AVAILABILITY_POLL_INTERVAL_MS,
  });
}

export function useCurrentAvailability() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["availability-current", restaurantId],
    queryFn: () =>
      apiClient.get<{ employees: EmployeeWeeklyAvailability[] }>(
        `/restaurants/${restaurantId}/availability/current`,
      ),
    enabled: !!restaurantId,
  });
}

export function useRequestAvailability() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ requested: number; channel: string }>(
        `/restaurants/${restaurantId}/availability/request`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["availability-inbox", restaurantId] }),
  });
}

export function useSubmitReply() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { employeeId: string; message: string }) =>
      apiClient.post<SubmitReplyResult>(
        `/restaurants/${restaurantId}/availability/inbound`,
        payload,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["availability-inbox", restaurantId] }),
  });
}

export function useAvailabilityStatus() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["availability-status", restaurantId],
    queryFn: () =>
      apiClient.get<AvailabilityStatusSummary>(`/restaurants/${restaurantId}/availability/status`),
    enabled: !!restaurantId,
    refetchInterval: AVAILABILITY_POLL_INTERVAL_MS,
  });
}

export function useResendReminder() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) =>
      apiClient.post<{ employeeId: string; reminderSent: boolean; channel: string }>(
        `/restaurants/${restaurantId}/availability/employees/${employeeId}/remind`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["availability-status", restaurantId] }),
  });
}

export function useReviewProposal() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { proposalId: string; action: "approve" | "reject" }) =>
      apiClient.patch<{ id: string; status: string }>(
        `/restaurants/${restaurantId}/availability/proposals/${payload.proposalId}`,
        { action: payload.action },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability-inbox", restaurantId] });
      qc.invalidateQueries({ queryKey: ["availability-current", restaurantId] });
    },
  });
}
