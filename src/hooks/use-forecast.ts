"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ── Baseline types ────────────────────────────────────────────────────────────

export interface ForecastDay {
  date: string;
  predicted: number;
  sampleSize: number;
  confidence: number;
}

export interface ForecastResult {
  type: string;
  unit: string;
  method: "day_of_week_average_28d" | "revenue_derived_28d" | "insufficient_data";
  explanation: string;
  days: ForecastDay[];
}

export interface ForecastSummary {
  generatedAt: string;
  restaurantId: string;
  daysAhead: number;
  revenue: ForecastResult;
  guests: ForecastResult;
  inventory: ForecastResult;
  staff: ForecastResult;
}

// ── Adjusted types ────────────────────────────────────────────────────────────

export interface AdjustmentFactor {
  factor: string;
  category: "weather" | "holiday" | "event" | "capacity";
  emoji: string;
  adjustmentPct: number;
}

export interface ConfidenceBreakdown {
  overallScore: number;
  components: { historyDepth: number; dataCompleteness: number; signalQuality: number };
  explanation: string;
}

export interface AdjustedForecastDay {
  date: string;
  baselinePredicted: number;
  adjustedPredicted: number;
  sampleSize: number;
  baselineConfidence: number;
  adjustedConfidence: number;
  totalAdjustmentPct: number;
  factors: AdjustmentFactor[];
  explanation: string;
  signalsUsed: string[];
  // Backend always sends this (adjustment/confidence-engine.ts) — optional
  // here only so older cached React Query data doesn't break type-narrowing
  // mid-transition; no UI reads it yet (a future "why is confidence low"
  // surface, see FORECASTING_NEXT_GEN_ROADMAP.md Part 12).
  confidenceBreakdown?: ConfidenceBreakdown;
}

export interface AdjustedForecastResult {
  type: string;
  unit: string;
  days: AdjustedForecastDay[];
}

export interface AdjustedForecastSummary {
  generatedAt: string;
  restaurantId: string;
  daysAhead: number;
  providersActive: string[];
  revenue: AdjustedForecastResult;
  guests: AdjustedForecastResult;
  inventory: AdjustedForecastResult;
  staff: AdjustedForecastResult;
  reservationsByDate: Record<string, number>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useForecastSummary(daysAhead = 7) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["forecast-summary", restaurantId, daysAhead],
    queryFn: () =>
      apiClient.get<ForecastSummary>(
        `/restaurants/${restaurantId}/forecast/summary?days=${daysAhead}`
      ),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

export function useAdjustedForecast(daysAhead = 7) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["forecast-adjusted", restaurantId, daysAhead],
    queryFn: () =>
      apiClient.get<AdjustedForecastSummary>(
        `/restaurants/${restaurantId}/forecast/adjusted?days=${daysAhead}`
      ),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}
