"use client";

import { useState } from "react";
import { Mail, Building2, MailSearch, LifeBuoy } from "lucide-react";

const SUPPORT_EMAIL = "yuvanesh.raju5@gmail.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "I need access to my restaurant on Durby",
)}`;

// Shown by AppShell for any signed-in account with zero RestaurantMember
// rows (see backend GET /me's onboardingRequired flag). This is a purely
// presentational empty state — it never grants access on its own. The
// security model is unchanged: only an accepted Invitation creates a
// RestaurantMember row (see backend/src/modules/invitations/), and this
// screen exists precisely because the current session has none.
//
// We can't reliably detect server-side whether this particular account is
// "an invited person who hasn't clicked their link yet" vs. "a brand-new
// owner who hasn't been invited at all" — both look identical from here
// (signed in, zero memberships). Rather than guess, both paths are shown
// side by side and the person self-selects.
export function NoRestaurantScreen() {
  const [showInviteTip, setShowInviteTip] = useState(false);

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
            <Building2 className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Your account isn&apos;t linked to a restaurant yet
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            You&apos;re signed in and your account exists — it just hasn&apos;t been connected to a
            restaurant on Durby yet. That connection is made by accepting an invitation, not
            automatically. Pick whichever applies to you below.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          <div className="card-surface flex flex-col gap-3 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
              <Mail className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Already invited?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Please open the invitation link you received by email — it signs you in and
                connects your account automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInviteTip((v) => !v)}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              <MailSearch className="h-4 w-4" />
              I&apos;ve been invited
            </button>
            {showInviteTip && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Check your inbox for an email from Durby — the link looks like{" "}
                <code className="rounded bg-card px-1 py-0.5 text-[11px]">durby.tech/invite/…</code>.
                Don&apos;t see it? Check your spam or promotions folder, or ask whoever invited you
                to resend it.
              </p>
            )}
          </div>

          <div className="card-surface flex flex-col gap-3 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Setting up a new restaurant?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Restaurant accounts on Durby are created by an administrator. Please contact your
                administrator to receive an invitation.
              </p>
            </div>
            <a
              href={SUPPORT_MAILTO}
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
            >
              <LifeBuoy className="h-4 w-4" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
