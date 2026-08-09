"use client";

import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Calendar, Sparkles, CheckCheck, Users, Clock,
  TrendingUp, Banknote, ShieldCheck, AlertTriangle, X, Pencil, UserCheck,
  RefreshCw, Zap, Lightbulb, ArrowRight, Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner, ConfigMissingBanner } from "@/components/shared/query-states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useWeeklySchedule, useGenerateSchedule, useApproveSchedule,
  useUpdateShift, useReassignShift, useRebalance,
  type ScheduledShiftDto, type ScheduleEmployeeDto, type ReassignResult,
  type ReplacementSuggestion, type RoleCoverage,
} from "@/hooks/use-scheduling";
import { useAvailabilityStatus } from "@/hooks/use-availability";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { useRoleCoverageRules } from "@/hooks/use-role-coverage";
import {
  useStaffingRecommendations, type StaffingRecommendationConfidence,
} from "@/hooks/use-staffing-recommendations";
import { formatCurrency, cn } from "@/lib/utils";
import { buildRoleCoverageMap, isEligibleForRole } from "@/lib/role-coverage";
import { AvailabilityTab } from "@/components/scheduling/availability-tab";
import { WorkflowPipeline, buildWorkflowStages } from "@/components/scheduling/workflow-pipeline";
import { DemandExplanationPanel } from "@/components/scheduling/demand-explanation-panel";
import { EmployeeProfilePanel } from "@/components/scheduling/employee-profile-panel";

type SchedulingTab = "overview" | "availability" | "schedule";

