"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { useRestaurantContext } from "@/providers/restaurant-provider";
import { Bell, Plug, Sparkles, ShieldCheck, CreditCard, Loader2, Plus, Link2 } from "lucide-react";
import {
  useTeamMembers, useTeamInvitations, useInviteTeamMember, useResendInvitation, useCancelInvitation,
  useChangeTeamRole, useRemoveTeamMember, useLinkableEmployees, useLinkEmployeeAccount,
  type TeamRole,
} from "@/hooks/use-team";

const CATEGORIES = [
  { icon: Bell, label: "Notifications" },
  { icon: Plug, label: "Integrations" },
  { icon: Sparkles, label: "AI Preferences" },
  { icon: ShieldCheck, label: "Security" },
  { icon: CreditCard, label: "Billing" },
];

const ROLE_OPTIONS: TeamRole[] = ["OWNER", "MANAGER", "STAFF", "FINANCE", "SERVICE", "KITCHEN", "INVENTORY"];

export default function Page() {
  const { role } = useRestaurantContext();
  const canManageTeam = role === "OWNER" || role === "MANAGER";

  return (
    <AppShell title="Settings">
      <div className="flex flex-col gap-6">
        {canManageTeam && <TeamSection />}

        <div className="card-surface flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-muted-foreground">Coming in a later phase.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {CATEGORIES.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function TeamSection() {
  const { data: members, isLoading, error } = useTeamMembers();
  const { data: invitations } = useTeamInvitations();
  const [showInvite, setShowInvite] = useState(false);

  const pendingInvitations = (invitations ?? []).filter((i) => i.status === "PENDING");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Team</h2>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus className="h-3.5 w-3.5" /> Invite
        </button>
      </div>

      {showInvite && <InviteForm onDone={() => setShowInvite(false)} />}

      {isLoading ? (
        <LoadingBanner label="Loading team…" />
      ) : error ? (
        <ErrorBanner message="Failed to load the team." />
      ) : (
        <div className="card-surface flex flex-col divide-y divide-border">
          {(members ?? []).map((m) => <MemberRow key={m.membershipId} member={m} />)}
        </div>
      )}

      {pendingInvitations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending invitations</p>
          <div className="card-surface flex flex-col divide-y divide-border">
            {pendingInvitations.map((inv) => <InvitationRow key={inv.id} invitation={inv} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const invite = useInviteTeamMember();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("SERVICE");

  function submit() {
    if (!email.trim()) return;
    invite.mutate({ email: email.trim(), role }, { onSuccess: () => { setEmail(""); onDone(); } });
  }

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
        >
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {invite.isError && <p className="text-xs text-red-500">Could not send the invitation — please try again.</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={invite.isPending || !email.trim()}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send Invitation
        </button>
        <button onClick={onDone} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: import("@/hooks/use-team").TeamMember }) {
  const changeRole = useChangeTeamRole();
  const removeMember = useRemoveTeamMember();
  const { data: employees } = useLinkableEmployees();
  const linkAccount = useLinkEmployeeAccount();
  const [linking, setLinking] = useState(false);

  const linkedEmployee = (employees ?? []).find((e) => e.userId === member.userId);
  const isOwner = member.role === "OWNER";

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{member.name}</p>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={member.role}
            disabled={isOwner || changeRole.isPending}
            onChange={(e) => changeRole.mutate({ membershipId: member.membershipId, role: e.target.value as TeamRole })}
            className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {!isOwner && (
            <button
              onClick={() => removeMember.mutate(member.membershipId)}
              disabled={removeMember.isPending}
              className="text-xs text-muted-foreground hover:text-red-500 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Employee-account link — lets this member's My Work resolve shifts/hours/leave. */}
      <div className="flex items-center gap-2 text-xs">
        <Link2 className="h-3 w-3 text-muted-foreground" />
        {linkedEmployee ? (
          <>
            <span className="text-muted-foreground">Linked to <span className="text-foreground">{linkedEmployee.name}</span></span>
            <button
              onClick={() => linkAccount.mutate({ employeeId: linkedEmployee.id, userId: null })}
              disabled={linkAccount.isPending}
              className="text-muted-foreground hover:text-red-500"
            >
              Unlink
            </button>
          </>
        ) : linking ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) linkAccount.mutate({ employeeId: e.target.value, userId: member.userId }, { onSuccess: () => setLinking(false) });
            }}
            onBlur={() => setLinking(false)}
            className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
          >
            <option value="" disabled>Select a roster employee…</option>
            {(employees ?? []).filter((e) => !e.userId).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
          </select>
        ) : (
          <button onClick={() => setLinking(true)} className="text-muted-foreground hover:text-accent">
            Link to employee record
          </button>
        )}
      </div>
    </div>
  );
}

function InvitationRow({ invitation }: { invitation: import("@/hooks/use-team").TeamInvitation }) {
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <div>
        <p className="text-foreground">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">{invitation.role}</p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => resend.mutate(invitation.id)} disabled={resend.isPending} className="text-xs text-muted-foreground hover:text-accent disabled:opacity-50">
          Resend
        </button>
        <button onClick={() => cancel.mutate(invitation.id)} disabled={cancel.isPending} className="text-xs text-muted-foreground hover:text-red-500 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
