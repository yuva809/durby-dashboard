"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "ORDERING" | "PREPARING" | "READY" | "CLOSED";
export type ServiceOrderStatus = "DRAFT" | "SUBMITTED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  label: string;
  seats: number;
  status: TableStatus;
  sortOrder: number;
}

export interface ServiceOrderItemDto {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: string; // Prisma Decimal serializes as a string over JSON
  quantity: number;
  notes: string | null;
}

export interface ServiceOrderDto {
  id: string;
  restaurantId: string;
  tableId: string;
  orderNumber: number;
  guestCount: number | null;
  status: ServiceOrderStatus;
  createdAt: string;
  table?: { id: string; label: string };
  items: ServiceOrderItemDto[];
}

const TABLES_KEY = (restaurantId: string | null) => ["service-tables", restaurantId];
const ORDERS_KEY = (restaurantId: string | null, view?: string) => ["service-orders", restaurantId, view ?? "all"];
const ORDER_KEY = (restaurantId: string | null, orderId: string) => ["service-order", restaurantId, orderId];

// Durby Order has no realtime push infra to reuse (see the audit that
// preceded this) — a 5s poll on the live board queries is the smallest
// framework-native way to feel "live" without adding new infrastructure.
const LIVE_POLL_MS = 5_000;

export function useCreateTable() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; seats?: number }) =>
      apiClient.post<RestaurantTable>(`/restaurants/${restaurantId}/tables`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TABLES_KEY(restaurantId) }),
  });
}

export function useUpdateTable() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...input }: { tableId: string; label?: string; seats?: number }) =>
      apiClient.patch<RestaurantTable>(`/restaurants/${restaurantId}/tables/${tableId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TABLES_KEY(restaurantId) }),
  });
}

export function useDeleteTable() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) => apiClient.delete(`/restaurants/${restaurantId}/tables/${tableId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TABLES_KEY(restaurantId) }),
  });
}

export function useTables() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: TABLES_KEY(restaurantId),
    queryFn: () => apiClient.get<RestaurantTable[]>(`/restaurants/${restaurantId}/tables`),
    enabled: !!restaurantId,
    refetchInterval: LIVE_POLL_MS,
  });
}

export function useServiceOrders(view?: "active" | "history" | "kitchen") {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ORDERS_KEY(restaurantId, view),
    queryFn: () => apiClient.get<ServiceOrderDto[]>(`/restaurants/${restaurantId}/service-orders${view ? `?view=${view}` : ""}`),
    enabled: !!restaurantId,
    refetchInterval: view === "history" ? undefined : LIVE_POLL_MS,
  });
}

export function useServiceOrder(orderId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ORDER_KEY(restaurantId, orderId ?? ""),
    queryFn: () => apiClient.get<ServiceOrderDto>(`/restaurants/${restaurantId}/service-orders/${orderId}`),
    enabled: !!restaurantId && !!orderId,
    refetchInterval: LIVE_POLL_MS,
  });
}

export function useActiveOrderForTable(tableId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["table-active-order", restaurantId, tableId],
    queryFn: () => apiClient.get<ServiceOrderDto | null>(`/restaurants/${restaurantId}/tables/${tableId}/service-orders/active`),
    enabled: !!restaurantId && !!tableId,
    refetchInterval: LIVE_POLL_MS,
  });
}

function useInvalidateOrderQueries() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TABLES_KEY(restaurantId) });
    qc.invalidateQueries({ queryKey: ["service-orders", restaurantId] });
    qc.invalidateQueries({ queryKey: ["table-active-order", restaurantId] });
    qc.invalidateQueries({ queryKey: ["service-order", restaurantId] });
  };
}

export function useStartOrder() {
  const restaurantId = useRestaurantId();
  const invalidate = useInvalidateOrderQueries();
  return useMutation({
    mutationFn: ({ tableId, guestCount }: { tableId: string; guestCount?: number }) =>
      apiClient.post<ServiceOrderDto>(`/restaurants/${restaurantId}/tables/${tableId}/service-orders`, { guestCount }),
    onSuccess: invalidate,
  });
}

export function useAddOrderItem() {
  const restaurantId = useRestaurantId();
  const invalidate = useInvalidateOrderQueries();
  return useMutation({
    mutationFn: ({ orderId, menuItemId, quantity, notes }: { orderId: string; menuItemId: string; quantity?: number; notes?: string }) =>
      apiClient.post<ServiceOrderDto>(`/restaurants/${restaurantId}/service-orders/${orderId}/items`, { menuItemId, quantity, notes }),
    onSuccess: invalidate,
  });
}

export function useUpdateOrderItemQuantity() {
  const restaurantId = useRestaurantId();
  const invalidate = useInvalidateOrderQueries();
  return useMutation({
    mutationFn: ({ orderId, itemId, quantity }: { orderId: string; itemId: string; quantity: number }) =>
      apiClient.patch<ServiceOrderDto>(`/restaurants/${restaurantId}/service-orders/${orderId}/items/${itemId}`, { quantity }),
    onSuccess: invalidate,
  });
}

export function useRemoveOrderItem() {
  const restaurantId = useRestaurantId();
  const invalidate = useInvalidateOrderQueries();
  return useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      apiClient.patch<ServiceOrderDto>(`/restaurants/${restaurantId}/service-orders/${orderId}/items/${itemId}/remove`),
    onSuccess: invalidate,
  });
}

function useOrderAction(action: string) {
  const restaurantId = useRestaurantId();
  const invalidate = useInvalidateOrderQueries();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiClient.post<ServiceOrderDto>(`/restaurants/${restaurantId}/service-orders/${orderId}/${action}`),
    onSuccess: invalidate,
  });
}

export const useSubmitOrder = () => useOrderAction("submit");
export const useStartPreparing = () => useOrderAction("start-preparing");
export const useMarkReady = () => useOrderAction("mark-ready");
export const useCompleteOrder = () => useOrderAction("complete");
export const useCancelOrder = () => useOrderAction("cancel");