const TABS: { key: SchedulingTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "availability", label: "Availability" },
  { key: "schedule", label: "Schedule" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toWeekStartStr(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T12:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}, ${start.getUTCFullYear()}`;
}

function buildWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + i);
    return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")].join("-");
  });
}

function computeHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Summary tile ─────────────────────────────────────────────────────────────

function SummaryTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Coverage card ────────────────────────────────────────────────────────────

const MAX_CONSTRAINTS_SHOWN = 3;

function CoverageCard({ coveragePct, coverageByRole, estimatedAdditionalHours }: {
  coveragePct: number;
  coverageByRole: RoleCoverage[];
  estimatedAdditionalHours: number;
}) {
  const totalRequired = coverageByRole.reduce((s, r) => s + r.required, 0);
  const totalFilled = coverageByRole.reduce((s, r) => s + r.filled, 0);
  const topConstraints = coverageByRole.filter((r) => r.deficit > 0).slice(0, MAX_CONSTRAINTS_SHOWN);
  const coverageColor = coveragePct >= 80 ? "text-emerald-600 dark:text-emerald-400" : coveragePct >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-danger";

  return (
    <div className="flex min-w-[280px] flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">Coverage</span>
      </div>
      <p className={`text-xl font-semibold ${coverageColor}`}>{coveragePct}%</p>

      {totalRequired > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Filled</p>
          <p className="text-sm text-foreground">{totalFilled} / {totalRequired} shifts</p>
        </div>
      )}

      {topConstraints.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Primary constraint</p>
          <ul className="mt-0.5 space-y-0.5">
            {topConstraints.map((r) => (
              <li key={r.role} className="text-xs text-muted-foreground">• {r.role}s (-{r.deficit})</li>
            ))}
          </ul>
        </div>
      )}

      {estimatedAdditionalHours > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estimated additional labour</p>
          <p className="text-sm text-foreground">≈ {Math.round(estimatedAdditionalHours)} hours</p>
        </div>
      )}
    </div>
  );
}

// ─── AI Workforce Recommendation ──────────────────────────────────────────────
//
// Every number shown here (hire counts, "X% → Y%") comes from the backend
// actually re-running the assignment algorithm against a hypothetical
// roster and reading off the real result — not an LLM guessing a plausible
// answer. See staffing-recommendation.service.ts.

const CONFIDENCE_LABELS: Record<StaffingRecommendationConfidence, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CONFIDENCE_STYLES: Record<StaffingRecommendationConfidence, string> = {
  HIGH: "text-emerald-600 dark:text-emerald-400",
  MEDIUM: "text-yellow-600 dark:text-yellow-400",
  LOW: "text-danger",
};

function WorkforceRecommendationPanel({ weekStart }: { weekStart: string }) {
  const { data, isFetching, isError, error, refetch } = useStaffingRecommendations(weekStart);

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <Lightbulb className="h-4 w-4" />
          AI Workforce Recommendation
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isFetching ? "Simulating…" : data ? "Recompute" : "Generate"}
        </button>
      </div>

      {isError && (
        <p className="text-xs text-danger">
          {error instanceof Error ? error.message : "Failed to generate recommendations."}
        </p>
      )}

      {!data && !isFetching && !isError && (
        <p className="text-xs text-muted-foreground">
          Simulates hiring, cross-training, and hours changes against this week's actual demand to
          recommend concrete staffing actions — not a guess, a re-run of the real scheduling algorithm.
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            {data.recommendations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No staffing gap found worth acting on this week.</p>
            ) : (
              <ul className="mb-3 space-y-1">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-foreground">• {rec.description}</li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Estimated coverage improvement:</span>
              <span className="font-semibold text-foreground">{data.currentCoveragePct}%</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.projectedCoveragePct}%</span>
            </div>
          </div>

          <div className="flex min-w-[200px] flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 sm:min-w-[220px]">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Projected Coverage</p>
              <p className="text-lg font-semibold text-foreground">{data.projectedCoveragePct}%</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Simulation Confidence</p>
              <p className={`text-sm font-medium ${CONFIDENCE_STYLES[data.confidence]}`}>
                {CONFIDENCE_LABELS[data.confidence]}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Assumptions</p>
              <ul className="space-y-0.5">
                {data.assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-500" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Impact toast ─────────────────────────────────────────────────────────────

function ImpactToast({ result, employees, onDismiss }: {
  result: ReassignResult;
  employees: ScheduleEmployeeDto[];
  onDismiss: () => void;
}) {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const from = empMap.get(result.fromEmployeeId);
  const to = empMap.get(result.toEmployeeId);
  const hasWarning = result.violations.length > 0;

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border p-4 shadow-xl ${
      hasWarning ? "border-yellow-500/40 bg-yellow-500/10" : "border-emerald-500/40 bg-emerald-500/10"
    }`}>
      <div className={`mt-0.5 flex-shrink-0 ${hasWarning ? "text-yellow-500" : "text-emerald-500"}`}>
        {hasWarning ? <AlertTriangle className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
      </div>
      <div className="flex-1 text-sm">
        <p className="font-medium text-foreground">
          Shift moved to {to?.name ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {from?.name}: {result.impactFrom.prevWeeklyHours}h → {result.impactFrom.newWeeklyHours}h &nbsp;·&nbsp;
          {to?.name}: {result.impactTo.prevWeeklyHours}h → {result.impactTo.newWeeklyHours}h
        </p>
        {result.violations.map((v, i) => (
          <p key={i} className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">{v}</p>
        ))}
      </div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── Replacement panel ────────────────────────────────────────────────────────

function ReplacementPanel({
  shift,
  suggestions,
  onAssign,
  onClose,
  isAssigning,
}: {
  shift: ScheduledShiftDto;
  suggestions: ReplacementSuggestion[];
  onAssign: (employeeId: string) => void;
  onClose: () => void;
  isAssigning: boolean;
}) {
  const displayDate = new Date(shift.date + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card shadow-2xl">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              <p className="font-semibold text-foreground">AI Replacement Suggestions</p>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {displayDate} · {shift.role} · {shift.startTime}–{shift.endTime}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No available employees found for this shift. Check availability or consider hiring extra staff.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.slice(0, 3).map((s, i) => (
              <div key={s.employee.id} className={`flex items-center gap-4 rounded-lg border p-3 ${
                i === 0 ? "border-accent/40 bg-accent/5" : "border-border bg-card"
              }`}>
                {i === 0 && (
                  <span className="flex-shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Best
                  </span>
                )}
                <div className="flex-1">
                  <p className="font-medium text-foreground">{s.employee.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.employee.role}
                    {s.roleMatch === "secondary" && ` · ${shift.role} (secondary role)`}
                    {" · "}
                    {s.scheduledHours}/{s.maxHours}h this week
                    {s.overtimeRisk
                      ? " · ⚠️ Near limit"
                      : ` · ${Math.round((s.maxHours - s.afterHours) * 10) / 10}h remaining`}
                  </p>
                </div>
                <button
                  onClick={() => onAssign(s.employee.id)}
                  disabled={isAssigning}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    i === 0
                      ? "bg-accent text-white hover:bg-accent/90"
                      : "border border-border hover:bg-muted"
                  }`}
                >
                  Assign
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shift edit panel ─────────────────────────────────────────────────────────

function ShiftEditPanel({
  shift, employeeName, date, weekStart, allRoles, onClose, onSaved, onDirtyChange,
}: {
  shift: ScheduledShiftDto; employeeName: string; date: string;
  weekStart: string; allRoles: string[];
  /** User-initiated close (X button) — goes through the parent's dirty check. */
  onClose: () => void;
  /** Close after a successful Save/Remove mutation — unconditional, since
   *  there's nothing unsaved left to warn about at that point. Using
   *  `onClose` here instead would immediately re-trigger the "discard
   *  changes?" dialog against a stale dirty flag. */
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [role, setRole] = useState(shift.role);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const updateShift = useUpdateShift();

  // Previously, switching weeks (or clicking away) while these fields had
  // unsaved edits discarded them silently — the panel is fully unmounted
  // (editingShiftId reset) with no warning. Report dirtiness up so the
  // parent can gate week navigation and the close button on it.
  useEffect(() => {
    onDirtyChange(startTime !== shift.startTime || endTime !== shift.endTime || role !== shift.role);
  }, [startTime, endTime, role, shift, onDirtyChange]);

  const displayDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card shadow-2xl">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">{employeeName}</p>
            <p className="text-sm text-muted-foreground">{displayDate}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Start
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            End
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50">
              {allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={() => updateShift.mutate({ shiftId: shift.id, scheduleWeekStart: weekStart, dto: { startTime, endTime, role } }, { onSuccess: onSaved })}
              disabled={updateShift.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50">
              {updateShift.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setConfirmRemove(true)}
              disabled={updateShift.isPending}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/20 disabled:opacity-50">
              Remove
            </button>
          </div>
          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title="Remove this shift?"
            description={`${employeeName}'s ${startTime}–${endTime} shift on ${displayDate} will be cancelled. This can't be undone from here.`}
            confirmLabel="Remove Shift"
            isLoading={updateShift.isPending}
            onConfirm={() =>
              updateShift.mutate(
                { shiftId: shift.id, scheduleWeekStart: weekStart, dto: { status: "CANCELLED" } },
                { onSuccess: onSaved },
              )
            }
          />
        </div>
        {updateShift.isError && (
          <p className="mt-2 text-xs text-red-500">{String(updateShift.error)}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const restaurantId = useRestaurantId();
  const [weekStart, setWeekStart] = useState<string>(() => toWeekStartStr(getMonday(new Date())));
  const [activeTab, setActiveTab] = useState<SchedulingTab>("overview");

  // Panel state
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [replacingShift, setReplacingShift] = useState<ScheduledShiftDto | null>(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [shiftEditDirty, setShiftEditDirty] = useState(false);
  // Set instead of run immediately when the shift-edit panel has unsaved
  // changes — confirmed via the dialog below, otherwise run right away.
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);

  const requestCloseShiftEdit = (after?: () => void) => {
    const close = () => { setEditingShiftId(null); setShiftEditDirty(false); after?.(); };
    if (shiftEditDirty) {
      setPendingDiscardAction(() => close);
    } else {
      close();
    }
  };

  // Drag-and-drop state
  const [dragging, setDragging] = useState<{ shift: ScheduledShiftDto; sourceEmployeeId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ employeeId: string; date: string } | null>(null);
  const dragLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Post-action state
  const [impactToast, setImpactToast] = useState<ReassignResult | null>(null);
  const [sessionChanges, setSessionChanges] = useState(0);
  const [rebalanceDismissed, setRebalanceDismissed] = useState(false);
  const [rebalanceFilled, setRebalanceFilled] = useState<number | null>(null);

  const { data: schedule, isLoading, error } = useWeeklySchedule(weekStart);
  const { data: roleCoverageRules } = useRoleCoverageRules();
  const { data: availabilityStatus } = useAvailabilityStatus();
  const generate = useGenerateSchedule();
  const approve = useApproveSchedule();
  const reassign = useReassignShift();
  const rebalance = useRebalance();
  const updateShift = useUpdateShift();
  const [confirmApprove, setConfirmApprove] = useState(false);

  const coverageMap = useMemo(() => buildRoleCoverageMap(roleCoverageRules ?? []), [roleCoverageRules]);

  const pipelineStages = useMemo(
    () =>
      buildWorkflowStages({
        demandReady: (schedule?.aiSummary.demandBreakdown?.length ?? 0) > 0,
        availabilityTotal: availabilityStatus?.totalEmployees ?? 0,
        availabilityReplied: availabilityStatus?.repliedCount ?? 0,
        scheduleExists: !!schedule,
        scheduleStatus: schedule?.status ?? null,
      }),
    [schedule, availabilityStatus],
  );

  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);

  // Group employees by primary role
  const grouped = useMemo(() => {
    if (!schedule) return new Map<string, ScheduleEmployeeDto[]>();
    const map = new Map<string, ScheduleEmployeeDto[]>();
    for (const emp of schedule.employees) {
      if (!map.has(emp.role)) map.set(emp.role, []);
      map.get(emp.role)!.push(emp);
    }
    return map;
  }, [schedule]);

  // Shift lookup by "employeeId:date"
  const shiftByKey = useMemo(() => {
    const map = new Map<string, ScheduledShiftDto>();
    if (!schedule) return map;
    for (const shift of schedule.shifts) {
      map.set(`${shift.employeeId}:${shift.date}`, shift);
    }
    return map;
  }, [schedule]);

  // Weekly hours per employee (non-cancelled)
  const weeklyHours = useMemo(() => {
    const map = new Map<string, number>();
    if (!schedule) return map;
    for (const shift of schedule.shifts) {
      if (shift.status !== "CANCELLED") {
        map.set(shift.employeeId, (map.get(shift.employeeId) ?? 0) + shift.hours);
      }
    }
    return map;
  }, [schedule]);

  // All roles across employees
  const allRoles = useMemo(() => {
    if (!schedule) return [];
    return [...new Set([...schedule.employees.map((e) => e.role), ...schedule.employees.flatMap((e) => e.secondaryRoles)])].sort();
  }, [schedule]);

  // Compute replacement suggestions client-side
  const replacementSuggestions = useMemo((): ReplacementSuggestion[] => {
    if (!replacingShift || !schedule) return [];
    const shiftHrs = computeHours(replacingShift.startTime, replacingShift.endTime);

    return schedule.employees
      .filter((emp) => {
        if (emp.id === replacingShift.employeeId) return false; // original employee
        if (!isEligibleForRole(emp.role, emp.secondaryRoles, replacingShift.role, coverageMap)) return false;
        const existingKey = `${emp.id}:${replacingShift.date}`;
        const existingShift = shiftByKey.get(existingKey);
        if (existingShift && existingShift.status !== "CANCELLED") return false;
        const maxHrs = emp.weeklyContractedHours ?? emp.maxWeeklyHrs;
        const used = weeklyHours.get(emp.id) ?? 0;
        return used + shiftHrs <= maxHrs * 1.1; // allow up to 10% over for display (but flag it)
      })
      .map((emp) => {
        const maxHrs = emp.weeklyContractedHours ?? emp.maxWeeklyHrs;
        const used = weeklyHours.get(emp.id) ?? 0;
        const afterHours = used + shiftHrs;
        return {
          employee: emp,
          scheduledHours: Math.round(used * 10) / 10,
          afterHours: Math.round(afterHours * 10) / 10,
          maxHours: maxHrs,
          roleMatch: (emp.role === replacingShift.role ? "primary" : "secondary") as "primary" | "secondary",
          overtimeRisk: afterHours > maxHrs * 0.9,
        };
      })
      .sort((a, b) => (a.overtimeRisk ? 1 : 0) - (b.overtimeRisk ? 1 : 0) || (a.maxHours - a.afterHours) - (b.maxHours - b.afterHours) * -1);
  }, [replacingShift, schedule, shiftByKey, weeklyHours, coverageMap]);

  const editingShift = editingShiftId ? schedule?.shifts.find((s) => s.id === editingShiftId) ?? null : null;
  const editingEmployee = editingShift ? schedule?.employees.find((e) => e.id === editingShift.employeeId) : null;

  const showRebalanceBanner = sessionChanges > 0 && !rebalanceDismissed && schedule?.status !== "APPROVED";

  const bottomPanelOpen = !!(editingShift || replacingShift);

  // Week navigation — routed through requestCloseShiftEdit so an open,
  // unsaved shift edit is confirmed before being discarded rather than
  // silently dropped by the editingShiftId reset below.
  function prevWeek() {
    requestCloseShiftEdit(() => {
      const d = new Date(weekStart + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 7);
      setWeekStart([d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")].join("-"));
      setReplacingShift(null);
      setSessionChanges(0);
      setRebalanceDismissed(false);
    });
  }

  function nextWeek() {
    requestCloseShiftEdit(() => {
      const d = new Date(weekStart + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 7);
      setWeekStart([d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")].join("-"));
      setReplacingShift(null);
      setSessionChanges(0);
      setRebalanceDismissed(false);
    });
  }

  // ─── Drag-and-drop handlers ───────────────────────────────────────────────

  function onDragStart(shift: ScheduledShiftDto, sourceEmployeeId: string) {
    setDragging({ shift, sourceEmployeeId });
    setEditingShiftId(null);
    setReplacingShift(null);
  }

  function onDragOver(e: React.DragEvent, employeeId: string, date: string) {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragLeaveTimer.current) clearTimeout(dragLeaveTimer.current);
    setDropTarget({ employeeId, date });
  }

  function onDragLeave() {
    dragLeaveTimer.current = setTimeout(() => setDropTarget(null), 80);
  }

  function onDrop(e: React.DragEvent, toEmployeeId: string, date: string) {
    e.preventDefault();
    if (!dragging) return;

    const { shift, sourceEmployeeId } = dragging;
    setDragging(null);
    setDropTarget(null);

    // Same employee or wrong date → no-op
    if (sourceEmployeeId === toEmployeeId || shift.date !== date) return;

    // Target already has an active shift → no-op
    const existing = shiftByKey.get(`${toEmployeeId}:${date}`);
    if (existing && existing.status !== "CANCELLED") return;

    reassign.mutate(
      { shiftId: shift.id, toEmployeeId, scheduleWeekStart: weekStart },
      {
        onSuccess: (result) => {
          setImpactToast(result);
          setSessionChanges((c) => c + 1);
          setRebalanceDismissed(false);
          setRebalanceFilled(null);
        },
      },
    );
  }

  function onDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  // ─── Replacement assignment ───────────────────────────────────────────────

  const assignReplacement = useCallback(
    (employeeId: string) => {
      if (!replacingShift) return;
      updateShift.mutate(
        {
          shiftId: replacingShift.id,
          scheduleWeekStart: weekStart,
          dto: { status: "DRAFT", employeeId },
        },
        {
          onSuccess: () => {
            setReplacingShift(null);
            setSessionChanges((c) => c + 1);
            setRebalanceDismissed(false);
            setRebalanceFilled(null);
          },
        },
      );
    },
    [replacingShift, updateShift, weekStart],
  );

  // Bare `return null` here previously rendered a completely blank page (no
  // AppShell, no nav) when misconfigured — indistinguishable from a crash.
  if (!restaurantId) return <AppShell title="Scheduling"><ConfigMissingBanner /></AppShell>;

  return (
    <AppShell title="Scheduling">
      {/* Always-visible AI Scheduling Workflow pipeline */}
      <WorkflowPipeline stages={pipelineStages} />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "availability" && <AvailabilityTab />}

      {activeTab !== "availability" && (
      <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="rounded-lg border border-border p-2 hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{formatWeekRange(weekStart)}</span>
          </div>
          <button onClick={nextWeek} className="rounded-lg border border-border p-2 hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {schedule?.status === "DRAFT" && (
            <button onClick={() => setConfirmApprove(true)} disabled={approve.isPending}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              <CheckCheck className="h-4 w-4" />
              {approve.isPending ? "Approving…" : "Approve Schedule"}
            </button>
          )}
          <button
            onClick={() => { setEditingShiftId(null); setReplacingShift(null); generate.mutate(weekStart); setSessionChanges(0); }}
            disabled={generate.isPending || schedule?.status === "APPROVED"}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            title={schedule?.status === "APPROVED" ? "Cannot regenerate an approved schedule" : undefined}>
            <Sparkles className="h-4 w-4" />
            {generate.isPending ? "Generating…" : schedule ? "Regenerate" : "Generate Schedule"}
          </button>
        </div>
      </div>

      {/* Status badge */}
      {schedule && (
        <div className="mb-4 flex items-center gap-2">
          {schedule.status === "APPROVED" ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Approved
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Clock className="h-3.5 w-3.5" /> Draft
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Generated {new Date(schedule.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {/* State banners — one at a time; stacking multiple "Something went
          wrong" banners when several mutations fail together reads as
          redundant rather than helpful. */}
      {isLoading && <LoadingBanner label="Loading schedule…" />}
      {!isLoading && (() => {
        const activeError = error
          ? { source: "load", err: error }
          : generate.isError
          ? { source: "generate", err: generate.error }
          : reassign.isError
          ? { source: "reassign", err: reassign.error }
          : null;
        if (!activeError) return null;
        const fallback: Record<string, string> = {
          load: "Failed to load schedule",
          generate: "Failed to generate schedule",
          reassign: "Failed to reassign shift",
        };
        return (
          <ErrorBanner
            message={activeError.err instanceof Error ? activeError.err.message : fallback[activeError.source] ?? "Something went wrong"}
          />
        );
      })()}

      {generate.isPending && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4 text-sm text-accent">
          <Sparkles className="h-5 w-5 animate-pulse" />
          <div>
            <p className="font-medium">Building your schedule with AI…</p>
            <p className="text-xs text-muted-foreground mt-0.5">Analysing demand forecast, employee availability, and contracts. This takes 10–20 seconds.</p>
          </div>
        </div>
      )}

      {schedule && (
        <>
          {/* AI Summary tiles */}
          <div className="mb-4 flex gap-3 overflow-x-auto pb-1">
            <SummaryTile icon={<Users className="h-4 w-4" />} label="Forecasted Guests" value={schedule.aiSummary.forecastedGuests.toLocaleString()} sub="next 7 days" />
            <SummaryTile icon={<TrendingUp className="h-4 w-4" />} label="Forecast Revenue" value={formatCurrency(schedule.aiSummary.forecastedRevenue)} sub="next 7 days" />
            <SummaryTile icon={<Clock className="h-4 w-4" />} label="Staff Hours" value={`${schedule.aiSummary.totalStaffHours} hrs`} sub="total scheduled" />
            <SummaryTile icon={<Users className="h-4 w-4" />} label="Employees" value={String(schedule.aiSummary.employeesScheduled)} sub="scheduled this week" />
            <CoverageCard
              coveragePct={schedule.aiSummary.coveragePct}
              coverageByRole={schedule.aiSummary.coverageByRole ?? []}
              estimatedAdditionalHours={schedule.aiSummary.estimatedAdditionalHours ?? 0}
            />
            <SummaryTile icon={<Banknote className="h-4 w-4" />} label="Labour Cost" value={formatCurrency(schedule.aiSummary.labourCost)} sub="total wage cost" />
          </div>

          {/* Warnings */}
          {schedule.aiSummary.warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                {schedule.aiSummary.warnings.length} Scheduling Warning{schedule.aiSummary.warnings.length > 1 ? "s" : ""}
              </div>
              <ul className="space-y-1">
                {schedule.aiSummary.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === "overview" && (
            <DemandExplanationPanel demandBreakdown={schedule.aiSummary.demandBreakdown ?? []} />
          )}
          </>
      )}

      {activeTab === "schedule" && schedule && (
        <>
          {/* Rebalance banner */}
          {showRebalanceBanner && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 text-accent" />
                <span className="text-foreground">
                  {sessionChanges} change{sessionChanges > 1 ? "s" : ""} this session.
                </span>
                {rebalanceFilled !== null && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓ {rebalanceFilled} gap{rebalanceFilled !== 1 ? "s" : ""} filled.
                  </span>
                )}
                {rebalanceFilled === null && (
                  <span className="text-muted-foreground">Would you like AI to fill any remaining gaps?</span>
                )}
              </div>
              {rebalanceFilled === null && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      rebalance.mutate(
                        { scheduleId: schedule.id, scheduleWeekStart: weekStart },
                        {
                          onSuccess: ({ gapsFilled }) => {
                            setRebalanceFilled(gapsFilled);
                            setRebalanceDismissed(false);
                          },
                        },
                      );
                    }}
                    disabled={rebalance.isPending}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {rebalance.isPending ? "Rebalancing…" : "Yes, Rebalance"}
                  </button>
                  <button
                    onClick={() => setRebalanceDismissed(true)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss rebalance suggestion"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {rebalanceFilled !== null && (
                <button
                  onClick={() => setRebalanceDismissed(true)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* AI Workforce Recommendation */}
          <WorkforceRecommendationPanel weekStart={weekStart} />

          {/* Weekly grid */}
          <div className={`overflow-x-auto rounded-xl border border-border bg-card ${bottomPanelOpen ? "mb-52" : "mb-6"}`}>
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-44 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Employee
                    {dragging && <span className="ml-2 text-accent text-[10px] normal-case">Drop to reassign</span>}
                  </th>
                  {weekDays.map((date, i) => {
                    const d = new Date(date + "T12:00:00Z");
                    return (
                      <th key={date} className="px-2 py-3 text-center text-xs font-medium text-muted-foreground">
                        <div className="uppercase tracking-wide">{DAY_LABELS[i]}</div>
                        <div className="mt-0.5 text-foreground font-semibold">{d.getUTCDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[...grouped.entries()].map(([role, employees]) => (
                  <Fragment key={role}>
                    <tr className="bg-muted/30">
                      <td colSpan={8} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {role}
                      </td>
                    </tr>

                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <button
                            onClick={() => { setProfileEmployeeId(emp.id); setEditingShiftId(null); setReplacingShift(null); }}
                            className="text-left font-medium text-foreground leading-tight hover:text-accent hover:underline"
                          >
                            {emp.name}
                          </button>
                          <p className="text-[11px] text-muted-foreground">
                            {emp.contractType.replace("_", " ")} · {weeklyHours.get(emp.id) ?? 0}/{emp.weeklyContractedHours ?? emp.maxWeeklyHrs}h
                          </p>
                        </td>
                        {weekDays.map((date) => {
                          const shift = shiftByKey.get(`${emp.id}:${date}`);
                          const isDropTarget = dropTarget?.employeeId === emp.id && dropTarget?.date === date;
                          const isInvalidDrop = isDropTarget && shift && shift.status !== "CANCELLED";

                          return (
                            <td
                              key={date}
                              className={`px-1.5 py-2 text-center transition-colors ${
                                isDropTarget && !isInvalidDrop
                                  ? "bg-accent/10 ring-2 ring-inset ring-accent/40"
                                  : isInvalidDrop
                                  ? "bg-red-500/5 ring-2 ring-inset ring-red-500/30"
                                  : ""
                              }`}
                              onDragOver={(e) => onDragOver(e, emp.id, date)}
                              onDragLeave={onDragLeave}
                              onDrop={(e) => onDrop(e, emp.id, date)}
                            >
                              {shift ? (
                                shift.status === "CANCELLED" ? (
                                  <button
                                    onClick={() => { setReplacingShift(shift); setEditingShiftId(null); }}
                                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-yellow-500/40 bg-yellow-500/5 px-2 py-1.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                                  >
                                    <Zap className="h-2.5 w-2.5" />
                                    Replace
                                  </button>
                                ) : (
                                  <div
                                    draggable
                                    onDragStart={() => onDragStart(shift, emp.id)}
                                    onDragEnd={onDragEnd}
                                    className="cursor-grab active:cursor-grabbing"
                                  >
                                    <button
                                      onClick={() => {
                                        if (editingShiftId === shift.id) {
                                          requestCloseShiftEdit();
                                        } else if (editingShiftId) {
                                          requestCloseShiftEdit(() => { setEditingShiftId(shift.id); setReplacingShift(null); });
                                        } else {
                                          setEditingShiftId(shift.id);
                                          setReplacingShift(null);
                                        }
                                      }}
                                      className={`group flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                                        editingShiftId === shift.id
                                          ? "border-accent bg-accent/20 text-accent"
                                          : shift.status === "CONFIRMED"
                                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                                          : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                                      }`}
                                    >
                                      <span>{shift.startTime}–{shift.endTime}</span>
                                      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
                                    </button>
                                  </div>
                                )
                              ) : (
                                <span
                                  className={`text-xs ${isDropTarget ? "text-accent font-medium" : "text-muted-foreground/40"}`}
                                >
                                  {isDropTarget ? "Drop here" : "–"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state — only when there's no schedule AND no query error */}
      {!isLoading && !error && !generate.isPending && !schedule && (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="rounded-2xl border border-border bg-card p-5">
            <Calendar className="h-10 w-10 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">No schedule for this week</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Generate an AI-powered schedule based on your demand forecast and employee availability.
            </p>
          </div>
          <button onClick={() => generate.mutate(weekStart)} disabled={generate.isPending}
            className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow hover:bg-accent/90 disabled:opacity-50">
            <Sparkles className="h-4 w-4" />
            Generate Schedule
          </button>
        </div>
      )}
      </>
      )}

      {/* Bottom panels (mutually exclusive) */}
      {editingShift && editingEmployee && (
        <ShiftEditPanel
          shift={editingShift}
          employeeName={editingEmployee.name}
          date={editingShift.date}
          weekStart={weekStart}
          allRoles={allRoles}
          onClose={() => requestCloseShiftEdit()}
          onSaved={() => { setEditingShiftId(null); setShiftEditDirty(false); }}
          onDirtyChange={setShiftEditDirty}
        />
      )}

      {replacingShift && !editingShift && (
        <ReplacementPanel
          shift={replacingShift}
          suggestions={replacementSuggestions}
          onAssign={assignReplacement}
          onClose={() => setReplacingShift(null)}
          isAssigning={updateShift.isPending}
        />
      )}

      {profileEmployeeId && !editingShift && !replacingShift && (
        <EmployeeProfilePanel employeeId={profileEmployeeId} onClose={() => setProfileEmployeeId(null)} />
      )}

      {/* Impact toast (top-right, auto-dismiss) */}
      {impactToast && schedule && (
        <ImpactToast
          result={impactToast}
          employees={schedule.employees}
          onDismiss={() => setImpactToast(null)}
        />
      )}

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="Approve this schedule?"
        description={`Publishing ${formatWeekRange(weekStart)}'s schedule locks it — you won't be able to regenerate it from scratch afterward, only edit individual shifts.`}
        confirmLabel="Approve"
        destructive={false}
        isLoading={approve.isPending}
        onConfirm={() => {
          if (!schedule) return;
          approve.mutate(schedule.id, { onSuccess: () => setConfirmApprove(false) });
        }}
      />

      <ConfirmDialog
        open={!!pendingDiscardAction}
        onOpenChange={(open) => !open && setPendingDiscardAction(null)}
        title="Discard unsaved shift changes?"
        description="You have time/role changes on this shift that haven't been saved. Continuing will discard them."
        confirmLabel="Discard Changes"
        onConfirm={() => {
          pendingDiscardAction?.();
          setPendingDiscardAction(null);
        }}
      />
    </AppShell>
  );
}
