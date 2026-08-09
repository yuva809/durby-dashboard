"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AlertItem } from "@/types";
import { useRestaurantId } from "./use-restaurant-id";

export function useAlerts() {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["alerts", restaurantId],
    queryFn: () => apiClient.get<AlertItem[]>(`/restaurants/${restaurantId}/alerts`),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
  });
}

export function useResolveAlert() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/alerts/${alertId}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary", restaurantId] });
    },
  });
}
