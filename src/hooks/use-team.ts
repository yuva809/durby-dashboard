"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useRestaurantId } from "./use-restaurant-id";

export type TeamRole = "OWNER" | "MANAGER" | "STAFF" | "FINANCE" | "SERVICE" | "KITCHEN" | "INVENTORY";

export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  lastLoginAt: string | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
}

export interface LinkableEmployee {
  id: string;
  name: string;
  role: string;
  userId: string | null;
}

function invalidateTeam(qc: ReturnType<typeof useQueryClient>, restaurantId: string | null) {
  qc.invalidateQueries({ queryKey: ["team-members", restaurantId] });
  qc.invalidateQueries({ queryKey: ["team-invitations", restaurantId] });
}

export function useTeamMembers() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["team-members", restaurantId],
    queryFn: () => apiClient.get<TeamMember[]>(`/restaurants/${restaurantId}/team/members`),
    enabled: !!restaurantId,
  });
}

export function useTeamInvitations() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["team-invitations", restaurantId],
    queryFn: () => apiClient.get<TeamInvitation[]>(`/restaurants/${restaurantId}/team/invitations`),
    enabled: !!restaurantId,
  });
}

export function useInviteTeamMember() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: TeamRole }) =>
      apiClient.post(`/restaurants/${restaurantId}/team/invitations`, input),
    onSuccess: () => invalidateTeam(qc, restaurantId),
  });
}

export function useResendInvitation() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.post(`/restaurants/${restaurantId}/team/invitations/${invitationId}/resend`),
    onSuccess: () => invalidateTeam(qc, restaurantId),
  });
}

export function useCancelInvitation() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.patch(`/restaurants/${restaurantId}/team/invitations/${invitationId}/cancel`),
    onSuccess: () => invalidateTeam(qc, restaurantId),
  });
}

export function useChangeTeamRole() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: TeamRole }) =>
      apiClient.patch(`/restaurants/${restaurantId}/team/members/${membershipId}/role`, { role }),
    onSuccess: () => invalidateTeam(qc, restaurantId),
  });
}

export function useRemoveTeamMember() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      apiClient.delete(`/restaurants/${restaurantId}/team/members/${membershipId}`),
    onSuccess: () => invalidateTeam(qc, restaurantId),
  });
}

// ── Employee account linking (My Work self-service depends on this) ────────

export function useLinkableEmployees() {
  const restaurantId = useRestaurantId();
  return useQuery({
    queryKey: ["workforce-employees-for-linking", restaurantId],
    queryFn: () => apiClient.get<LinkableEmployee[]>(`/restaurants/${restaurantId}/workforce/employees`),
    enabled: !!restaurantId,
  });
}

export function useLinkEmployeeAccount() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, userId }: { employeeId: string; userId: string | null }) =>
      apiClient.patch(`/restaurants/${restaurantId}/workforce/employees/${employeeId}/link-account`, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workforce-employees-for-linking", restaurantId] }),
  });
}
