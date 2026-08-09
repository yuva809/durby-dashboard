"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import {
  useRestaurantProfile,
  usePatchRestaurantProfile,
  type OpeningHours,
  type TimeWindow,
  type PatchProfilePayload,
} from "@/hooks/use-restaurant-profile";
import {
  useRoleCoverageRules, useCreateRoleCoverageRule, useDeleteRoleCoverageRule,
} from "@/hooks/use-role-coverage";
import {
  useWorkforceDepartments, useCreateWorkforceDepartment, useArchiveWorkforceDepartment,
  useWorkforceRoles, useCreateWorkforceRole, useArchiveWorkforceRole,
  useWorkforceSkills, useCreateWorkforceSkill, useArchiveWorkforceSkill,
  type WorkforceLookupDto,
} from "@/hooks/use-workforce";
import { cn } from "@/lib/utils";
import {
  Check, Plus, Trash2, AlertCircle, Save, ChevronDown, ChevronUp, Archive,
} from "lucide-react";

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 shadow-lg">
      <Check size={14} />
      {msg}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

function Field({
  label, error, children,
}: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle size={11} /> {error}
        </span>
      )}
    </div>
  );
}

const inputCls =
  "w-full min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent";

function Input({
  value, onChange, placeholder, error, type = "text",
}: {
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; error?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(inputCls, error && "border-red-500/50 focus:ring-red-500/50")}
    />
  );
}

function Toggle({
  checked, onChange, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-accent" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function NumberSpinner({
  value, onChange, min = 0, error,
}: {
  value: number; onChange: (v: number) => void; min?: number; error?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-foreground hover:bg-muted"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || 0))}
        className={cn(
          "h-8 w-16 rounded-md border border-border bg-muted/30 px-2 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent",
          error && "border-red-500/50",
        )}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-foreground hover:bg-muted"
      >
        +
      </button>
    </div>
  );
}

// ── Opening-hours editor ──────────────────────────────────────────────────────

