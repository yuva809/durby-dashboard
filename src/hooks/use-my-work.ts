"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export interface MyShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  hours: number;
}

export type MyWorkOverview =
  | { linked: false }
  | {
      linked: true;
      employee: { id: string; name: string; role: string };
      todayShift: MyShift | null;
      upcomingShifts: MyShift[];
      hoursThisWeek: number;
      hoursThisMonth: number;
    };

export type MyWorkHours =
  | { linked: false }
  | { linked: true; hoursThisWeek: number; hoursThisMonth: number; shiftHistory: MyShift[] };

export type MyWorkSchedule = { linked: false } | { linked: true; shifts: MyShift[] };

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  employee?: { id: string; name: string };
}

export function useMyWorkOverview() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["my-work-overview", restaurantId],
    queryFn: () => apiClient.get<MyWorkOverview>(`/restaurants/${restaurantId}/my-work/overview`),
    enabled: !!restaurantId,
  });
}

export function useMyWorkHours() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["my-work-hours", restaurantId],
    queryFn: () => apiClient.get<MyWorkHours>(`/restaurants/${restaurantId}/my-work/hours`),
    enabled: !!restaurantId,
  });
}

export function useMyWorkSchedule() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["my-work-schedule", restaurantId],
    queryFn: () => apiClient.get<MyWorkSchedule>(`/restaurants/${restaurantId}/my-work/schedule`),
    enabled: !!restaurantId,
  });
}

export function useMyAvailability() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["my-work-availability", restaurantId],
    queryFn: () =>
      apiClient.get<
        | { linked: false }
        | {
            linked: true;
            current: Array<{ id: string; weekday: number; startTime: string; endTime: string; available: boolean }>;
            proposals: Array<{ id: string; weekday: number; startTime: string; endTime: string; available: boolean; status: string }>;
          }
      >(`/restaurants/${restaurantId}/my-work/availability`),
    enabled: !!restaurantId,
  });
}

export function useProposeAvailability() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { weekday: number; startTime: string; endTime: string; available: boolean; note?: string }) =>
      apiClient.post(`/restaurants/${restaurantId}/my-work/availability/proposals`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-work-availability", restaurantId] }),
  });
}

export function useMyLeaveRequests() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["my-leave-requests", restaurantId],
    queryFn: () => apiClient.get<LeaveRequest[]>(`/restaurants/${restaurantId}/my-work/leave`),
    enabled: !!restaurantId,
  });
}

export function useCreateLeaveRequest() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leaveType: "SICK" | "VACATION" | "OTHER"; startDate: string; endDate: string; note?: string }) =>
      apiClient.post<LeaveRequest>(`/restaurants/${restaurantId}/my-work/leave`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-leave-requests", restaurantId] }),
  });
}

export function useCancelLeaveRequest() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leaveId: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/my-work/leave/${leaveId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-leave-requests", restaurantId] }),
  });
}

// ── Manager review surface ──────────────────────────────────────────────────

export function useAllLeaveRequests() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["all-leave-requests", restaurantId],
    queryFn: () => apiClient.get<LeaveRequest[]>(`/restaurants/${restaurantId}/leave-requests`),
    enabled: !!restaurantId,
  });
}

function useReviewLeave(action: "approve" | "reject") {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leaveId: string) =>
      apiClient.patch<LeaveRequest>(`/restaurants/${restaurantId}/leave-requests/${leaveId}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-leave-requests", restaurantId] }),
  });
}

export const useApproveLeave = () => useReviewLeave("approve");
export const useRejectLeave = () => useReviewLeave("reject");
