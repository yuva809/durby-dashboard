"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMe, type Membership, type ClerkConflict } from "@/hooks/use-me";

interface RestaurantContextValue {
  restaurantId: string | null;
  role: Membership["role"] | null;
  memberships: Membership[];
  /** True while Clerk is hydrating or the /me request is in flight. */
  isLoading: boolean;
  /** True once /me has resolved and the user has zero restaurant memberships. */
  onboardingRequired: boolean;
  /** Dev/staging diagnostic only — see MeResponse. Always null in production. */
  clerkConflict: ClerkConflict | null;
}

const RestaurantContext = createContext<RestaurantContextValue>({
  restaurantId: null,
  role: null,
  memberships: [],
  isLoading: true,
  onboardingRequired: false,
  clerkConflict: null,
});

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { data, isLoading: meLoading } = useMe();

  const value = useMemo<RestaurantContextValue>(() => {
    if (!isLoaded || (isSignedIn && meLoading)) {
      return {
        restaurantId: null,
        role: null,
        memberships: [],
        isLoading: true,
        onboardingRequired: false,
        clerkConflict: null,
      };
    }
    if (!isSignedIn || !data) {
      return {
        restaurantId: null,
        role: null,
        memberships: [],
        isLoading: false,
        onboardingRequired: false,
        clerkConflict: null,
      };
    }
    const active = data.memberships[0] ?? null;
    return {
      restaurantId: active?.restaurantId ?? null,
      role: active?.role ?? null,
      memberships: data.memberships,
      isLoading: false,
      onboardingRequired: data.onboardingRequired,
      clerkConflict: data.clerkConflict,
    };
  }, [isLoaded, isSignedIn, meLoading, data]);

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurantContext() {
  return useContext(RestaurantContext);
}
