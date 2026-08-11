"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useUser, useClerk, useSignUp, SignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useInvitation, useAcceptInvitation } from "@/hooks/use-invitation";
import { ApiError } from "@/lib/api-client";

// Public landing page for an admin- or team-issued Invitation link
// (backend: modules/invitations/). Not behind Clerk's auth.protect() —
// see middleware.ts — since a brand-new user has no session yet when they
// open this. Flow: validate the token → if not signed in, show sign-in/
// sign-up (redirects back to this same URL) → once signed in, accept the
// invitation → redirect to /dashboard.
//
// Sign-up specifically uses a custom flow (useSignUp + signUp.create({
// strategy: "ticket", ... })) instead of the prebuilt <SignUp> component.
// Clerk's current docs are explicit that the prebuilt component does NOT
// consume a ticket automatically — see clerk.com/docs/guides/development/
// custom-flows/authentication/application-invitations. This is also what
// makes Restricted Sign-Up mode work later: the ticket is what lets a
// brand-new account through once that mode is enabled.
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
  // needed, the invitation link itself is the confirmation. This fires the
  // same way whether the session was just created by the custom sign-up
  // flow below or by <SignIn/> for a returning user.
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
        <TicketSignUpForm email={invitation.email} ticket={invitation.clerkTicket} />
      ) : (
        <SignIn forceRedirectUrl={currentUrl} />
      )}
    </div>
  );
}

// Custom sign-up flow — the invitation's ticket is passed straight to
// signUp.create() from our own API response (invitation.clerkTicket), not
// round-tripped through a __clerk_ticket URL param. Email comes from the
// ticket itself (Clerk resolves and auto-verifies it server-side); there
// is deliberately no email input here, so the invited address can't be
// changed client-side even before the backend's own accept()-time check.
function TicketSignUpForm({ email, ticket }: { email: string; ticket: string | null }) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (!ticket) {
    // Invitation predates the Clerk-ticket migration, or something upstream
    // failed to attach one — there's nothing this form can safely do.
    return (
      <div className="card-surface max-w-md p-6 text-center text-sm text-muted-foreground">
        This invitation link is missing required setup information. Please ask your administrator to resend it.
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp || submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const attempt = await signUp.create({
        strategy: "ticket",
        ticket: ticket as string,
        firstName,
        lastName,
        password,
      });

      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // isSignedIn flips true, and the effect in InvitePage takes over
        // (calls our own accept() to create the RestaurantMember).
        return;
      }

      // Clerk still wants something else before this sign-up is usable —
      // report exactly what, rather than a generic failure.
      const missing = attempt.missingFields?.length
        ? `Still needed: ${attempt.missingFields.join(", ")}.`
        : "Please check the fields above and try again.";
      setFormError(missing);
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        const nextFieldErrors: Record<string, string> = {};
        let generalMessage: string | null = null;
        for (const clerkError of err.errors) {
          if (clerkError.meta?.paramName) {
            nextFieldErrors[clerkError.meta.paramName] = clerkError.longMessage ?? clerkError.message;
          } else {
            generalMessage = clerkError.longMessage ?? clerkError.message;
          }
        }
        setFieldErrors(nextFieldErrors);
        setFormError(generalMessage);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface flex w-full max-w-md flex-col gap-4 p-6">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Email address</label>
        {/* Locked — the invited email comes from the ticket itself, not
            user input. Displaying it as disabled text (not a real input)
            makes it structurally impossible to edit from this form. */}
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {email}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="mb-1 block text-xs font-medium text-muted-foreground">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {fieldErrors.first_name && <p className="mt-1 text-xs text-danger">{fieldErrors.first_name}</p>}
        </div>
        <div>
          <label htmlFor="lastName" className="mb-1 block text-xs font-medium text-muted-foreground">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {fieldErrors.last_name && <p className="mt-1 text-xs text-danger">{fieldErrors.last_name}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {fieldErrors.password && <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>}
      </div>

      {formError && <p className="text-xs text-danger">{formError}</p>}

      {/* Clerk's bot-signup protection (Cloudflare Turnstile) mounts here —
          required for signUp.create() to succeed; see captcha_enabled in
          this instance's environment config. */}
      <div id="clerk-captcha" />

      <button
        type="submit"
        disabled={!isLoaded || submitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
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
