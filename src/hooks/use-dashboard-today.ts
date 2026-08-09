"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export interface KpiValue {
  value: number;
  target: number;
  diff: number;
  trend: number;
}

export interface CriticalAction {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  href: string;
  type: "compliance" | "inventory" | "alert";
}

export interface TimelineEvent {
  time: string;
  label: string;
  type: "shift_change" | "peak" | "check" | "event";
}

export type StatusLevel = "healthy" | "warning" | "critical";

export interface TodayDashboard {
  date: string;
  isLiveToday: boolean;
  kpis: {
    revenue: KpiValue;
    forecastRevenue: number | null;
    guests: KpiValue;
    labourCostPct: KpiValue;
    foodCostPct: KpiValue;
    profit: KpiValue;
    staffCoverage: number;
    inventoryHealth: number;
    inventoryLowCount: number;
  };
  dailyBrief: string[];
  criticalActions: CriticalAction[];
  timeline: TimelineEvent[];
  status: {
    staffing: StatusLevel;
    inventory: StatusLevel;
    compliance: StatusLevel;
    forecast: StatusLevel;
    integrations: StatusLevel;
  };
}

export function useTodayDashboard() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["dashboard-today", restaurantId],
    queryFn: () => apiClient.get<TodayDashboard>(`/restaurants/${restaurantId}/dashboard/today`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}
