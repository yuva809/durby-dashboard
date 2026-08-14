"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  const { isLoading, onboardingRequired, onboardingCompleted, clerkConflict } = useRestaurantContext();
  const router = useRouter();

  // A restaurant that exists (membership found) but hasn't finished the
  // onboarding wizard yet gets sent to /onboarding instead of whatever
  // dashboard page they landed on — this is the single redirect point for
  // that, same "one gate for every page" reasoning as onboardingRequired
  // below. The wizard's own page redirects back here once complete, so
  // this never loops.
  const needsOnboarding = !isLoading && !onboardingRequired && !onboardingCompleted;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading || needsOnboarding ? (
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
