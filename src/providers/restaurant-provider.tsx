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
  /** True once the active restaurant's onboarding wizard has been
   *  completed. Meaningless while onboardingRequired/isLoading is true —
   *  defaults to true so those states never look like "needs onboarding". */
  onboardingCompleted: boolean;
  /** Dev/staging diagnostic only — see MeResponse. Always null in production. */
  clerkConflict: ClerkConflict | null;
}

const RestaurantContext = createContext<RestaurantContextValue>({
  restaurantId: null,
  role: null,
  memberships: [],
  isLoading: true,
  onboardingRequired: false,
  onboardingCompleted: true,
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
        onboardingCompleted: true,
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
        onboardingCompleted: true,
        clerkConflict: null,
      };
    }
    // Prefer the first ACTIVE membership over just memberships[0] — a user
    // can accumulate a membership to a since-cancelled/archived/suspended
    // restaurant (e.g. re-invited to a replacement restaurant after the
    // original was cancelled) without that old membership ever being
    // removed. memberships[] is ordered oldest-first (see me.controller.ts),
    // so blindly taking [0] would silently pin them to the dead restaurant.
    // Falls back to memberships[0] if none are ACTIVE, so a user whose only
    // restaurant(s) are non-active still gets a restaurantId — TenancyGuard
    // is the actual source of truth and will correctly reject with the
    // existing "account is suspended" error rather than this provider
    // silently switching them anywhere.
    const active = data.memberships.find((m) => m.restaurantStatus === "ACTIVE") ?? data.memberships[0] ?? null;
    return {
      restaurantId: active?.restaurantId ?? null,
      role: active?.role ?? null,
      memberships: data.memberships,
      isLoading: false,
      onboardingRequired: data.onboardingRequired,
      onboardingCompleted: active?.onboardingCompleted ?? true,
      clerkConflict: data.clerkConflict,
    };
  }, [isLoaded, isSignedIn, meLoading, data]);

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurantContext() {
  return useContext(RestaurantContext);
}
