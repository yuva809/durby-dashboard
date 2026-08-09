"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface Membership {
  restaurantId: string;
  restaurantName: string;
  role: "OWNER" | "MANAGER" | "STAFF" | "FINANCE";
}

export interface MeResponse {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
  onboardingRequired: boolean;
}

export const ME_QUERY_KEY = ["me"];

// Only fires once Clerk has finished loading and the user is actually
// signed in — on /sign-in, /sign-up, or before Clerk hydrates, there's no
// token to send and no point hitting the backend.
//
// Self-service restaurant creation no longer exists — a signed-in user
// with zero memberships stays onboardingRequired until they accept an
// Invitation (see src/app/invite/[token]/page.tsx), which is what
// eventually populates `memberships` here.
export function useMe() {
  const { isLoaded, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient.get<MeResponse>("/me"),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60_000,
  });
}
