"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";
import type { DecisionEngineResult } from "@/types/decision-engine";

export function useInventoryAiCheck() {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["inventory-ai-check", restaurantId],
    queryFn: () =>
      apiClient.get<DecisionEngineResult>(`/restaurants/${restaurantId}/inventory/ai-check`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
  });
}

interface CsvImportResult {
  totalRows: number;
  created: number;
  updated: number;
  errors: string[];
}

export function useInventoryCsvImport() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.post<CsvImportResult>(
        `/restaurants/${restaurantId}/integrations/inventory-csv`,
        formData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-ai-check", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-overview", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items", restaurantId] });
    },
  });
}

// ─── Phase 1: Overview, items, products, count, waste ───────────────────────

export type WasteReason = "SPOILAGE" | "OVERPRODUCTION" | "PREP_ERROR" | "OTHER";

export interface ReorderRecommendation {
  productId: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderPoint: number;
  parLevel: number | null;
  suggestedOrderQty: number | null;
}

export interface InventoryOverviewDto {
  inventoryValue: number;
  healthPct: number;
  totalProducts: number;
  lowStockCount: number;
  expiringSoonCount: number;
  todayUsageQty: number;
  todayWasteQty: number;
  pendingInvoiceReviewCount: number;
  reorderRecommendations: ReorderRecommendation[];
}

export function useInventoryOverview() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["inventory-overview", restaurantId],
    queryFn: () => apiClient.get<InventoryOverviewDto>(`/restaurants/${restaurantId}/inventory/overview`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export interface InventoryItemDto {
  id: string;
  productId: string;
  name: string;
  unit: string;
  category: string;
  quantityOnHand: number;
  reorderPoint: number;
  parLevel: number | null;
  lastUnitCost: number | null;
  expiryDate: string | null;
  isLowStock: boolean;
  isExpiringSoon: boolean;
}

export function useInventoryItems() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["inventory-items", restaurantId],
    queryFn: () => apiClient.get<InventoryItemDto[]>(`/restaurants/${restaurantId}/inventory/items`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export interface ProductDto {
  id: string;
  name: string;
  unit: string;
  category: string;
  lastUnitCost: number | null;
}

export function useProducts() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["inventory-products", restaurantId],
    queryFn: () => apiClient.get<ProductDto[]>(`/restaurants/${restaurantId}/inventory/products`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

function invalidateInventory(qc: ReturnType<typeof useQueryClient>, restaurantId: string | null) {
  qc.invalidateQueries({ queryKey: ["inventory-overview", restaurantId] });
  qc.invalidateQueries({ queryKey: ["inventory-items", restaurantId] });
  qc.invalidateQueries({ queryKey: ["inventory-products", restaurantId] });
}

export function useCreateProduct() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; unit: string; category: string; reorderPoint?: number; parLevel?: number }) =>
      apiClient.post<ProductDto>(`/restaurants/${restaurantId}/inventory/products`, dto),
    onSuccess: () => invalidateInventory(qc, restaurantId),
  });
}

export function useRecordStockCount() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, countedQuantity, note }: { productId: string; countedQuantity: number; note?: string }) =>
      apiClient.post(`/restaurants/${restaurantId}/inventory/products/${productId}/count`, { countedQuantity, note }),
    onSuccess: () => invalidateInventory(qc, restaurantId),
  });
}

export function useRecordWaste() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity, reason, note }: { productId: string; quantity: number; reason: WasteReason; note?: string }) =>
      apiClient.post(`/restaurants/${restaurantId}/inventory/products/${productId}/waste`, { quantity, reason, note }),
    onSuccess: () => invalidateInventory(qc, restaurantId),
  });
}

// ─── Phase 5: purchase recommendations ───────────────────────────────────────

export type PurchaseRecommendationStatus = "PENDING" | "APPROVED" | "DISMISSED";

export interface PurchaseRecommendationDto {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: string };
  suggestedQuantity: string;
  reasoning: string;
  confidence: number | null;
  status: PurchaseRecommendationStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export function usePurchaseRecommendations(status?: PurchaseRecommendationStatus) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["purchase-recommendations", restaurantId, status ?? "all"],
    queryFn: () =>
      apiClient.get<PurchaseRecommendationDto[]>(
        `/restaurants/${restaurantId}/inventory/purchase-recommendations${status ? `?status=${status}` : ""}`,
      ),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

function invalidateRecommendations(qc: ReturnType<typeof useQueryClient>, restaurantId: string | null) {
  qc.invalidateQueries({ queryKey: ["purchase-recommendations", restaurantId] });
}

export function useGeneratePurchaseRecommendations() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<PurchaseRecommendationDto[]>(`/restaurants/${restaurantId}/inventory/purchase-recommendations/generate`),
    onSuccess: () => invalidateRecommendations(qc, restaurantId),
  });
}

export function useUpdateRecommendationStatus() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recommendationId, status }: { recommendationId: string; status: "APPROVED" | "DISMISSED" }) =>
      apiClient.patch(`/restaurants/${restaurantId}/inventory/purchase-recommendations/${recommendationId}`, { status }),
    onSuccess: () => invalidateRecommendations(qc, restaurantId),
  });
}
