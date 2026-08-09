"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ─── Types (mirror the backend workforce module) ─────────────────────────────

export interface WorkforceLookupDto {
  id: string;
  restaurantId: string;
  name: string;
  archived: boolean;
  departmentId?: string | null; // roles only
  createdAt: string;
}

export type WorkforceRuleType =
  | "NEVER_WEEKDAY"
  | "ONLY_WEEKDAYS"
  | "MAX_WEEKLY_HOURS"
  | "MAX_SHIFTS_PER_WEEK"
  | "ONLY_SHIFT_TYPE"
  | "CANNOT_OPEN"
  | "CANNOT_CLOSE"
  | "CANNOT_WORK_ALONE"
  | "MUST_WORK_WITH_SENIOR"
  | "MIN_HOURS_BETWEEN_SHIFTS"
  | "PREFERRED_CONSECUTIVE_DAYS";

export type WorkforceRuleSeverity = "HARD" | "SOFT";

export interface WorkforceRuleDto {
  id: string;
  restaurantId: string;
  employeeId: string | null;
  type: WorkforceRuleType;
  severity: WorkforceRuleSeverity;
  params: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

export interface EmployeeWorkforceProfileDto {
  id: string;
  name: string;
  role: string;
  contractType: string;
  maxWeeklyHrs: number;
  weeklyContractedHours: number | null;
  department: WorkforceLookupDto | null;
  experienceLevel: string | null;
  languages: string[];
  preferredShiftTypes: string[];
  preferredWeekdays: number[];
  preferredLocationIds: string[];
  notes: string | null;
  skills: WorkforceLookupDto[];
  availability: { weekday: number; startTime: string; endTime: string; available: boolean }[];
  workRules: WorkforceRuleDto[];
  certifications: { certificationName: string; expiryDate: string | null }[];
  trainings: { trainingType: string; completedAt: string | null }[];
}

export interface UpsertWorkforceProfileInput {
  departmentId?: string | null;
  experienceLevel?: string | null;
  languages?: string[];
  preferredShiftTypes?: string[];
  preferredWeekdays?: number[];
  notes?: string | null;
  skillIds?: string[];
  role?: string;
}

// ─── Lookups: Department / Role / Skill ──────────────────────────────────────

type LookupKind = "departments" | "roles" | "skills";

function useLookupList(kind: LookupKind) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["workforce", kind, restaurantId],
    queryFn: () => apiClient.get<WorkforceLookupDto[]>(`/restaurants/${restaurantId}/workforce/${kind}`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

function useCreateLookup(kind: LookupKind) {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; departmentId?: string }) =>
      apiClient.post<WorkforceLookupDto>(`/restaurants/${restaurantId}/workforce/${kind}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workforce", kind, restaurantId] }),
  });
}

function useArchiveLookup(kind: LookupKind) {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/workforce/${kind}/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workforce", kind, restaurantId] }),
  });
}

export const useWorkforceDepartments = () => useLookupList("departments");
export const useCreateWorkforceDepartment = () => useCreateLookup("departments");
export const useArchiveWorkforceDepartment = () => useArchiveLookup("departments");

export const useWorkforceRoles = () => useLookupList("roles");
export const useCreateWorkforceRole = () => useCreateLookup("roles");
export const useArchiveWorkforceRole = () => useArchiveLookup("roles");

export const useWorkforceSkills = () => useLookupList("skills");
export const useCreateWorkforceSkill = () => useCreateLookup("skills");
export const useArchiveWorkforceSkill = () => useArchiveLookup("skills");

// ─── Employee Profile ─────────────────────────────────────────────────────────

export function useEmployeeWorkforceProfile(employeeId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["workforce-profile", restaurantId, employeeId],
    queryFn: () =>
      apiClient.get<EmployeeWorkforceProfileDto>(
        `/restaurants/${restaurantId}/workforce/employees/${employeeId}/profile`,
      ),
    enabled: !!restaurantId && !!employeeId,
  });
}

export function useUpdateEmployeeWorkforceProfile(employeeId: string | null) {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertWorkforceProfileInput) =>
      apiClient.patch<EmployeeWorkforceProfileDto>(
        `/restaurants/${restaurantId}/workforce/employees/${employeeId}/profile`,
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workforce-profile", restaurantId, employeeId] });
      // Role changes go through recordRoleChange, which also touches the
      // scheduling roster/role-history views.
      qc.invalidateQueries({ queryKey: ["scheduling"] });
    },
  });
}

// ─── Work Rules ───────────────────────────────────────────────────────────────

export function useWorkforceRules(employeeId?: string) {
  const restaurantId = useRestaurantId();
  const qs = employeeId ? `?employeeId=${employeeId}` : "";
  return useQuery({
    queryKey: ["workforce-rules", restaurantId, employeeId ?? "all"],
    queryFn: () => apiClient.get<WorkforceRuleDto[]>(`/restaurants/${restaurantId}/workforce/rules${qs}`),
    enabled: !!restaurantId,
  });
}

export function useCreateWorkforceRule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      employeeId?: string | null;
      type: WorkforceRuleType;
      severity?: WorkforceRuleSeverity;
      params?: Record<string, unknown>;
    }) => apiClient.post<WorkforceRuleDto>(`/restaurants/${restaurantId}/workforce/rules`, input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["workforce-rules", restaurantId] });
      if (variables.employeeId) {
        qc.invalidateQueries({ queryKey: ["workforce-profile", restaurantId, variables.employeeId] });
      }
    },
  });
}

export function useDeactivateWorkforceRule() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiClient.delete(`/restaurants/${restaurantId}/workforce/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workforce-rules", restaurantId] });
      qc.invalidateQueries({ queryKey: ["workforce-profile", restaurantId] });
    },
  });
}
