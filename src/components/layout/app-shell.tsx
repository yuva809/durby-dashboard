"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { NoRestaurantScreen } from "./no-restaurant-screen";
import { useRestaurantContext } from "@/providers/restaurant-provider";

// Single integration point for the onboarding gate: every page renders
// through AppShell, so a brand-new user with no restaurant membership sees
// this state here instead of at each of the ~15 individual pages. Pages'
// own `if (!restaurantId) return <ConfigMissingBanner/>` checks remain as a
// fallback for genuine misconfiguration (e.g. /me itself failing) — this
// gate only intercepts the two states it specifically knows how to handle:
// still loading, and onboarding-required.
//
// Self-service restaurant creation no longer exists — every restaurant
// comes from an admin-issued invitation (src/app/invite/[token]/page.tsx).
// A user with zero memberships has nothing to create here; they're waiting
// on an invitation email. See NoRestaurantScreen for the actual empty state.

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { isLoading, onboardingRequired, clerkConflict } = useRestaurantContext();

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : onboardingRequired ? (
            <NoRestaurantScreen clerkConflict={clerkConflict} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
