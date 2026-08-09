"use client";

import { useRestaurantContext } from "@/providers/restaurant-provider";

// Resolved dynamically from the authenticated Clerk user's restaurant
// membership (see RestaurantProvider / GET /me) rather than a fixed env
// var. Returns null while loading, while signed out, or when the user has
// no restaurant membership yet — callers already treat null as "don't
// fetch yet" via their existing `enabled: !!restaurantId` checks.
export function useRestaurantId(): string | null {
  return useRestaurantContext().restaurantId;
}
