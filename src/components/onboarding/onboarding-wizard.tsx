"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import {
  useRestaurantProfile,
  usePatchRestaurantProfile,
  useCompleteOnboarding,
  type OpeningHours,
  type PatchProfilePayload,
} from "@/hooks/use-restaurant-profile";
import {
  useWorkforceRoles,
  useCreateWorkforceRole,
  useArchiveWorkforceRole,
} from "@/hooks/use-workforce";
import { useIntegrations, useConnectIntegration } from "@/hooks/use-integrations";

// ── Shared style tokens — match restaurant-profile page's existing conventions ─

const inputCls =
  "w-full min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent";
const primaryBtnCls =
  "flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50";
const secondaryBtnCls =
  "flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50";
const ghostBtnCls = "text-sm text-muted-foreground hover:text-foreground disabled:opacity-50";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ChoiceGrid<T extends string>({
  options, value, onChange,
}: { options: Array<{ value: T; label: string }>; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            value === opt.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-muted/20 text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const STEP_LABELS = ["Restaurant", "Team", "Operations", "Integrations", "Ready"] as const;
const LOCAL_STORAGE_STEP_PREFIX = "durby-onboarding-step:";

const BUSINESS_TYPES = ["Restaurant", "Café", "Bar", "Bakery", "Fast Food", "Other"] as const;
const DAYS: Array<{ key: keyof OpeningHours; label: string }> = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" }, { key: "sun", label: "Sun" },
];
const ALL_DAY_KEYS = DAYS.map((d) => d.key);

const ROLE_SUGGESTIONS = ["Manager", "Kitchen", "Waiter", "Bartender", "Delivery"];

const POS_OPTIONS = ["Liefersoft", "Square", "Toast", "Lightspeed", "Other", "None", "Not sure"];
const INVENTORY_METHODS = ["Software", "Excel / spreadsheets", "Paper", "Manually", "Other"];
const INVENTORY_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Rarely", "Not currently"];
const SCHEDULING_METHODS = ["Scheduling software", "Excel / spreadsheets", "Manually", "Other"];

interface RestaurantForm {
  name: string;
  businessType: string | null;
  addressLine: string;
  city: string;
  estimatedLocationCount: string; // kept as string for controlled-input friendliness
  openDays: Set<string>;
  openTime: string;
  closeTime: string;
  seatsIndoor: string;
}

interface TeamForm {
  estimatedEmployeeCount: string;
  estimatedManagerCount: string;
}

interface OperationsForm {
  estimatedDailyOrders: string;
  posProvider: string | null;
  inventoryMethod: string | null;
  inventoryCountFrequency: string | null;
  schedulingMethod: string | null;
}

function emptyRestaurantForm(): RestaurantForm {
  return {
    name: "", businessType: null, addressLine: "", city: "",
    estimatedLocationCount: "1", openDays: new Set(ALL_DAY_KEYS), openTime: "11:00", closeTime: "23:00",
    seatsIndoor: "",
  };
}

export function OnboardingWizard() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const { data: profile, isLoading: profileLoading } = useRestaurantProfile();
  const patchProfile = usePatchRestaurantProfile();
  const completeOnboarding = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hydrated = useRef(false);

  const [restaurantForm, setRestaurantForm] = useState<RestaurantForm>(emptyRestaurantForm());
  const [teamForm, setTeamForm] = useState<TeamForm>({ estimatedEmployeeCount: "", estimatedManagerCount: "" });
  const [opsForm, setOpsForm] = useState<OperationsForm>({
    estimatedDailyOrders: "", posProvider: null, inventoryMethod: null, inventoryCountFrequency: null, schedulingMethod: null,
  });

  // Resume: restore the saved step (per-restaurant, so switching accounts
  // never shows a stale step) and prefill every form from whatever's
  // already been persisted — a refresh mid-wizard never loses progress.
  useEffect(() => {
    if (!restaurantId) return;
    const saved = window.localStorage.getItem(LOCAL_STORAGE_STEP_PREFIX + restaurantId);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n) && n >= 0 && n < STEP_LABELS.length) setStep(n);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!profile || hydrated.current) return;
    hydrated.current = true;
    const openDays = new Set(ALL_DAY_KEYS.filter((d) => (profile.openingHours[d]?.length ?? 0) > 0));
    const firstWindow = DAYS.map((d) => profile.openingHours[d.key][0]).find(Boolean);
    setRestaurantForm({
      name: profile.name ?? "",
      businessType: profile.businessType,
      addressLine: profile.addressLine ?? "",
      city: profile.city ?? "",
      estimatedLocationCount: profile.estimatedLocationCount != null ? String(profile.estimatedLocationCount) : "1",
      openDays: openDays.size > 0 ? openDays : new Set(ALL_DAY_KEYS),
      openTime: firstWindow?.open ?? "11:00",
      closeTime: firstWindow?.close ?? "23:00",
      seatsIndoor: profile.seatsIndoor ? String(profile.seatsIndoor) : "",
    });
    setTeamForm({
      estimatedEmployeeCount: profile.estimatedEmployeeCount != null ? String(profile.estimatedEmployeeCount) : "",
      estimatedManagerCount: profile.estimatedManagerCount != null ? String(profile.estimatedManagerCount) : "",
    });
    setOpsForm({
      estimatedDailyOrders: profile.estimatedDailyOrders != null ? String(profile.estimatedDailyOrders) : "",
      posProvider: profile.posProvider,
      inventoryMethod: profile.inventoryMethod,
      inventoryCountFrequency: profile.inventoryCountFrequency,
      schedulingMethod: profile.schedulingMethod,
    });
  }, [profile]);

  function persistStep(next: number) {
    setStep(next);
    if (restaurantId) window.localStorage.setItem(LOCAL_STORAGE_STEP_PREFIX + restaurantId, String(next));
  }

  async function save(payload: PatchProfilePayload): Promise<boolean> {
    setSaveError(null);
    try {
      await patchProfile.mutateAsync(payload);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save — please try again.");
      return false;
    }
  }

  const restaurantValid = restaurantForm.name.trim().length > 0 && !!restaurantForm.businessType;

  async function handleContinue() {
    if (step === 0) {
      if (!restaurantValid) {
        setSaveError("Restaurant name and type are required.");
        return;
      }
      const openingHours: OpeningHours = {
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
      };
      for (const day of ALL_DAY_KEYS) {
        if (restaurantForm.openDays.has(day)) {
          openingHours[day] = [{ open: restaurantForm.openTime, close: restaurantForm.closeTime }];
        }
      }
      const ok = await save({
        name: restaurantForm.name.trim(),
        businessType: restaurantForm.businessType,
        addressLine: restaurantForm.addressLine.trim(),
        city: restaurantForm.city.trim(),
        estimatedLocationCount: restaurantForm.estimatedLocationCount ? parseInt(restaurantForm.estimatedLocationCount, 10) : null,
        openingHours,
        seatsIndoor: restaurantForm.seatsIndoor ? parseInt(restaurantForm.seatsIndoor, 10) : 0,
      });
      if (!ok) return;
    } else if (step === 1) {
      const ok = await save({
        estimatedEmployeeCount: teamForm.estimatedEmployeeCount ? parseInt(teamForm.estimatedEmployeeCount, 10) : null,
        estimatedManagerCount: teamForm.estimatedManagerCount ? parseInt(teamForm.estimatedManagerCount, 10) : null,
      });
      if (!ok) return;
    } else if (step === 2) {
      const ok = await save({
        estimatedDailyOrders: opsForm.estimatedDailyOrders ? parseInt(opsForm.estimatedDailyOrders, 10) : null,
        posProvider: opsForm.posProvider,
        inventoryMethod: opsForm.inventoryMethod,
        inventoryCountFrequency: opsForm.inventoryCountFrequency,
        schedulingMethod: opsForm.schedulingMethod,
      });
      if (!ok) return;
    }
    persistStep(Math.min(step + 1, STEP_LABELS.length - 1));
  }

  function handleBack() {
    setSaveError(null);
    persistStep(Math.max(step - 1, 0));
  }

  async function handleFinish() {
    setSaveError(null);
    try {
      await completeOnboarding.mutateAsync();
      if (restaurantId) window.localStorage.removeItem(LOCAL_STORAGE_STEP_PREFIX + restaurantId);
      router.push("/dashboard");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not finish setup — please try again.");
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your restaurant…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Welcome to Durby</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Let&apos;s set up your restaurant</h1>
        <p className="mt-1 text-sm text-muted-foreground">Just a few quick questions — you can change any of this later.</p>
      </div>

      <StepIndicator step={step} />

      <div className="card-surface mt-6 p-6 sm:p-8">
        {step === 0 && <StepRestaurant form={restaurantForm} onChange={setRestaurantForm} />}
        {step === 1 && <StepTeam form={teamForm} onChange={setTeamForm} />}
        {step === 2 && <StepOperations form={opsForm} onChange={setOpsForm} />}
        {step === 3 && <StepIntegrations />}
        {step === 4 && (
          <StepReady
            restaurantForm={restaurantForm}
            teamForm={teamForm}
            opsForm={opsForm}
          />
        )}

        {saveError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <span>{saveError}</span>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            // Also disabled mid-save: Continue's persistStep(step + 1) runs
            // after its await resolves, using the step value captured when
            // it was clicked — if Back were allowed to fire first, that
            // stale continuation would still land and jump the user
            // forward again once the in-flight save completes.
            disabled={step === 0 || patchProfile.isPending}
            className={secondaryBtnCls}
          >
            Back
          </button>
          <div className="flex items-center gap-4">
            {(step === 1 || step === 2 || step === 3) && (
              <button
                type="button"
                onClick={step === 3 ? () => persistStep(4) : handleContinue}
                disabled={patchProfile.isPending}
                className={ghostBtnCls}
              >
                Skip for now
              </button>
            )}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                onClick={handleContinue}
                disabled={patchProfile.isPending || (step === 0 && !restaurantValid)}
                className={primaryBtnCls}
              >
                {patchProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={completeOnboarding.isPending}
                className={primaryBtnCls}
              >
                {completeOnboarding.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enter Durby"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progress indicator ─────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                i < step && "border-accent bg-accent text-white",
                i === step && "border-accent text-accent",
                i > step && "border-border text-muted-foreground",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("hidden text-[11px] sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={cn("mx-1.5 h-px flex-1 sm:mx-2", i < step ? "bg-accent" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1 — Restaurant ─────────────────────────────────────────────────────────

function StepRestaurant({ form, onChange }: { form: RestaurantForm; onChange: (f: RestaurantForm) => void }) {
  function set<K extends keyof RestaurantForm>(key: K, value: RestaurantForm[K]) {
    onChange({ ...form, [key]: value });
  }
  function toggleDay(day: string) {
    const next = new Set(form.openDays);
    if (next.has(day)) next.delete(day); else next.add(day);
    onChange({ ...form, openDays: next });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Restaurant name *">
        <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ABC Kitchen" />
      </Field>

      <Field label="Restaurant type *">
        <ChoiceGrid
          options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
          value={form.businessType as (typeof BUSINESS_TYPES)[number] | null}
          onChange={(v) => set("businessType", v)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Address">
          <input className={inputCls} value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} placeholder="Street address" />
        </Field>
        <Field label="City">
          <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Berlin" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Number of locations">
          <input type="number" min={1} className={inputCls} value={form.estimatedLocationCount} onChange={(e) => set("estimatedLocationCount", e.target.value)} />
        </Field>
        <Field label="Seating capacity">
          <input type="number" min={0} className={inputCls} value={form.seatsIndoor} onChange={(e) => set("seatsIndoor", e.target.value)} placeholder="e.g. 40" />
        </Field>
      </div>

      <Field label="Opening days" hint="Defaults to every day — adjust if you're closed some days.">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggleDay(d.key)}
              className={cn(
                "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
                form.openDays.has(d.key)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-muted/20 text-muted-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Opening time">
          <input type="time" className={inputCls} value={form.openTime} onChange={(e) => set("openTime", e.target.value)} />
        </Field>
        <Field label="Closing time">
          <input type="time" className={inputCls} value={form.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

// ── Step 2 — Team ───────────────────────────────────────────────────────────────

function StepTeam({ form, onChange }: { form: TeamForm; onChange: (f: TeamForm) => void }) {
  const { data: roles } = useWorkforceRoles();
  const createRole = useCreateWorkforceRole();
  const archiveRole = useArchiveWorkforceRole();
  const [newRole, setNewRole] = useState("");

  async function addRole(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createRole.mutateAsync({ name: trimmed }).catch(() => {});
    setNewRole("");
  }

  const existingNames = new Set((roles ?? []).map((r) => r.name.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Total number of employees">
          <input
            type="number" min={0} className={inputCls}
            value={form.estimatedEmployeeCount}
            onChange={(e) => onChange({ ...form, estimatedEmployeeCount: e.target.value })}
            placeholder="e.g. 18"
          />
        </Field>
        <Field label="Number of managers">
          <input
            type="number" min={0} className={inputCls}
            value={form.estimatedManagerCount}
            onChange={(e) => onChange({ ...form, estimatedManagerCount: e.target.value })}
            placeholder="e.g. 2"
          />
        </Field>
      </div>

      <Field label="Staff roles" hint="Add the roles your team works — you can add real employees later in Workforce.">
        <div className="flex flex-wrap gap-2">
          {(roles ?? []).map((role) => (
            <span key={role.id} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground">
              {role.name}
              <button
                type="button"
                onClick={() => archiveRole.mutate(role.id)}
                className="text-muted-foreground hover:text-red-500"
                aria-label={`Remove ${role.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROLE_SUGGESTIONS.filter((r) => !existingNames.has(r.toLowerCase())).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addRole(suggestion)}
              className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-accent hover:text-accent"
            >
              + {suggestion}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className={inputCls}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRole(newRole); } }}
            placeholder="Other role…"
          />
          <button type="button" onClick={() => addRole(newRole)} className={secondaryBtnCls}>Add</button>
        </div>
      </Field>
    </div>
  );
}

// ── Step 3 — Operations ─────────────────────────────────────────────────────────

function StepOperations({ form, onChange }: { form: OperationsForm; onChange: (f: OperationsForm) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">Sales</p>
        <div className="flex flex-col gap-4">
          <Field label="Approximate daily orders/customers">
            <input
              type="number" min={0} className={inputCls}
              value={form.estimatedDailyOrders}
              onChange={(e) => onChange({ ...form, estimatedDailyOrders: e.target.value })}
              placeholder="e.g. 120"
            />
          </Field>
          <Field label="POS currently used">
            <ChoiceGrid options={POS_OPTIONS.map((p) => ({ value: p, label: p }))} value={form.posProvider} onChange={(v) => onChange({ ...form, posProvider: v })} />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">Inventory</p>
        <div className="flex flex-col gap-4">
          <Field label="How do you currently manage inventory?">
            <ChoiceGrid options={INVENTORY_METHODS.map((m) => ({ value: m, label: m }))} value={form.inventoryMethod} onChange={(v) => onChange({ ...form, inventoryMethod: v })} />
          </Field>
          <Field label="How often do you count inventory?">
            <ChoiceGrid options={INVENTORY_FREQUENCIES.map((f) => ({ value: f, label: f }))} value={form.inventoryCountFrequency} onChange={(v) => onChange({ ...form, inventoryCountFrequency: v })} />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">Scheduling</p>
        <Field label="How are staff schedules currently created?">
          <ChoiceGrid options={SCHEDULING_METHODS.map((m) => ({ value: m, label: m }))} value={form.schedulingMethod} onChange={(v) => onChange({ ...form, schedulingMethod: v })} />
        </Field>
      </div>
    </div>
  );
}

// ── Step 4 — Integrations ───────────────────────────────────────────────────────

function StepIntegrations() {
  const { data: groups, isLoading } = useIntegrations();
  const connect = useConnectIntegration();

  const providers = (groups ?? []).flatMap((g) => g.providers).slice(0, 6);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading integrations…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Connect the tools you already use — or skip this and set it up anytime from Settings → Integrations.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {providers.map((p) => {
          // OAuth-based and not-yet-implemented providers need their own
          // full flow (e.g. Google's consent screen) — that flow lives on
          // /dashboard/integrations, which is itself gated behind
          // onboarding being complete, so navigating there mid-wizard
          // would just bounce straight back here. Point people there by
          // name instead of offering a button that silently goes nowhere;
          // only providers connectable with a single API call get a real
          // "Connect" button here.
          const connectableHere = !p.config?.connected && p.implemented && p.authType !== "oauth2";
          const needsFullFlow = !p.config?.connected && (!p.implemented || p.authType === "oauth2");
          return (
            <div key={p.providerId} className="flex flex-col gap-2 rounded-lg border border-border bg-muted/10 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                {p.config?.connected && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-500">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.tagline}</p>
              {connectableHere && (
                <button
                  type="button"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(p.providerId)}
                  className="mt-1 self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  Connect
                </button>
              )}
              {needsFullFlow && (
                <p className="mt-1 text-[11px] text-muted-foreground">Set up later from Settings → Integrations</p>
              )}
            </div>
          );
        })}
        {providers.length === 0 && (
          <p className="text-sm text-muted-foreground">No integrations configured yet — you can add these anytime.</p>
        )}
      </div>
    </div>
  );
}

// ── Step 5 — Ready ──────────────────────────────────────────────────────────────

function StepReady({
  restaurantForm, teamForm, opsForm,
}: {
  restaurantForm: RestaurantForm; teamForm: TeamForm; opsForm: OperationsForm;
}) {
  const rows: Array<[string, string]> = [
    ["Restaurant", restaurantForm.name || "—"],
    ["Type", restaurantForm.businessType || "—"],
    ["Employees", teamForm.estimatedEmployeeCount || "—"],
    ["Opening hours", `${restaurantForm.openTime} – ${restaurantForm.closeTime}`],
    ["Locations", restaurantForm.estimatedLocationCount || "1"],
    ["POS", opsForm.posProvider || "—"],
  ];
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
        <Check className="h-6 w-6 text-accent" />
      </div>
      <div className="w-full max-w-sm divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{value}</span>
          </div>
        ))}
      </div>
      <p className="text-base font-semibold text-foreground">Your restaurant is ready for Durby.</p>
    </div>
  );
}
