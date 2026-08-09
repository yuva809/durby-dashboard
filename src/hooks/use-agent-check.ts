"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";
import type { DecisionEngineResult } from "@/types/decision-engine";

export type AgentDomain =
  | "inventory"
  | "scheduling"
  | "compliance"
  | "finance"
  | "analytics"
  | "marketing"
  | "supplier";

export function useAgentCheck(domain: AgentDomain) {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["agent-check", domain, restaurantId],
    queryFn: () =>
      apiClient.get<DecisionEngineResult>(`/restaurants/${restaurantId}/${domain}/ai-check`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}
