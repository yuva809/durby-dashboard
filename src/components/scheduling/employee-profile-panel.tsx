"use client";

import { useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEmployeeWorkforceProfile, useUpdateEmployeeWorkforceProfile,
  useWorkforceDepartments, useWorkforceRoles, useWorkforceSkills,
  useCreateWorkforceRule, useDeactivateWorkforceRule,
  type WorkforceRuleType,
} from "@/hooks/use-workforce";
import { useEmployeeComplianceDetail } from "@/hooks/use-compliance";

const TABS = [
  "General", "Department & Role", "Skills", "Availability",
  "Work Rules", "Locations", "Documents", "AI Profile",
] as const;
type PanelTab = (typeof TABS)[number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFT_TYPES = ["MORNING", "AFTERNOON", "EVENING"] as const;
const RULE_TYPES: { value: WorkforceRuleType; label: string; needsWeekday?: boolean; needsHours?: boolean; needsShifts?: boolean; needsShiftType?: boolean }[] = [
  { value: "NEVER_WEEKDAY", label: "Never scheduled on…", needsWeekday: true },
  { value: "ONLY_WEEKDAYS", label: "Only works these weekdays" },
  { value: "MAX_WEEKLY_HOURS", label: "Maximum hours per week", needsHours: true },
  { value: "MAX_SHIFTS_PER_WEEK", label: "Maximum shifts per week", needsShifts: true },
  { value: "ONLY_SHIFT_TYPE", label: "Only works this shift type", needsShiftType: true },
  { value: "CANNOT_OPEN", label: "Cannot open the store" },
  { value: "CANNOT_CLOSE", label: "Cannot close the store" },
  { value: "CANNOT_WORK_ALONE", label: "Cannot work alone" },
  { value: "MUST_WORK_WITH_SENIOR", label: "Must always work with senior staff" },
  { value: "MIN_HOURS_BETWEEN_SHIFTS", label: "Minimum hours between shifts", needsHours: true },
  { value: "PREFERRED_CONSECUTIVE_DAYS", label: "Prefers consecutive working days" },
];

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
      {children}
      {onRemove && (
        <button onClick={onRemove} className="rounded-full hover:bg-accent/20">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function EmployeeProfilePanel({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [tab, setTab] = useState<PanelTab>("General");
  const profile = useEmployeeWorkforceProfile(employeeId);
  const updateProfile = useUpdateEmployeeWorkforceProfile(employeeId);
  const departments = useWorkforceDepartments();
  const roles = useWorkforceRoles();
  const skills = useWorkforceSkills();
  const compliance = useEmployeeComplianceDetail(employeeId);
  const createRule = useCreateWorkforceRule();
  const deactivateRule = useDeactivateWorkforceRule();

  // Local edit state — synced from the fetched profile once loaded, saved
  // explicitly (same pattern as ShiftEditPanel: edit locally, Save button
  // commits via the mutation).
  const [departmentId, setDepartmentId] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [experienceLevel, setExperienceLevel] = useState<string>("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!profile.data) return;
    setDepartmentId(profile.data.department?.id ?? "");
    setRole(profile.data.role);
    setExperienceLevel(profile.data.experienceLevel ?? "");
    setSkillIds(profile.data.skills.map((s) => s.id));
    setNotes(profile.data.notes ?? "");
  }, [profile.data]);

  const [newRuleType, setNewRuleType] = useState<WorkforceRuleType>("NEVER_WEEKDAY");
  const [newRuleWeekday, setNewRuleWeekday] = useState(0);
  const [newRuleHours, setNewRuleHours] = useState("");
  const [newRuleShiftType, setNewRuleShiftType] = useState<(typeof SHIFT_TYPES)[number]>("MORNING");

  if (!profile.data) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card p-6 text-sm text-muted-foreground shadow-2xl">
        {profile.isLoading ? "Loading employee profile…" : "Could not load employee profile."}
      </div>
    );
  }

  const p = profile.data;
  const ruleDef = RULE_TYPES.find((r) => r.value === newRuleType)!;

  const addRule = () => {
    const params: Record<string, unknown> = {};
    if (ruleDef.needsWeekday) params.weekday = newRuleWeekday;
    if (ruleDef.needsHours) params[newRuleType === "MAX_WEEKLY_HOURS" ? "maxHours" : "minHours"] = Number(newRuleHours);
    if (ruleDef.needsShifts) params.maxShifts = Number(newRuleHours);
    if (ruleDef.needsShiftType) params.shiftType = newRuleShiftType;
    createRule.mutate({ employeeId, type: newRuleType, params });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 max-h-[75vh] overflow-y-auto border-t border-border bg-card shadow-2xl">
      <div className="mx-auto max-w-4xl px-6 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">{p.name}</p>
            <p className="text-sm text-muted-foreground">{p.role} · {p.contractType.replace("_", " ")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap border-b border-border">
          {TABS.map((t) => <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>{t}</TabButton>)}
        </div>

        {tab === "General" && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Name</p><p>{p.name}</p></div>
            <div><p className="text-xs text-muted-foreground">Employment Type</p><p>{p.contractType.replace("_", " ")}</p></div>
            <div><p className="text-xs text-muted-foreground">Max Weekly Hours</p><p>{p.weeklyContractedHours ?? p.maxWeeklyHrs}h</p></div>
            <div><p className="text-xs text-muted-foreground">Department</p><p>{p.department?.name ?? "—"}</p></div>
          </div>
        )}

        {tab === "Department & Role" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Department
              <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— none —</option>
                {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Role
              <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={role} onChange={(e) => setRole(e.target.value)}>
                {!roles.data?.some((r) => r.name === role) && <option value={role}>{role} (not in Workforce Settings)</option>}
                {roles.data?.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </label>
            <button
              onClick={() => updateProfile.mutate({ departmentId: departmentId || null, role })}
              disabled={updateProfile.isPending}
              className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {updateProfile.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {tab === "Skills" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {skillIds.map((id) => {
                const skill = skills.data?.find((s) => s.id === id);
                return skill ? (
                  <Chip key={id} onRemove={() => setSkillIds((prev) => prev.filter((s) => s !== id))}>{skill.name}</Chip>
                ) : null;
              })}
              {skillIds.length === 0 && <p className="text-xs text-muted-foreground">No skills assigned.</p>}
            </div>
            <select
              className="w-fit rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground"
              value=""
              onChange={(e) => e.target.value && setSkillIds((prev) => [...new Set([...prev, e.target.value])])}
            >
              <option value="">+ Add a skill…</option>
              {skills.data?.filter((s) => !skillIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={() => updateProfile.mutate({ skillIds })}
              disabled={updateProfile.isPending}
              className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {updateProfile.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {tab === "Availability" && (
          <div className="flex flex-col gap-1.5">
            {p.availability.length === 0 && <p className="text-xs text-muted-foreground">No weekly availability set yet.</p>}
            {p.availability.map((a) => (
              <div key={a.weekday} className="flex items-center gap-2 text-xs">
                <span className="w-9 font-medium text-muted-foreground">{WEEKDAYS[a.weekday]}</span>
                {a.available ? (
                  <span className="text-foreground">{a.startTime}–{a.endTime}</span>
                ) : (
                  <span className="text-red-400">Unavailable</span>
                )}
              </div>
            ))}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Managed via the AI Availability Assistant (Availability tab) — read-only here.
            </p>
          </div>
        )}

        {tab === "Work Rules" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              {p.workRules.length === 0 && <p className="text-xs text-muted-foreground">No rules configured.</p>}
              {p.workRules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                  <span>
                    {RULE_TYPES.find((t) => t.value === r.type)?.label ?? r.type}
                    {r.employeeId === null && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">restaurant-wide</span>}
                  </span>
                  {r.employeeId && (
                    <button onClick={() => deactivateRule.mutate(r.id)} className="text-xs text-muted-foreground hover:text-danger">Remove</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={newRuleType} onChange={(e) => setNewRuleType(e.target.value as WorkforceRuleType)}>
                {RULE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {ruleDef.needsWeekday && (
                <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={newRuleWeekday} onChange={(e) => setNewRuleWeekday(Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              )}
              {(ruleDef.needsHours || ruleDef.needsShifts) && (
                <input type="number" min={0} className="w-24 rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Value" value={newRuleHours} onChange={(e) => setNewRuleHours(e.target.value)} />
              )}
              {ruleDef.needsShiftType && (
                <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={newRuleShiftType} onChange={(e) => setNewRuleShiftType(e.target.value as (typeof SHIFT_TYPES)[number])}>
                  {SHIFT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <button onClick={addRule} disabled={createRule.isPending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">
                {createRule.isPending ? "Adding…" : "Add Rule"}
              </button>
            </div>
          </div>
        )}

        {tab === "Locations" && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Multi-location support is coming in a future phase. This restaurant is currently the employee&apos;s only location.
          </div>
        )}

        {tab === "Documents" && (
          <div className="flex flex-col gap-2">
            {compliance.data?.documents.length ? (
              compliance.data.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.documentType.replace(/_/g, " ")}</span>
                  {d.expiryDate && <span className="ml-auto text-xs text-muted-foreground">expires {d.expiryDate}</span>}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No documents on file.</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Upload and manage documents from the Compliance page.</p>
          </div>
        )}

        {tab === "AI Profile" && (
          <div className="flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Experience Level
              <select className="w-fit rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
                <option value="">— not set —</option>
                <option value="JUNIOR">Junior</option>
                <option value="SENIOR">Senior</option>
                <option value="TRAINER">Trainer</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Notes for AI reasoning
              <textarea className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button
              onClick={() => updateProfile.mutate({ experienceLevel: experienceLevel || null, notes: notes || null })}
              disabled={updateProfile.isPending}
              className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {updateProfile.isPending ? "Saving…" : "Save"}
            </button>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Certifications</p>
              {p.certifications.length === 0 && <p className="text-xs text-muted-foreground">None on file.</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.certifications.map((c) => <Chip key={c.certificationName}>{c.certificationName}</Chip>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
