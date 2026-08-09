"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type MenuItemStatus = "DRAFT" | "CONFIRMED";

export interface MenuOverviewDto {
  totalItems: number;
  totalCategories: number;
  pendingReviewCount: number;
  confirmedCount: number;
}

export interface MenuCategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  _count: { items: number };
}

export interface MenuItemDto {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  name: string;
  price: string;
  portionSize: string | null;
  sourceType: string;
  status: MenuItemStatus;
  confidence: number | null;
  sourceFile: string | null;
}

function invalidateMenu(qc: ReturnType<typeof useQueryClient>, restaurantId: string | null) {
  qc.invalidateQueries({ queryKey: ["menu-overview", restaurantId] });
  qc.invalidateQueries({ queryKey: ["menu-categories", restaurantId] });
  qc.invalidateQueries({ queryKey: ["menu-items", restaurantId] });
}

export function useMenuOverview() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["menu-overview", restaurantId],
    queryFn: () => apiClient.get<MenuOverviewDto>(`/restaurants/${restaurantId}/menu/overview`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useMenuCategories() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["menu-categories", restaurantId],
    queryFn: () => apiClient.get<MenuCategoryDto[]>(`/restaurants/${restaurantId}/menu/categories`),
    enabled: !!restaurantId,
    staleTime: 60_000,
  });
}

export function useMenuItems(status?: MenuItemStatus) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["menu-items", restaurantId, status ?? "all"],
    queryFn: () =>
      apiClient.get<MenuItemDto[]>(`/restaurants/${restaurantId}/menu/items${status ? `?status=${status}` : ""}`),
    enabled: !!restaurantId,
    staleTime: 30_000,
  });
}

export function useUploadMenu() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.post<MenuItemDto[]>(`/restaurants/${restaurantId}/menu/upload`, formData);
    },
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useCreateCategory() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { name: string; sortOrder?: number }) =>
      apiClient.post<MenuCategoryDto>(`/restaurants/${restaurantId}/menu/categories`, dto),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useUpdateCategory() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, dto }: { categoryId: string; dto: { name?: string; sortOrder?: number } }) =>
      apiClient.patch(`/restaurants/${restaurantId}/menu/categories/${categoryId}`, dto),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useDeleteCategory() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => apiClient.delete(`/restaurants/${restaurantId}/menu/categories/${categoryId}`),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useCreateMenuItem() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { categoryId?: string | null; name: string; price: number; portionSize?: string }) =>
      apiClient.post<MenuItemDto>(`/restaurants/${restaurantId}/menu/items`, dto),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useUpdateMenuItem() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId, dto,
    }: {
      itemId: string;
      dto: { categoryId?: string | null; name?: string; price?: number; portionSize?: string | null; status?: MenuItemStatus };
    }) => apiClient.patch(`/restaurants/${restaurantId}/menu/items/${itemId}`, dto),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}

export function useDeleteMenuItem() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`/restaurants/${restaurantId}/menu/items/${itemId}`),
    onSuccess: () => invalidateMenu(qc, restaurantId),
  });
}
