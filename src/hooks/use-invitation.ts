"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface InvitationDetails {
  email: string;
  role: "OWNER" | "MANAGER" | "STAFF" | "FINANCE" | "SERVICE" | "KITCHEN" | "INVENTORY";
  restaurantName: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  // Only present while status is PENDING — see backend
  // InvitationsService#validateToken. Required for Clerk's Restricted
  // Sign-Up mode to allow a brand-new account through this link.
  clerkTicket: string | null;
}

// Public endpoint — no auth required, matches backend's @Public() on
// GET /invitations/:token. Used by the pre-signup landing page.
export function useInvitation(token: string) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: () => apiClient.get<InvitationDetails>(`/invitations/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: () => apiClient.post<{ restaurantId: string; role: string }>(`/invitations/${token}/accept`),
  });
}