const DAYS: Array<{ key: keyof OpeningHours; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function TimeWindowRow({
  w, idx, dayKey, onChange, onRemove,
}: {
  w: TimeWindow; idx: number;
  dayKey: keyof OpeningHours;
  onChange: (day: keyof OpeningHours, idx: number, field: "open" | "close", val: string) => void;
  onRemove: (day: keyof OpeningHours, idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        value={w.open}
        onChange={(e) => onChange(dayKey, idx, "open", e.target.value)}
        className={cn(inputCls, "w-32")}
      />
      <span className="text-xs text-muted-foreground">–</span>
      <input
        type="time"
        value={w.close === "00:00" ? "00:00" : w.close}
        onChange={(e) => onChange(dayKey, idx, "close", e.target.value)}
        className={cn(inputCls, "w-32")}
      />
      <button
        type="button"
        onClick={() => onRemove(dayKey, idx)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground hover:border-red-500/40 hover:text-red-400"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function OpeningHoursEditor({
  hours, onChange,
}: {
  hours: OpeningHours;
  onChange: (h: OpeningHours) => void;
}) {
  const isClosed = (day: keyof OpeningHours) => hours[day].length === 0;

  const toggleClosed = (day: keyof OpeningHours) => {
    if (isClosed(day)) {
      onChange({ ...hours, [day]: [{ open: "11:00", close: "22:00" }] });
    } else {
      onChange({ ...hours, [day]: [] });
    }
  };

  const addWindow = (day: keyof OpeningHours) => {
    onChange({
      ...hours,
      [day]: [...hours[day], { open: "11:00", close: "22:00" }],
    });
  };

  const updateWindow = (
    day: keyof OpeningHours, idx: number, field: "open" | "close", val: string,
  ) => {
    const updated = hours[day].map((w, i) => i === idx ? { ...w, [field]: val } : w);
    onChange({ ...hours, [day]: updated });
  };

  const removeWindow = (day: keyof OpeningHours, idx: number) => {
    const updated = hours[day].filter((_, i) => i !== idx);
    onChange({ ...hours, [day]: updated });
  };

  return (
    <div className="divide-y divide-border">
      {DAYS.map(({ key, label }) => (
        <div key={key} className="py-3 first:pt-0 last:pb-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <Toggle
              checked={!isClosed(key)}
              onChange={() => toggleClosed(key)}
              label={isClosed(key) ? "Closed" : "Open"}
            />
          </div>
          {!isClosed(key) && (
            <div className="ml-2 flex flex-col gap-2">
              {hours[key].map((w, i) => (
                <TimeWindowRow
                  key={i}
                  w={w} idx={i} dayKey={key}
                  onChange={updateWindow}
                  onRemove={removeWindow}
                />
              ))}
              <button
                type="button"
                onClick={() => addWindow(key)}
                className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus size={12} /> Add time window
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Empty opening hours default ───────────────────────────────────────────────

const EMPTY_HOURS: OpeningHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

// ── Validation ────────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  targetFoodCostPct?: string;
  avgTicketSize?: string;
  services?: string;
}

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!f.name.trim()) errors.name = "Name is required";
  if (f.targetFoodCostPct !== "" && (isNaN(Number(f.targetFoodCostPct)) || Number(f.targetFoodCostPct) < 0 || Number(f.targetFoodCostPct) > 100)) {
    errors.targetFoodCostPct = "Must be 0–100";
  }
  if (f.avgTicketSize !== "" && (isNaN(Number(f.avgTicketSize)) || Number(f.avgTicketSize) < 0)) {
    errors.avgTicketSize = "Must be a positive number";
  }
  if (!f.serviceDineIn && !f.serviceTakeaway && !f.serviceDelivery) {
    errors.services = "At least one service model must be enabled";
  }
  return errors;
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name:             string;
  cuisineType:      string;
  addressLine:      string;
  city:             string;
  countryCode:      string;
  timezone:         string;
  currency:         string;
  bundesland:       string;
  openingHours:     OpeningHours;
  seatsIndoor:      number;
  seatsTerrace:     number;
  serviceDineIn:    boolean;
  serviceTakeaway:  boolean;
  serviceDelivery:  boolean;
  minStaffKitchen:  number;
  minStaffService:  number;
  minStaffBar:      number;
  targetFoodCostPct: string;
  avgTicketSize:    string;
}

// ── Role Coverage Rules ────────────────────────────────────────────────────────
//
// Self-contained: its own fetch/mutations, independent of the profile form's
// save button — each add/remove takes effect immediately, same pattern as
// the Alerts page's resolve action, since these directly feed the scheduler
// and there's no reason to make a manager batch them into a "Save" click.

function RoleCoverageSection() {
  const { data: rules, isLoading, isError } = useRoleCoverageRules();
  const createRule = useCreateRoleCoverageRule();
  const deleteRule = useDeleteRoleCoverageRule();

  const [role, setRole] = useState("");
  const [canCover, setCanCover] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async () => {
    setFormError(null);
    if (!role.trim() || !canCover.trim()) {
      setFormError("Both fields are required");
      return;
    }
    try {
      await createRule.mutateAsync({ role: role.trim(), canCover: canCover.trim() });
      setRole("");
      setCanCover("");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to add rule");
    }
  };

  return (
    <Section title="Role Coverage Rules">
      <p className="mb-4 text-xs text-muted-foreground">
        Let one role cover shifts for another — e.g. a Line Cook can also be scheduled as a Cook,
        or a Bartender can cover Server. Direct rules only: adding Head Chef → Sous Chef does not
        automatically let a Head Chef cover Cook too — add that separately if you want it.
      </p>

      {isLoading && <p className="text-xs text-muted-foreground">Loading rules…</p>}
      {isError && <p className="text-xs text-red-400">Failed to load role coverage rules.</p>}

      {rules && rules.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
            >
              <span className="text-foreground">
                <span className="font-medium">{rule.role}</span>
                <span className="mx-2 text-muted-foreground">can cover</span>
                <span className="font-medium">{rule.canCover}</span>
              </span>
              <button
                type="button"
                onClick={() => deleteRule.mutate(rule.id)}
                disabled={deleteRule.isPending}
                className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {rules && rules.length === 0 && !isLoading && (
        <p className="mb-4 text-xs text-muted-foreground">
          No coverage rules yet — every role is scheduled strictly on its own.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Role">
          <Input value={role} onChange={setRole} placeholder="e.g. Line Cook" />
        </Field>
        <span className="pb-2 text-xs text-muted-foreground">can cover</span>
        <Field label="Can cover">
          <Input value={canCover} onChange={setCanCover} placeholder="e.g. Cook" />
        </Field>
        <button
          type="button"
          onClick={handleAdd}
          disabled={createRule.isPending}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Plus size={13} />
          Add rule
        </button>
      </div>
      {formError && (
        <span className="mt-2 flex items-center gap-1 text-xs text-red-400">
          <AlertCircle size={11} /> {formError}
        </span>
      )}
    </Section>
  );
}

// ── Workforce (Departments / Roles / Skills) ────────────────────────────────────
//
// Operational configuration, not an application setting — these are the
// restaurant-owned vocabularies the AI Workforce Profile is built on, so
// they live alongside Staffing Minimums and Role Coverage Rules rather than
// in the Settings page. Same "self-contained, saves immediately" pattern as
// RoleCoverageSection above. Backend/API unchanged from where this lived
// previously — this is a UI relocation only.

function WorkforceLookupList({
  title,
  items,
  isLoading,
  onCreate,
  isCreating,
  onArchive,
}: {
  title: string;
  items: WorkforceLookupDto[] | undefined;
  isLoading: boolean;
  onCreate: (name: string) => void;
  isCreating: boolean;
  onArchive: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input value={name} onChange={setName} placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}`} />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={isCreating || !name.trim()}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && items && items.length === 0 && (
          <p className="text-xs text-muted-foreground">None configured yet.</p>
        )}
        {items?.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
          >
            <span className="text-foreground">{item.name}</span>
            <button
              type="button"
              onClick={() => onArchive(item.id)}
              title="Archive"
              className="text-muted-foreground hover:text-red-400"
            >
              <Archive size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkforceConfigSection() {
  const departments = useWorkforceDepartments();
  const createDepartment = useCreateWorkforceDepartment();
  const archiveDepartment = useArchiveWorkforceDepartment();

  const roles = useWorkforceRoles();
  const createRole = useCreateWorkforceRole();
  const archiveRole = useArchiveWorkforceRole();

  const skills = useWorkforceSkills();
  const createSkill = useCreateWorkforceSkill();
  const archiveSkill = useArchiveWorkforceSkill();

  return (
    <Section title="Workforce">
      <p className="mb-4 text-xs text-muted-foreground">
        Departments, roles, and skills configured here are the only values employees can be
        assigned on the Scheduling page — this keeps staff data consistent for AI Scheduling,
        AI Chat, and Workforce Analytics.
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <WorkforceLookupList
          title="Departments"
          items={departments.data}
          isLoading={departments.isLoading}
          onCreate={(name) => createDepartment.mutate({ name })}
          isCreating={createDepartment.isPending}
          onArchive={(id) => archiveDepartment.mutate(id)}
        />
        <WorkforceLookupList
          title="Roles"
          items={roles.data}
          isLoading={roles.isLoading}
          onCreate={(name) => createRole.mutate({ name })}
          isCreating={createRole.isPending}
          onArchive={(id) => archiveRole.mutate(id)}
        />
        <WorkforceLookupList
          title="Skills"
          items={skills.data}
          isLoading={skills.isLoading}
          onCreate={(name) => createSkill.mutate({ name })}
          isCreating={createSkill.isPending}
          onArchive={(id) => archiveSkill.mutate(id)}
        />
      </div>
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RestaurantProfilePage() {
  const { data, isLoading, isError, error } = useRestaurantProfile();
  const patch = usePatchRestaurantProfile();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [toast, setToast] = useState<string | null>(null);

  // Initialise (or re-init) form when data loads
  useEffect(() => {
    if (!data) return;
    setForm({
      name:             data.name,
      cuisineType:      data.cuisineType,
      addressLine:      data.addressLine,
      city:             data.city,
      countryCode:      data.countryCode,
      timezone:         data.timezone,
      currency:         data.currency,
      bundesland:       data.bundesland,
      openingHours:     data.openingHours ?? EMPTY_HOURS,
      seatsIndoor:      data.seatsIndoor,
      seatsTerrace:     data.seatsTerrace,
      serviceDineIn:    data.serviceDineIn,
      serviceTakeaway:  data.serviceTakeaway,
      serviceDelivery:  data.serviceDelivery,
      minStaffKitchen:  data.minStaffKitchen,
      minStaffService:  data.minStaffService,
      minStaffBar:      data.minStaffBar,
      targetFoodCostPct: data.targetFoodCostPct != null ? String(data.targetFoodCostPct) : "",
      avgTicketSize:    data.avgTicketSize != null ? String(data.avgTicketSize) : "",
    });
  }, [data]);

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: val } : prev);
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const handleSave = async () => {
    if (!form) return;
    const errs = validate(form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload: PatchProfilePayload = {
      name:             form.name,
      cuisineType:      form.cuisineType,
      addressLine:      form.addressLine,
      city:             form.city,
      countryCode:      form.countryCode,
      timezone:         form.timezone,
      currency:         form.currency,
      bundesland:       form.bundesland,
      openingHours:     form.openingHours,
      seatsIndoor:      form.seatsIndoor,
      seatsTerrace:     form.seatsTerrace,
      serviceDineIn:    form.serviceDineIn,
      serviceTakeaway:  form.serviceTakeaway,
      serviceDelivery:  form.serviceDelivery,
      minStaffKitchen:  form.minStaffKitchen,
      minStaffService:  form.minStaffService,
      minStaffBar:      form.minStaffBar,
      targetFoodCostPct: form.targetFoodCostPct !== "" ? Number(form.targetFoodCostPct) : null,
      avgTicketSize:    form.avgTicketSize !== "" ? Number(form.avgTicketSize) : null,
    };

    try {
      await patch.mutateAsync(payload);
      setToast("Profile saved successfully");
    } catch {
      // No local state update needed — patch.isError/patch.error (rendered
      // next to the Save button below) already surfaces the real failure
      // reason. Previously this branch also called setErrors({ name: msg }),
      // which attached the same message to the Name field regardless of
      // what actually failed (network error, unrelated server validation,
      // etc.) — a false, misleading "Name is invalid"-looking message under
      // the wrong field, shown alongside the correct one near the button.
    }
  };

  // ── Render states ──────────────────────────────────────────────────────────

  if (isLoading || !form) return (
    <AppShell title="Restaurant Profile">
      <LoadingBanner label="Loading profile…" />
    </AppShell>
  );

  if (isError) return (
    <AppShell title="Restaurant Profile">
      <ErrorBanner message={(error as Error)?.message ?? "Failed to load profile"} />
    </AppShell>
  );

  return (
    <AppShell title="Restaurant Profile">
      <Toast msg={toast} onDone={() => setToast(null)} />

      <div className="max-w-3xl space-y-4">

        {/* ── Basics ─────────────────────────────────────────────────────── */}
        <Section title="Basics">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Restaurant Name" error={errors.name}>
              <Input value={form.name} onChange={(v) => set("name", v)} error={errors.name} />
            </Field>
            <Field label="Cuisine Type">
              <Input
                value={form.cuisineType}
                onChange={(v) => set("cuisineType", v)}
                placeholder="e.g. Modern European"
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.addressLine}
                onChange={(v) => set("addressLine", v)}
                placeholder="Street & number"
              />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(v) => set("city", v)} placeholder="Berlin" />
            </Field>
            <Field label="Bundesland">
              <select
                value={form.bundesland}
                onChange={(e) => set("bundesland", e.target.value)}
                className={inputCls}
              >
                {[
                  "Baden-Württemberg","Bavaria","Berlin","Brandenburg","Bremen",
                  "Hamburg","Hesse","Lower Saxony","Mecklenburg-Vorpommern",
                  "North Rhine-Westphalia","Rhineland-Palatinate","Saarland",
                  "Saxony","Saxony-Anhalt","Schleswig-Holstein","Thuringia",
                ].map((bl) => <option key={bl} value={bl}>{bl}</option>)}
              </select>
            </Field>
            <Field label="Country Code">
              <Input
                value={form.countryCode}
                onChange={(v) => set("countryCode", v.slice(0, 2).toUpperCase())}
                placeholder="DE"
              />
            </Field>
            <Field label="Timezone">
              <Input
                value={form.timezone}
                onChange={(v) => set("timezone", v)}
                placeholder="Europe/Berlin"
              />
            </Field>
            <Field label="Currency">
              <Input
                value={form.currency}
                onChange={(v) => set("currency", v.slice(0, 3).toUpperCase())}
                placeholder="EUR"
              />
            </Field>
          </div>
        </Section>

        {/* ── Opening Hours ───────────────────────────────────────────────── */}
        <Section title="Opening Hours">
          <OpeningHoursEditor
            hours={form.openingHours}
            onChange={(h) => set("openingHours", h)}
          />
        </Section>

        {/* ── Capacity ────────────────────────────────────────────────────── */}
        <Section title="Capacity">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Field label="Indoor Seats">
              <NumberSpinner
                value={form.seatsIndoor}
                onChange={(v) => set("seatsIndoor", v)}
              />
            </Field>
            <Field label="Terrace Seats">
              <NumberSpinner
                value={form.seatsTerrace}
                onChange={(v) => set("seatsTerrace", v)}
              />
            </Field>
          </div>
        </Section>

        {/* ── Service Model ────────────────────────────────────────────────── */}
        <Section title="Service Model">
          {errors.services && (
            <p className="mb-3 flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={12} /> {errors.services}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Toggle checked={form.serviceDineIn} onChange={(v) => set("serviceDineIn", v)} label="Dine-in" />
            <Toggle checked={form.serviceTakeaway} onChange={(v) => set("serviceTakeaway", v)} label="Takeaway" />
            <Toggle checked={form.serviceDelivery} onChange={(v) => set("serviceDelivery", v)} label="Delivery" />
          </div>
        </Section>

        {/* ── Staffing Minimums ────────────────────────────────────────────── */}
        <Section title="Staffing Minimums">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Field label="Kitchen Staff">
              <NumberSpinner
                value={form.minStaffKitchen}
                onChange={(v) => set("minStaffKitchen", v)}
              />
            </Field>
            <Field label="Service Staff">
              <NumberSpinner
                value={form.minStaffService}
                onChange={(v) => set("minStaffService", v)}
              />
            </Field>
            <Field label="Bar Staff">
              <NumberSpinner
                value={form.minStaffBar}
                onChange={(v) => set("minStaffBar", v)}
              />
            </Field>
          </div>
        </Section>

        {/* ── Role Coverage Rules ────────────────────────────────────────────── */}
        <RoleCoverageSection />

        {/* ── Workforce (Departments / Roles / Skills) ────────────────────────── */}
        <WorkforceConfigSection />

        {/* ── Financial Targets ─────────────────────────────────────────────── */}
        <Section title="Financial Targets">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Target Food Cost %" error={errors.targetFoodCostPct}>
              <div className="relative">
                <Input
                  type="number"
                  value={form.targetFoodCostPct}
                  onChange={(v) => set("targetFoodCostPct", v)}
                  placeholder="30"
                  error={errors.targetFoodCostPct}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field label="Avg Ticket Size" error={errors.avgTicketSize}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                <input
                  type="number"
                  value={form.avgTicketSize}
                  onChange={(e) => {
                    set("avgTicketSize", e.target.value);
                    setErrors((prev) => ({ ...prev, avgTicketSize: undefined }));
                  }}
                  placeholder="38"
                  className={cn(
                    inputCls, "pl-7",
                    errors.avgTicketSize && "border-red-500/50 focus:ring-red-500/50",
                  )}
                />
              </div>
              {errors.avgTicketSize && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle size={11} /> {errors.avgTicketSize}
                </span>
              )}
            </Field>
          </div>
        </Section>

        {/* ── Save button ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pb-2">
          {patch.isError && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={12} />
              {(patch.error as Error)?.message ?? "Save failed"}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={patch.isPending}
            className={cn(
              "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors",
              patch.isPending
                ? "cursor-not-allowed bg-accent/50 text-accent-foreground/50"
                : "bg-accent text-accent-foreground hover:bg-accent/90",
            )}
          >
            <Save size={14} />
            {patch.isPending ? "Saving…" : "Save Profile"}
          </button>
        </div>

      </div>
    </AppShell>
  );
}
