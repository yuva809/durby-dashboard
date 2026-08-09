"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export interface ComparisonKpi {
  current: number;
  previous: number;
  change: number;
  changePct: number;
  better: boolean;
}

export interface AnalyticsData {
  period: {
    days: number;
    from: string;
    to: string;
    prevFrom: string;
    prevTo: string;
  };
  executive: {
    revenue: ComparisonKpi;
    profit: ComparisonKpi;
    labourCostPct: ComparisonKpi;
    foodCostPct: ComparisonKpi;
    guests: ComparisonKpi;
    avgSpend: ComparisonKpi;
    forecastAccuracy: number;
  };
  revenueTrend: { date: string; revenue: number; profit: number; guests: number }[];
  costTrend: { date: string; labour: number; food: number; margin: number }[];
  forecastAccuracy: { date: string; predicted: number; actual: number }[];
  workforce: {
    totalHours: number;
    avgHoursPerEmployee: number;
    shiftCount: number;
    uniqueEmployees: number;
    cancellationRate: number;
  };
  inventory: {
    totalItems: number;
    lowStockCount: number;
    healthPct: number;
  };
  aiImpact: {
    stockoutsPrevented: number;
    complianceViolationsPrevented: number;
    staffingGapsClosed: number;
    wasteCasesHandled: number;
    totalAlertsResolved: number;
    estimatedSavings: number;
    forecastAccuracy: number;
  };
}

export function useAnalyticsData(days: number) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["analytics-data", restaurantId, days],
    queryFn: () =>
      apiClient.get<AnalyticsData>(`/restaurants/${restaurantId}/analytics/data?days=${days}`),
    enabled: !!restaurantId,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
