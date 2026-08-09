"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export interface RoleCoverageRule {
  id: string;
  restaurantId: string;
  role: string;
  canCover: string;
  createdAt: string;
}

export function useRoleCoverageRules() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["role-coverage-rules", restaurantId],
    queryFn: () => apiClient.get<RoleCoverageRule[]>(`/restaurants/${restaurantId}/role-coverage-rules`),
    enabled: !!restaurantId,
  });
}

export function useCreateRoleCoverageRule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { role: string; canCover: string }) =>
      apiClient.post<RoleCoverageRule>(`/restaurants/${restaurantId}/role-coverage-rules`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-coverage-rules", restaurantId] });
    },
  });
}

export function useDeleteRoleCoverageRule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiClient.delete(`/restaurants/${restaurantId}/role-coverage-rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-coverage-rules", restaurantId] });
    },
  });
}
