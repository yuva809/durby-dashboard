"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type DemandLevel = "low" | "moderate" | "high" | "very_high";
export type StatusLevel = "healthy" | "warning" | "critical";

export interface CriticalAction {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  href: string;
  type: "compliance" | "inventory" | "alert";
}

export interface HourlySlot {
  hour: string;
  guests: number;
  reservations: number;
  walkIns: number;
}

export interface OperationalDashboard {
  date: string;
  demand: {
    expectedGuests: number;
    reservations: number;
    expectedWalkIns: number;
    confidence: number;
    peakTime: string;
    demandLevel: DemandLevel;
    vsNormalDay: number;
    hasForecast: boolean;
  };
  drivers: Array<{ label: string; category: "day" | "weather" | "event" | "pattern" }>;
  hourlyDemand: HourlySlot[];
  walkInRatio: number;
  reservationRatio: number;
  walkInAccuracy: {
    predicted: number;
    actual: number;
    accuracy: number | null;
  } | null;
  operations: {
    peakStaff: number;
    scheduledHours: number;
    scheduledStaff: number;
    staffCoverage: number;
    inventoryUsagePct: number;
    estimatedWaitMinutes: number;
    estimatedCovers: number;
  };
  dailyBrief: string[];
  criticalActions: CriticalAction[];
  status: Record<string, StatusLevel>;
  lowStockCount: number;
}

export interface SignalFactor {
  factor: string;
  emoji: string;
  adjustmentPct: number;
  category: "weather" | "holiday" | "event" | "capacity";
}

export function useOperationalDashboard() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["dashboard-operational", restaurantId],
    queryFn: () =>
      apiClient.get<OperationalDashboard>(`/restaurants/${restaurantId}/dashboard/operational`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}

export function useDemandSignals(restaurantId: string | null) {
  return useQuery({
    queryKey: ["forecast-signals-op", restaurantId],
    queryFn: () =>
      apiClient.get<{
        revenue: {
          days: Array<{
            factors: SignalFactor[];
            explanation: string;
            totalAdjustmentPct: number;
          }>;
        };
      }>(`/restaurants/${restaurantId}/forecast/adjusted?days=2`),
    enabled: !!restaurantId,
    retry: false,
    staleTime: 30 * 60_000,
  });
}
