"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ─── Types (mirror compliance.types.ts) ──────────────────────────────────────

export type DataSource = "EXTERNAL" | "CSV" | "MANUAL";
export type ComplianceStatus = "COMPLIANT" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TaskType =
  | "REQUEST_DOCUMENT"
  | "SCHEDULE_TRAINING"
  | "REVIEW_CONTRACT"
  | "UPDATE_CERTIFICATION"
  | "WORK_AUTH_RENEWAL"
  | "MISSING_DOCUMENT";

export interface ComplianceTaskDto {
  id: string;
  taskType: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  employeeName: string | null;
  profileId: string | null;
  createdAt: string;
}

export interface EmployeeComplianceListItemDto {
  employeeId: string;
  name: string;
  role: string;
  contractType: string;
  complianceScore: number;
  complianceStatus: ComplianceStatus;
  openTaskCount: number;
  criticalIssueCount: number;
  upcomingExpirations: number;
  dataSource: DataSource;
  profileId: string | null;
}

export interface ComplianceDashboardDto {
  overallScore: number;
  totalEmployees: number;
  fullyCompliant: number;
  warningCount: number;
  criticalCount: number;
  upcomingExpirations: number;
  pendingTasks: number;
  employees: EmployeeComplianceListItemDto[];
  recentTasks: ComplianceTaskDto[];
}

export interface ComplianceDocumentDto {
  id: string;
  documentType: string;
  fileName: string | null;
  expiryDate: string | null;
  isValid: boolean;
  dataSource: DataSource;
  notes: string | null;
  daysUntilExpiry: number | null;
}

export interface TrainingRecordDto {
  id: string;
  trainingType: string;
  completedAt: string | null;
  expiryDate: string | null;
  provider: string | null;
  dataSource: DataSource;
  daysUntilExpiry: number | null;
}

export interface CertificationDto {
  id: string;
  certificationName: string;
  certificationCategory: string | null;
  expiryDate: string | null;
  issuingBody: string | null;
  requiredForRoles: string[];
  dataSource: DataSource;
  daysUntilExpiry: number | null;
}

export interface EmployeeComplianceDetailDto extends EmployeeComplianceListItemDto {
  contractStart: string | null;
  contractEnd: string | null;
  isWorkingStudent: boolean;
  university: string | null;
  currentSemester: number | null;
  matriculationExpiry: string | null;
  workAuthType: string | null;
  workAuthExpiry: string | null;
  notes: string | null;
  documents: ComplianceDocumentDto[];
  trainings: TrainingRecordDto[];
  certifications: CertificationDto[];
  tasks: ComplianceTaskDto[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useComplianceDashboard() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["compliance-dashboard", restaurantId],
    queryFn: () =>
      apiClient.get<ComplianceDashboardDto>(`/restaurants/${restaurantId}/compliance/dashboard`),
    enabled: !!restaurantId,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useComplianceTasks(status?: "open" | "completed" | "dismissed") {
  const restaurantId = useRestaurantId();
  const qs = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["compliance-tasks", restaurantId, status ?? "all"],
    queryFn: () =>
      apiClient.get<ComplianceTaskDto[]>(`/restaurants/${restaurantId}/compliance/tasks${qs}`),
    enabled: !!restaurantId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCompleteTask() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/compliance/tasks/${taskId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
      qc.invalidateQueries({ queryKey: ["compliance-tasks", restaurantId] });
    },
  });
}

export function useDismissTask() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/compliance/tasks/${taskId}/dismiss`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
      qc.invalidateQueries({ queryKey: ["compliance-tasks", restaurantId] });
    },
  });
}

export function useRunMonitoring() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ tasksCreated: number; alertsCreated: number }>(
        `/restaurants/${restaurantId}/compliance/monitor`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
      qc.invalidateQueries({ queryKey: ["compliance-tasks", restaurantId] });
      qc.invalidateQueries({ queryKey: ["alerts", restaurantId] });
    },
  });
}

export function useEmployeeComplianceDetail(employeeId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["compliance-employee", restaurantId, employeeId],
    queryFn: () =>
      apiClient.get<EmployeeComplianceDetailDto>(
        `/restaurants/${restaurantId}/compliance/employees/${employeeId!}`,
      ),
    enabled: !!restaurantId && !!employeeId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useUpsertComplianceProfile() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: Record<string, unknown> }) =>
      apiClient.patch(
        `/restaurants/${restaurantId}/compliance/employees/${employeeId}/profile`,
        dto,
      ),
    onSuccess: (_data, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
      qc.invalidateQueries({ queryKey: ["compliance-employee", restaurantId, employeeId] });
    },
  });
}

export function useAddDocument() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: Record<string, unknown> }) =>
      apiClient.post<ComplianceDocumentDto>(
        `/restaurants/${restaurantId}/compliance/employees/${employeeId}/documents`,
        dto,
      ),
    onSuccess: (_data, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ["compliance-employee", restaurantId, employeeId] });
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
    },
  });
}

export function useAddTraining() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: Record<string, unknown> }) =>
      apiClient.post<TrainingRecordDto>(
        `/restaurants/${restaurantId}/compliance/employees/${employeeId}/training`,
        dto,
      ),
    onSuccess: (_data, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ["compliance-employee", restaurantId, employeeId] });
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
    },
  });
}

export function useAddCertification() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, dto }: { employeeId: string; dto: Record<string, unknown> }) =>
      apiClient.post<CertificationDto>(
        `/restaurants/${restaurantId}/compliance/employees/${employeeId}/certifications`,
        dto,
      ),
    onSuccess: (_data, { employeeId }) => {
      qc.invalidateQueries({ queryKey: ["compliance-employee", restaurantId, employeeId] });
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
    },
  });
}
