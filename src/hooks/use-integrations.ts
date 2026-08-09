"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ─── Types (mirror backend DTOs and registry) ─────────────────────────────────

export type IntegrationCategory =
  | "HR"
  | "SCHEDULING"
  | "POS"
  | "RESERVATIONS"
  | "SUPPLIERS";

export type SyncStatus = "IDLE" | "SYNCING" | "SUCCESS" | "ERROR" | "PENDING";
export type AuthType = "oauth2" | "api_key" | "webhook";
export type SyncDirection = "import" | "export" | "bidirectional";

export interface IntegrationConfig {
  id: string;
  connected: boolean;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastSyncError: string | null;
  recordsImported: number;
}

export interface IntegrationStatusDto {
  providerId: string;
  name: string;
  category: IntegrationCategory;
  categoryLabel: string;
  tagline: string;
  description: string;
  authType: AuthType;
  syncDirection: SyncDirection;
  capabilities: string[];
  implemented: boolean;
  config: IntegrationConfig | null;
}

export interface CategoryGroupDto {
  category: IntegrationCategory;
  label: string;
  providers: IntegrationStatusDto[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useIntegrations() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["integrations", restaurantId],
    queryFn: () =>
      apiClient.get<CategoryGroupDto[]>(`/restaurants/${restaurantId}/integrations`),
    enabled: !!restaurantId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useConnectIntegration() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiClient.post<IntegrationStatusDto>(
        `/restaurants/${restaurantId}/integrations/${providerId}/connect`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", restaurantId] }),
  });
}

export function useDisconnectIntegration() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiClient.post<IntegrationStatusDto>(
        `/restaurants/${restaurantId}/integrations/${providerId}/disconnect`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", restaurantId] }),
  });
}

export function useSyncIntegration() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      apiClient.post<IntegrationStatusDto>(
        `/restaurants/${restaurantId}/integrations/${providerId}/sync`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations", restaurantId] });
      qc.invalidateQueries({ queryKey: ["compliance-dashboard", restaurantId] });
    },
  });
}
