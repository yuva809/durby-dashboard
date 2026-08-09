"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// Deliberately its own file, not merged into use-integrations.ts — Liefersoft
// is a real, credential-holding connection (its own backend module, its own
// Integration table), not a placeholder registry entry. See
// backend/src/modules/integrations/liefersoft/ for the server side.

export type LiefersoftStatus = "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";

export interface LiefersoftStatusDto {
  status: LiefersoftStatus;
  lastSync: string | null;
}

export interface ConnectLiefersoftInput {
  username: string;
  password: string;
  companyId: string;
}

export interface LiefersoftSyncResult {
  message: string;
  imported: number;
  skipped: number;
}

const QUERY_KEY = (restaurantId: string | null) => ["liefersoft-status", restaurantId];

export function useLiefersoftStatus() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: QUERY_KEY(restaurantId),
    queryFn: () =>
      apiClient.get<LiefersoftStatusDto>(`/restaurants/${restaurantId}/integrations/liefersoft/status`),
    enabled: !!restaurantId,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useLiefersoftConnect() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectLiefersoftInput) =>
      apiClient.post<{ status: LiefersoftStatus }>(
        `/restaurants/${restaurantId}/integrations/liefersoft/connect`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(restaurantId) }),
  });
}

export function useLiefersoftDisconnect() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<{ status: LiefersoftStatus }>(`/restaurants/${restaurantId}/integrations/liefersoft`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(restaurantId) }),
  });
}

export function useLiefersoftSync() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<LiefersoftSyncResult>(`/restaurants/${restaurantId}/integrations/liefersoft/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY(restaurantId) });
      // A sync writes real Order rows — refresh the views that read from
      // them. Partial keys (no restaurantId/date suffix) intentionally
      // match every variant TanStack Query has cached for these queries.
      qc.invalidateQueries({ queryKey: ["dashboard-operational"] });
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["analytics-data"] });
    },
  });
}
