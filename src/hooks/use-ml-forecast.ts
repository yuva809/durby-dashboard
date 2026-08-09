"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// First frontend consumer of the ML forecast endpoints (train/predict/evaluate/
// retraining-readiness) — see docs/architecture/FORECASTING_NEXT_GEN_ROADMAP.md Part 2/21
// Phase 1. Minimal by design: surfaces whether a model exists, whether it thinks it should
// be retrained, and lets a manager trigger training manually — retraining stays a deliberate,
// human-triggered action even when the readiness signal says yes (see
// RetrainingReadinessService's own doc comment on the backend).

const WALK_INS_TASK = "walk_ins";

export interface ActiveMlModel {
  id: string;
  algorithm: string;
  trainedAt: string;
  sampleSizeTrain: number;
  sampleSizeValidation: number;
  metrics: { mae: number; rmse: number; mape: number | null };
}

export interface RetrainingReadiness {
  activeModelId: string;
  algorithm: string;
  trainedAt: string;
  daysSinceTraining: number;
  newTrainingRowsSinceModel: number;
  trainingValidationMae: number;
  liveAccuracy: { mae: number; rmse: number; mape: number | null; sampleSize: number } | null;
  shouldRetrain: boolean;
  reasons: string[];
}

export interface AccuracyMetrics {
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  wape: number | null;
  sampleSize: number;
}

export interface AccuracySummary {
  reconciledCount: number;
  rule: AccuracyMetrics;
  ml: AccuracyMetrics | null;
}

export function useActiveMlModel(task: string = WALK_INS_TASK) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["ml-active-model", restaurantId, task],
    queryFn: () =>
      apiClient.get<ActiveMlModel | null>(`/restaurants/${restaurantId}/ml/models/active?task=${task}`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useRetrainingReadiness(task: string = WALK_INS_TASK) {
  const restaurantId = useRestaurantId();
  const { data: activeModel } = useActiveMlModel(task);
  return useQuery({
    queryKey: ["ml-retraining-readiness", restaurantId, task],
    queryFn: () =>
      apiClient.get<RetrainingReadiness>(`/restaurants/${restaurantId}/ml/models/retraining-readiness?task=${task}`),
    // Only worth asking once a model actually exists — the endpoint 404s otherwise.
    enabled: !!restaurantId && !!activeModel,
    staleTime: 5 * 60_000,
  });
}

export function useForecastAccuracySummary() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["forecast-accuracy-summary", restaurantId],
    queryFn: () =>
      apiClient.get<AccuracySummary>(`/restaurants/${restaurantId}/ml/forecast-evaluations/accuracy-summary`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useTrainMlModel(task: string = WALK_INS_TASK) {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<ActiveMlModel>(`/restaurants/${restaurantId}/ml/models/train`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ml-active-model", restaurantId, task] });
      queryClient.invalidateQueries({ queryKey: ["ml-retraining-readiness", restaurantId, task] });
    },
  });
}
