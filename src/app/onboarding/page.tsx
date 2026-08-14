"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRestaurantContext } from "@/providers/restaurant-provider";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

// Not wrapped in AppShell on purpose — AppShell is what redirects INTO this
// page when onboarding isn't complete (see app-shell.tsx), so wrapping this
// page in AppShell too would loop. This page owns the opposite redirects:
// away from itself once there's nothing left to onboard.
export default function OnboardingPage() {
  const { isLoading, restaurantId, onboardingRequired, onboardingCompleted } = useRestaurantContext();
  const router = useRouter();

  const shouldLeave = !isLoading && (!restaurantId || onboardingRequired || onboardingCompleted);

  useEffect(() => {
    if (shouldLeave) router.replace("/dashboard");
  }, [shouldLeave, router]);

  if (isLoading || shouldLeave) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <OnboardingWizard />;
}
