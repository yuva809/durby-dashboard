"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeAvailabilityDto {
  weekday: number; // 0=Mon … 6=Sun
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface EmployeeLeaveDto {
  id: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  approved: boolean;
  note?: string;
}

export interface ScheduleEmployeeDto {
  id: string;
  name: string;
  role: string;
  secondaryRoles: string[];
  contractType: string;
  weeklyContractedHours: number | null;
  maxWeeklyHrs: number;
  hourlyWage: number;
  skills: string[];
  availability: EmployeeAvailabilityDto[];
  leaves: EmployeeLeaveDto[];
}

export interface ScheduledShiftDto {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  role: string;
  hours: number;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
}

export interface RoleCoverage {
  role: string;
  required: number;
  filled: number;
  deficit: number;
  additionalHoursNeeded: number;
}

export interface DemandFactor {
  category: "weather" | "holiday" | "event" | "capacity";
  description: string;
  adjustmentPct: number;
}

export interface DailyExpectedDemand {
  date: string;
  confirmedReservations: number;
  forecastedWalkIns: number;
  expectedGuests: number;
  baselineForecast: number;
  totalAdjustmentPct: number;
  factors: DemandFactor[];
  reservationsExceedForecast: boolean;
  reasoning: string[];
  forecastCoverage: "adjusted" | "reservations_only";
}

export interface AiScheduleSummary {
  forecastedGuests: number;
  forecastedRevenue: number;
  totalStaffHours: number;
  employeesScheduled: number;
  coveragePct: number;
  labourCost: number;
  warnings: string[];
  coverageByRole: RoleCoverage[];
  estimatedAdditionalHours: number;
  demandBreakdown: DailyExpectedDemand[];
}

export interface WeeklyScheduleDto {
  id: string;
  weekStart: string;
  status: "DRAFT" | "APPROVED";
  generatedAt: string;
  approvedAt: string | null;
  aiSummary: AiScheduleSummary;
  shifts: ScheduledShiftDto[];
  employees: ScheduleEmployeeDto[];
}

export interface ReassignImpact {
  prevWeeklyHours: number;
  newWeeklyHours: number;
  maxHours: number;
}

export interface ReassignResult {
  shift: ScheduledShiftDto;
  fromEmployeeId: string;
  toEmployeeId: string;
  impactFrom: ReassignImpact;
  impactTo: ReassignImpact;
  violations: string[];
}

export interface ReplacementSuggestion {
  employee: ScheduleEmployeeDto;
  scheduledHours: number;
  afterHours: number;
  maxHours: number;
  roleMatch: "primary" | "secondary";
  overtimeRisk: boolean;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useWeeklySchedule(weekStart: string) {
  const restaurantId = useRestaurantId();
  return useQuery<WeeklyScheduleDto | null>({
    queryKey: ["schedule", restaurantId, weekStart],
    queryFn: async () => {
      try {
        return await apiClient.get<WeeklyScheduleDto>(
          `/restaurants/${restaurantId}/scheduling/schedule/${weekStart}`,
        );
      } catch (err) {
        // Backend returns an empty body (parsed as null) or 404 when no schedule exists
        if (err instanceof ApiError && err.status === 404) return null;
        if (err instanceof SyntaxError) return null; // empty 200 body
        throw err;
      }
    },
    staleTime: 30_000,
    enabled: !!restaurantId && !!weekStart,
    retry: 1,
  });
}

export function useGenerateSchedule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStart: string) => {
      const data = await apiClient.post<WeeklyScheduleDto>(
        `/restaurants/${restaurantId}/scheduling/generate`,
        { weekStart },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["schedule", restaurantId, data.weekStart], data);
    },
  });
}

export function useApproveSchedule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      apiClient.post<WeeklyScheduleDto>(
        `/restaurants/${restaurantId}/scheduling/schedule/${scheduleId}/approve`,
      ),
    onSuccess: (data) => {
      qc.setQueryData(["schedule", restaurantId, data.weekStart], data);
    },
  });
}

export function useUpdateShift() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shiftId,
      scheduleWeekStart,
      dto,
    }: {
      shiftId: string;
      scheduleWeekStart: string;
      dto: { startTime?: string; endTime?: string; role?: string; status?: string; employeeId?: string };
    }) => {
      const updated = await apiClient.patch<ScheduledShiftDto>(
        `/restaurants/${restaurantId}/scheduling/shifts/${shiftId}`,
        dto,
      );
      return { shiftId, scheduleWeekStart, updated };
    },
    onSuccess: ({ scheduleWeekStart, updated }) => {
      qc.setQueryData<WeeklyScheduleDto | null>(
        ["schedule", restaurantId, scheduleWeekStart],
        (prev) =>
          prev
            ? { ...prev, shifts: prev.shifts.map((s) => (s.id === updated.id ? updated : s)) }
            : prev,
      );
    },
  });
}

export function useReassignShift() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shiftId,
      toEmployeeId,
    }: {
      shiftId: string;
      toEmployeeId: string;
      scheduleWeekStart: string;
    }) =>
      apiClient.post<ReassignResult>(
        `/restaurants/${restaurantId}/scheduling/shifts/${shiftId}/reassign`,
        { toEmployeeId },
      ),
    onSuccess: (result, { scheduleWeekStart }) => {
      qc.setQueryData<WeeklyScheduleDto | null>(
        ["schedule", restaurantId, scheduleWeekStart],
        (prev) =>
          prev
            ? { ...prev, shifts: prev.shifts.map((s) => (s.id === result.shift.id ? result.shift : s)) }
            : prev,
      );
    },
  });
}

export function useRebalance() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
    }: {
      scheduleId: string;
      scheduleWeekStart: string;
    }) =>
      apiClient.post<{ schedule: WeeklyScheduleDto; gapsFilled: number }>(
        `/restaurants/${restaurantId}/scheduling/schedule/${scheduleId}/rebalance`,
      ),
    onSuccess: ({ schedule }, { scheduleWeekStart }) => {
      qc.setQueryData(["schedule", restaurantId, scheduleWeekStart], schedule);
    },
  });
}
