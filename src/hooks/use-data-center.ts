"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { uploadFileWithProgress } from "@/lib/upload-with-progress";
import { useRestaurantId } from "./use-restaurant-id";

export type DatasetType =
  | "inventory"
  | "sales"
  | "employees"
  | "shifts"
  | "reservations"
  | "suppliers"
  | "expenses"
  | "orders"
  | "full_export"
  | "compliance_documents"
  | "compliance_training"
  | "compliance_certifications"
  | "compliance_contracts";

export type ImportStage = "queued" | "parsing" | "writing" | "agents_running" | "completed" | "failed";

export type ImportStatus =
  | "queued"
  | "processing"
  | "agents_queued"
  | "agents_running"
  | "completed"
  | "failed";

export interface ImportLog {
  id: string;
  restaurantId: string;
  datasetType: string;
  mode: string;
  status: ImportStatus;
  rowsImported: number;
  rowsFailed: number;
  errors: string[];
  agentsTriggered: string[];
  agentsCompletedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  stage: ImportStage;
  totalRows: number | null;
  rowsProcessed: number;
}

export interface DatasetStatus {
  datasetType: DatasetType;
  lastImport: ImportLog | null;
  recordCount: number;
}

// The upload request now returns as soon as the file is received and
// queued — parsing, DB writes, and AI agents all happen in the background
// (see ImportLog.stage, surfaced via useDataCenterStatus's polling below).
export interface EnqueueResult {
  importLogId: string;
  datasetType: DatasetType;
  mode: string;
  stage: ImportStage;
  /** false when Redis was unreachable and the import ran inline instead
   *  of via the background queue — processing still happens, just without
   *  BullMQ's retry semantics. */
  queued: boolean;
}

// Any of these means "work is still happening, poll fast" — covers the
// whole pipeline (upload received → parsing → writing → agents), not just
// the old agent-only window.
const ACTIVE_STATUSES: ImportStatus[] = ["queued", "processing", "agents_queued", "agents_running"];

function isAnyActive(statuses: DatasetStatus[] | undefined): boolean {
  return (statuses ?? []).some((s) => s.lastImport && ACTIVE_STATUSES.includes(s.lastImport.status));
}

// Which other pages' caches a completed import for this dataset type
// should refresh — replaces the old "invalidate dashboard-summary and
// inventory-ai-check unconditionally on every import" behavior. Scoped to
// the datasets that actually feed each of those views.
const DASHBOARD_AFFECTING: DatasetType[] = ["sales", "inventory", "orders", "expenses", "full_export"];
const INVENTORY_AFFECTING: DatasetType[] = ["inventory", "orders", "full_export"];

export function useDataCenterStatus() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  // Tracks the last-seen stage per dataset type so scoped invalidation
  // fires exactly once on the queued/running -> completed transition, not
  // on every 4s poll while a completed import just sits there.
  const lastSeenStage = useRef<Map<DatasetType, ImportStage>>(new Map());

  const query = useQuery({
    queryKey: ["data-center-status", restaurantId],
    queryFn: () =>
      apiClient.get<DatasetStatus[]>(`/restaurants/${restaurantId}/data-center/status`),
    enabled: !!restaurantId,
    staleTime: 5_000,
    // Poll every 4 seconds while anything is still in flight, then back off.
    refetchInterval: (query) => (isAnyActive(query.state.data) ? 4_000 : 30_000),
  });

  useEffect(() => {
    if (!restaurantId || !query.data) return;
    for (const s of query.data) {
      const stage = s.lastImport?.stage;
      const prev = lastSeenStage.current.get(s.datasetType);
      lastSeenStage.current.set(s.datasetType, stage ?? "completed");
      if (stage === "completed" && prev && prev !== "completed") {
        queryClient.invalidateQueries({ queryKey: ["data-center-history", restaurantId, s.datasetType] });
        if (s.datasetType.startsWith("compliance_")) {
          queryClient.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
          queryClient.invalidateQueries({ queryKey: ["compliance-tasks", restaurantId] });
        }
        if (DASHBOARD_AFFECTING.includes(s.datasetType)) {
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary", restaurantId] });
        }
        if (INVENTORY_AFFECTING.includes(s.datasetType)) {
          queryClient.invalidateQueries({ queryKey: ["inventory-ai-check", restaurantId] });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, restaurantId]);

  return query;
}

export function useDataCenterHistory(datasetType: DatasetType) {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["data-center-history", restaurantId, datasetType],
    queryFn: () =>
      apiClient.get<ImportLog[]>(
        `/restaurants/${restaurantId}/data-center/history/${datasetType}`
      ),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

// See docs/architecture/FORECASTING_NEXT_GEN_ROADMAP.md Part 4 — read-only
// analysis of already-imported sales data (coverage gaps, estimated-guest-
// count rows, an overall 0-100 score). First frontend consumer of
// ImportQualityReportService.
export interface ImportQualityReport {
  restaurantId: string;
  dateRangeCovered: { from: string; to: string } | null;
  totalDaysInRange: number;
  daysWithData: number;
  missingDays: string[];
  missingDayCount: number;
  estimatedGuestCountDays: number;
  overallScore: number;
  scoreBreakdown: { completeness: number; validity: number; freshness: number };
}

export function useSalesQualityReport() {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["data-center-sales-quality", restaurantId],
    queryFn: () =>
      apiClient.get<ImportQualityReport>(
        `/restaurants/${restaurantId}/data-center/quality-report/sales`
      ),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useDataCenterImport() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      datasetType,
      mode,
      onUploadProgress,
    }: {
      file: File;
      datasetType: DatasetType;
      mode: "replace" | "append";
      /** Real 0-100 byte-transfer progress, not processing progress —
       *  processing progress comes from polling useDataCenterStatus. */
      onUploadProgress?: (pct: number) => void;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadFileWithProgress<EnqueueResult>(
        `/restaurants/${restaurantId}/data-center/import/${datasetType}?mode=${mode}`,
        formData,
        onUploadProgress,
      );
    },
    onSuccess: (_, { datasetType }) => {
      // Only the immediately-known things: the upload was received and a
      // new ImportLog exists. Everything downstream (row counts, agent
      // results, dashboard/inventory refresh) happens once polling
      // observes the stage reach "completed" — see useDataCenterStatus.
      queryClient.invalidateQueries({ queryKey: ["data-center-status", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["data-center-history", restaurantId, datasetType] });
    },
  });
}
