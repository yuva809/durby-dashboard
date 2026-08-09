"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimeWindow {
  open:  string; // "HH:MM"
  close: string; // "HH:MM" or "00:00"
}

export interface OpeningHours {
  mon: TimeWindow[];
  tue: TimeWindow[];
  wed: TimeWindow[];
  thu: TimeWindow[];
  fri: TimeWindow[];
  sat: TimeWindow[];
  sun: TimeWindow[];
}

export interface ClosureException {
  date:   string; // "YYYY-MM-DD"
  reason: string;
}

export interface RestaurantProfile {
  id:               string;
  name:             string;
  slug:             string;
  cuisineType:      string;
  addressLine:      string;
  city:             string;
  countryCode:      string;
  timezone:         string;
  currency:         string;
  bundesland:       string;
  latitude:         number | null;
  longitude:        number | null;
  openingHours:     OpeningHours;
  closureExceptions: ClosureException[];
  seatsIndoor:      number;
  seatsTerrace:     number;
  serviceDineIn:    boolean;
  serviceTakeaway:  boolean;
  serviceDelivery:  boolean;
  minStaffKitchen:  number;
  minStaffService:  number;
  minStaffBar:      number;
  targetFoodCostPct: number | null;
  avgTicketSize:    number | null;
  updatedAt:        string;
}

export type PatchProfilePayload = Partial<Omit<RestaurantProfile, "id" | "slug" | "updatedAt">>;

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useRestaurantProfile() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["restaurant-profile", restaurantId],
    queryFn: () =>
      apiClient.get<RestaurantProfile>(`/restaurants/${restaurantId}/profile`),
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePatchRestaurantProfile() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatchProfilePayload) =>
      apiClient.patch<RestaurantProfile>(`/restaurants/${restaurantId}/profile`, payload),
    onSuccess: (updated) => {
      qc.setQueryData(["restaurant-profile", restaurantId], updated);
    },
  });
}
