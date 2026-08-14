"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";
import { ME_QUERY_KEY, type MeResponse } from "./use-me";

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
  onboardingCompletedAt:   string | null;
  businessType:            string | null;
  estimatedLocationCount:  number | null;
  estimatedDailyOrders:    number | null;
  posProvider:             string | null;
  inventoryMethod:         string | null;
  inventoryCountFrequency: string | null;
  schedulingMethod:        string | null;
  estimatedEmployeeCount:  number | null;
  estimatedManagerCount:   number | null;
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

// Marks the onboarding wizard done (Restaurant.onboardingCompletedAt) —
// idempotent server-side, so a double-click or a retry after a failed
// request is always safe.
//
// The /me cache is patched synchronously (not just invalidated) so
// RestaurantProvider's onboardingCompleted flips to true in the SAME
// render pass this mutation resolves in. A plain invalidateQueries()
// only marks the query stale and kicks off a background refetch — the
// caller (OnboardingWizard) navigates to /dashboard immediately after this
// resolves, and AppShell could mount there before that refetch lands,
// briefly see the still-stale onboardingCompleted:false, and bounce back
// to /onboarding for a moment before the real data arrives.
export function useCompleteOnboarding() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<RestaurantProfile>(`/restaurants/${restaurantId}/profile/complete-onboarding`),
    onSuccess: (updated) => {
      qc.setQueryData(["restaurant-profile", restaurantId], updated);
      qc.setQueryData<MeResponse>(ME_QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              memberships: old.memberships.map((m) =>
                m.restaurantId === restaurantId ? { ...m, onboardingCompleted: true } : m,
              ),
            }
          : old,
      );
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}
