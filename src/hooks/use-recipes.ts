"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export interface RecipeLineDto {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  estimatedCost: number | null;
  /** Present only when the recipe line's unit can't be automatically converted to the product's stock unit (e.g. a stale recipe from before unit conversion shipped). */
  conversionError?: string;
}

export interface RecipeDto {
  recipeVersionId: string;
  effectiveFrom: string;
  lines: RecipeLineDto[];
  estimatedTotalCost: number | null;
}

export interface RecipeLineInput {
  productId: string;
  quantity: number;
  unit: string;
}

export function useRecipe(menuItemId: string | null) {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["recipe", restaurantId, menuItemId],
    queryFn: () => apiClient.get<RecipeDto | null>(`/restaurants/${restaurantId}/menu/items/${menuItemId}/recipe`),
    enabled: !!restaurantId && !!menuItemId,
    staleTime: 30_000,
  });
}

export function useSetRecipe() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, lines }: { menuItemId: string; lines: RecipeLineInput[] }) =>
      apiClient.put<RecipeDto>(`/restaurants/${restaurantId}/menu/items/${menuItemId}/recipe`, { lines }),
    onSuccess: (_data, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ["recipe", restaurantId, menuItemId] });
    },
  });
}
