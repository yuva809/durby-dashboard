"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser, useClerk, SignIn, SignUp } from "@clerk/nextjs";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useInvitation, useAcceptInvitation } from "@/hooks/use-invitation";
import { ApiError } from "@/lib/api-client";

// Public landing page for an admin- or team-issued Invitation link
// (backend: modules/invitations/). Not behind Clerk's auth.protect() —
// see middleware.ts — since a brand-new user has no session yet when they
// open this. Flow: validate the token → if not signed in, show sign-in/
// sign-up (redirects back to this same URL) → once signed in, accept the
// invitation → redirect to /dashboard.
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: invitation, isLoading, isError, error } = useInvitation(token);
  const accept = useAcceptInvitation(token);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");

  // Clerk's Restricted Sign-Up mode blocks any brand-new account unless the
  // sign-up carries a valid ticket. The prebuilt <SignUp> component reads
  // it straight off window.location.search at mount time — no custom
  // useSignUp() flow needed — but that means the ticket MUST already be in
  // the URL before <SignUp> ever mounts. `ticketApplied` gates its render
  // so we don't race: the effect runs (and commits the URL change) on the
  // render where invitation.clerkTicket first arrives, `setTicketApplied`
  // triggers one more render, and only THEN does <SignUp> appear below.
  const [ticketApplied, setTicketApplied] = useState(false);
  useEffect(() => {
    if (!invitation?.clerkTicket) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("__clerk_ticket") !== invitation.clerkTicket) {
      url.searchParams.set("__clerk_ticket", invitation.clerkTicket);
      window.history.replaceState(null, "", url.toString());
    }
    setTicketApplied(true);
  }, [invitation?.clerkTicket]);
  // No ticket at all (e.g. an older invitation created before this
  // migration) shouldn't block sign-in forever — only sign-up needs it.
  const readyForSignUp = !invitation?.clerkTicket || ticketApplied;

  const currentUrl = typeof window !== "undefined" ? window.location.href : `/invite/${token}`;

  const signedInEmail = user?.primaryEmailAddress?.emailAddress ?? null;
  // SECURITY: this invite link is only valid for the email it was sent to.
  // Clerk dev-instance sessions are shared across origins/apps using the
  // same publishable key, so a browser can arrive here already signed in
  // as a completely different account than the one invited — auto-
  // accepting in that case would silently add the WRONG person as a
  // member (this happened for real, see incident notes in
  // invitations.service.ts#accept). The backend enforces this too and is
  // the actual source of truth; this check only stops the accidental
  // auto-accept from firing so the person sees why, instead of a raw 403.
  const emailMismatch =
    isSignedIn && !!signedInEmail && !!invitation && signedInEmail.toLowerCase() !== invitation.email.toLowerCase();

  // Once signed in as the correct account and the invitation is genuinely
  // still pending, accept it automatically — no separate "confirm" click
  // needed, the invitation link itself is the confirmation.
  useEffect(() => {
    if (isLoaded && isSignedIn && !emailMismatch && invitation?.status === "PENDING" && accept.isIdle) {
      accept.mutate(undefined, {
        onSuccess: () => router.push("/dashboard"),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, emailMismatch, invitation?.status]);

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (isError || !invitation) {
    const message = error instanceof ApiError && error.status === 404
      ? "This invitation link is invalid."
      : "Something went wrong loading this invitation.";
    return (
      <Centered>
        <StatusCard icon={<XCircle className="h-8 w-8 text-red-400" />} title="Invitation not found" body={message} />
      </Centered>
    );
  }

  if (invitation.status === "EXPIRED") {
    return (
      <Centered>
        <StatusCard
          icon={<XCircle className="h-8 w-8 text-red-400" />}
          title="Invitation expired"
          body={`This invitation to join ${invitation.restaurantName} has expired. Ask your administrator to resend it.`}
        />
      </Centered>
    );
  }

  if (invitation.status === "CANCELLED") {
    return (
      <Centered>
        <StatusCard
          icon={<XCircle className="h-8 w-8 text-red-400" />}
          title="Invitation cancelled"
          body="This invitation is no longer valid."
        />
      </Centered>
    );
  }

  if (invitation.status === "ACCEPTED") {
    return (
      <Centered>
        <StatusCard
          icon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
          title="Already accepted"
          body="This invitation has already been accepted. Sign in to access your dashboard."
        />
      </Centered>
    );
  }

  if (accept.isError) {
    return (
      <Centered>
        <StatusCard
          icon={<XCircle className="h-8 w-8 text-red-400" />}
          title="Couldn't accept invitation"
          body={accept.error instanceof Error ? accept.error.message : "Please try again or contact your administrator."}
        />
      </Centered>
    );
  }

  if (isLoaded && emailMismatch) {
    return (
      <Centered>
        <div className="card-surface flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <XCircle className="h-8 w-8 text-red-400" />
          <h2 className="text-base font-semibold">Wrong account</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as <strong>{signedInEmail}</strong>, but this invitation was sent to{" "}
            <strong>{invitation.email}</strong>. Please sign out and sign in with the correct account.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => signOut({ redirectUrl: currentUrl })}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Sign out
            </button>
            <button
              onClick={() => signOut({ redirectUrl: currentUrl })}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-card"
            >
              Sign in with another account
            </button>
          </div>
        </div>
      </Centered>
    );
  }

  if (!isLoaded || (isSignedIn && accept.isPending)) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Setting up your account…</p>
      </Centered>
    );
  }

  // mode === "sign-up" specifically needs the ticket already committed to
  // the URL (see the effect above) before <SignUp> mounts and reads it —
  // this is a one-render gap, not a real wait.
  if (mode === "sign-up" && !readyForSignUp) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Durby</p>
        <h1 className="text-xl font-semibold">
          You&apos;re invited to join {invitation.restaurantName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in or create an account with <strong>{invitation.email}</strong> to accept as {roleLabel(invitation.role)}.
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setMode("sign-up")}
          className={mode === "sign-up" ? "font-semibold text-accent" : "text-muted-foreground"}
        >
          Create account
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={() => setMode("sign-in")}
          className={mode === "sign-in" ? "font-semibold text-accent" : "text-muted-foreground"}
        >
          Already have an account?
        </button>
      </div>

      {mode === "sign-up" ? (
        <SignUp
          initialValues={{ emailAddress: invitation.email }}
          forceRedirectUrl={currentUrl}
        />
      ) : (
        <SignIn forceRedirectUrl={currentUrl} />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center px-4">{children}</div>;
}

function StatusCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card-surface flex max-w-md flex-col items-center gap-3 p-8 text-center">
      {icon}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function roleLabel(role: string): string {
  return role === "OWNER" ? "the owner" : `a ${role.toLowerCase()}`;
}
