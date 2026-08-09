import { AppShell } from "@/components/layout/app-shell";
import { Bell, Plug, Sparkles, ShieldCheck, CreditCard } from "lucide-react";

// Application-level settings — notifications, integrations, AI preferences,
// security, and billing. Restaurant operational configuration (staffing
// minimums, role coverage, workforce departments/roles/skills) lives on the
// Restaurant Profile page instead, since those describe how the restaurant
// runs day-to-day rather than how the app itself behaves.

const CATEGORIES = [
  { icon: Bell, label: "Notifications" },
  { icon: Plug, label: "Integrations" },
  { icon: Sparkles, label: "AI Preferences" },
  { icon: ShieldCheck, label: "Security" },
  { icon: CreditCard, label: "Billing" },
];

export default function Page() {
  return (
    <AppShell title="Settings">
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
    </AppShell>
  );
}
