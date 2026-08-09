"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type StaffingRecommendationType = "HIRE" | "CROSS_TRAIN" | "HOURS_INCREASE";
export type StaffingRecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface StaffingRecommendation {
  type: StaffingRecommendationType;
  role: string;
  description: string;
  detail: Record<string, number | string>;
}

export interface StaffingRecommendationResult {
  currentCoveragePct: number;
  projectedCoveragePct: number;
  confidence: StaffingRecommendationConfidence;
  assumptions: string[];
  recommendations: StaffingRecommendation[];
}

// Not auto-fetched (enabled: false) — this re-runs several what-if
// simulations server-side and is meaningfully heavier than a normal GET, so
// it's triggered on demand via refetch() from a button rather than firing
// on every page load.
export function useStaffingRecommendations(weekStart: string) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["staffing-recommendations", restaurantId, weekStart],
    queryFn: () =>
      apiClient.get<StaffingRecommendationResult>(
        `/restaurants/${restaurantId}/scheduling/schedule/${weekStart}/staffing-recommendations`,
      ),
    enabled: false,
    retry: false,
  });
}
