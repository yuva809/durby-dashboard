"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { DashboardSummary } from "@/types";
import { useRestaurantId } from "./use-restaurant-id";

export function useDashboardSummary(date?: string) {
  const restaurantId = useRestaurantId();
  const qs = date ? `?date=${date}` : "";

  return useQuery({
    queryKey: ["dashboard-summary", restaurantId, date ?? "latest"],
    queryFn: () =>
      apiClient.get<DashboardSummary>(`/restaurants/${restaurantId}/dashboard/summary${qs}`),
    enabled: !!restaurantId,
    refetchInterval: date ? false : 60_000,
    retry: 1,
  });
}

export function useDashboardDataDates() {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["dashboard-data-dates", restaurantId],
    queryFn: () =>
      apiClient.get<{ dates: string[] }>(`/restaurants/${restaurantId}/dashboard/data-dates`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000, // dates don't change often
  });
}
