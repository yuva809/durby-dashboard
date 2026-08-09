"use client";

import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
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
// on an invitation email.
function NoRestaurantYet() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="card-surface flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <Mail className="h-8 w-8 text-muted-foreground" />
        <h2 className="text-base font-semibold">No restaurant yet</h2>
        <p className="text-sm text-muted-foreground">
          Your account isn&apos;t linked to a restaurant. Check your email for an invitation
          from your administrator, or contact them if you were expecting one.
        </p>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { isLoading, onboardingRequired } = useRestaurantContext();

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
            <NoRestaurantYet />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
