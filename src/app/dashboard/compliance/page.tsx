"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck, AlertTriangle, FileWarning, Users, ClipboardList,
  CheckCircle2, Clock, XCircle, Zap, TrendingUp, Search, ChevronRight,
  FileText, GraduationCap, Award, Briefcase, ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import {
  useComplianceDashboard, useComplianceTasks,
  useCompleteTask, useDismissTask, useRunMonitoring,
  type EmployeeComplianceListItemDto, type ComplianceTaskDto,
  type ComplianceStatus, type TaskPriority, type DataSource,
} from "@/hooks/use-compliance";
import { useRestaurantId } from "@/hooks/use-restaurant-id";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusCls(s: ComplianceStatus) {
  return {
    COMPLIANT: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
    WARNING: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
    CRITICAL: "text-red-500 border-red-500/30 bg-red-500/10",
    UNKNOWN: "text-muted-foreground border-border bg-muted/40",
  }[s];
}

function priorityCls(p: TaskPriority) {
  return {
    CRITICAL: "text-red-500 border-red-500/30 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500/30 bg-orange-500/10",
    MEDIUM: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
    LOW: "text-muted-foreground border-border bg-muted/30",
  }[p];
}

function sourceBadge(s: DataSource) {
  const cls =
    s === "EXTERNAL"
      ? "text-accent border-accent/30 bg-accent/10"
      : s === "CSV"
      ? "text-blue-500 border-blue-500/30 bg-blue-500/10"
      : "text-muted-foreground border-border bg-muted/30";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {s === "EXTERNAL" ? "Ext" : s}
    </span>
  );
}

function taskIcon(type: string) {
  const map: Record<string, React.ReactNode> = {
    REQUEST_DOCUMENT: <FileText className="h-3.5 w-3.5" />,
    SCHEDULE_TRAINING: <GraduationCap className="h-3.5 w-3.5" />,
    REVIEW_CONTRACT: <Briefcase className="h-3.5 w-3.5" />,
    UPDATE_CERTIFICATION: <Award className="h-3.5 w-3.5" />,
    WORK_AUTH_RENEWAL: <ExternalLink className="h-3.5 w-3.5" />,
    MISSING_DOCUMENT: <FileWarning className="h-3.5 w-3.5" />,
  };
  return map[type] ?? <ClipboardList className="h-3.5 w-3.5" />;
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 ${accent ?? "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center">
      <svg width={72} height={72} className="-rotate-90">
        <circle cx={36} cy={36} r={r} fill="none" stroke="currentColor" strokeWidth={6}
          className="text-muted/30" />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-base font-bold text-foreground">{score}</span>
    </div>
  );
}

// ─── Employee row + expandable detail ────────────────────────────────────────

function EmployeeRow({
  emp, selected, onSelect,
}: {
  emp: EmployeeComplianceListItemDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={selected}
      className={`cursor-pointer border-t border-border/50 text-sm transition-colors hover:bg-muted/20 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent ${
        selected ? "bg-accent/5" : ""
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {emp.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-foreground leading-tight">{emp.name}</p>
            <p className="text-[11px] text-muted-foreground">{emp.role}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{emp.contractType.replace("_", " ")}</span>
          {sourceBadge(emp.dataSource)}
        </div>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCls(emp.complianceStatus)}`}>
          {emp.complianceStatus === "COMPLIANT" && <CheckCircle2 className="h-3 w-3" />}
          {emp.complianceStatus === "WARNING" && <AlertTriangle className="h-3 w-3" />}
          {emp.complianceStatus === "CRITICAL" && <XCircle className="h-3 w-3" />}
          {emp.complianceStatus === "UNKNOWN" && <Clock className="h-3 w-3" />}
          {emp.complianceStatus}
        </span>
      </td>
      <td className="px-3 py-3 text-center">
        {emp.criticalIssueCount > 0 ? (
          <span className="font-semibold text-red-500">{emp.criticalIssueCount}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {emp.upcomingExpirations > 0 ? (
          <span className="font-semibold text-yellow-500">{emp.upcomingExpirations}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        {emp.openTaskCount > 0 ? (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
            {emp.openTaskCount}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <ChevronRight
          className={`inline h-4 w-4 transition-all ${
            selected ? "rotate-90 text-accent" : "text-muted-foreground/40"
          }`}
        />
      </td>
    </tr>
  );
}

function EmployeeDetailRow({ emp }: { emp: EmployeeComplianceListItemDto }) {
  return (
    <tr className="border-t border-accent/20 bg-accent/5">
      <td colSpan={7} className="px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-6 text-center">
            <div>
              <p className={`text-lg font-bold ${emp.criticalIssueCount > 0 ? "text-red-500" : "text-foreground"}`}>
                {emp.criticalIssueCount}
              </p>
              <p className="text-[11px] text-muted-foreground">Critical issues</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${emp.upcomingExpirations > 0 ? "text-yellow-500" : "text-foreground"}`}>
                {emp.upcomingExpirations}
              </p>
              <p className="text-[11px] text-muted-foreground">Upcoming expirations</p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{emp.openTaskCount}</p>
              <p className="text-[11px] text-muted-foreground">Open tasks</p>
            </div>
          </div>
          {!emp.profileId && (
            <p className="max-w-xs text-[11px] italic text-muted-foreground">
              No compliance profile yet — add documents, training, or contract details to start monitoring this employee.
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: ComplianceTaskDto }) {
  const complete = useCompleteTask();
  const dismiss = useDismissTask();
  const isOpen = !task.completedAt && !task.dismissedAt;

  return (
    <div
      className={`rounded-xl border p-3 transition-opacity ${
        isOpen ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 flex-shrink-0 rounded-lg border p-1.5 ${priorityCls(task.priority)}`}>
          {taskIcon(task.taskType)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight text-foreground">{task.title}</p>
            <span
              className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityCls(task.priority)}`}
            >
              {task.priority}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{task.description}</p>
          {task.dueDate && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Due{" "}
              {new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
          {isOpen && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => complete.mutate(task.id)}
                disabled={complete.isPending || dismiss.isPending}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3 w-3" /> Done
              </button>
              <button
                onClick={() => dismiss.mutate(task.id)}
                disabled={complete.isPending || dismiss.isPending}
                className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          )}
          {task.completedAt && <p className="mt-1.5 text-[10px] text-emerald-500">✓ Completed</p>}
          {!task.completedAt && task.dismissedAt && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">Dismissed</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const restaurantId = useRestaurantId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | "ALL">("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [taskFilter, setTaskFilter] = useState<"open" | "completed" | "dismissed">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: dashboard, isLoading, error } = useComplianceDashboard();
  const { data: tasks } = useComplianceTasks(taskFilter);
  const monitor = useRunMonitoring();

  const allRoles = useMemo(
    () => ["ALL", ...Array.from(new Set(dashboard?.employees.map((e) => e.role) ?? [])).sort()],
    [dashboard],
  );

  const filtered = useMemo(
    () =>
      (dashboard?.employees ?? []).filter((e) => {
        if (
          search &&
          !e.name.toLowerCase().includes(search.toLowerCase()) &&
          !e.role.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (statusFilter !== "ALL" && e.complianceStatus !== statusFilter) return false;
        if (roleFilter !== "ALL" && e.role !== roleFilter) return false;
        return true;
      }),
    [dashboard, search, statusFilter, roleFilter],
  );

  if (!restaurantId) return null;

  const monitorResult = monitor.data as
    | { tasksCreated: number; alertsCreated: number }
    | undefined;

  return (
    <AppShell title="Compliance">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Workforce Compliance &amp; HR Intelligence</p>
        <button
          onClick={() => monitor.mutate()}
          disabled={monitor.isPending}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Zap className={`h-4 w-4 ${monitor.isPending ? "animate-pulse" : ""}`} />
          {monitor.isPending ? "Scanning…" : "Run Monitoring"}
        </button>
      </div>

      {monitor.isSuccess && monitorResult && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Monitoring complete — {monitorResult.tasksCreated} task
          {monitorResult.tasksCreated !== 1 ? "s" : ""} updated,{" "}
          {monitorResult.alertsCreated} alert
          {monitorResult.alertsCreated !== 1 ? "s" : ""} created.
        </div>
      )}

      {isLoading && <LoadingBanner label="Loading compliance data…" />}
      {!isLoading && error && (
        <ErrorBanner
          message={error instanceof Error ? error.message : "Failed to load compliance data"}
        />
      )}

      {dashboard && (
        <>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-1 flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <ScoreRing score={dashboard.overallScore} />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Score
              </p>
            </div>
            <StatTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Compliant"
              value={dashboard.fullyCompliant}
              sub={`of ${dashboard.totalEmployees} employees`}
              accent={
                dashboard.fullyCompliant > 0 ? "border-emerald-500/20 bg-emerald-500/5" : undefined
              }
            />
            <StatTile
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Warnings"
              value={dashboard.warningCount}
              sub="need attention soon"
              accent={dashboard.warningCount > 0 ? "border-yellow-500/20 bg-yellow-500/5" : undefined}
            />
            <StatTile
              icon={<XCircle className="h-4 w-4" />}
              label="Critical"
              value={dashboard.criticalCount}
              sub="immediate action"
              accent={dashboard.criticalCount > 0 ? "border-red-500/20 bg-red-500/5" : undefined}
            />
            <StatTile
              icon={<Clock className="h-4 w-4" />}
              label="Expirations"
              value={dashboard.upcomingExpirations}
              sub="in next 30 days"
            />
            <StatTile
              icon={<ClipboardList className="h-4 w-4" />}
              label="Open Tasks"
              value={dashboard.pendingTasks}
              sub="pending action"
            />
          </div>

          {/* Two-column layout */}
          <div className="flex gap-4">
            {/* Employee table */}
            <div className="min-w-0 flex-1">
              {/* Filters */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-44 flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search employees…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ComplianceStatus | "ALL")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="COMPLIANT">Compliant</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  {allRoles.map((r) => (
                    <option key={r} value={r}>
                      {r === "ALL" ? "All Roles" : r}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No employees match your filters.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Employee
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Contract
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Critical
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Expiring
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Tasks
                        </th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((emp) => (
                        <React.Fragment key={emp.employeeId}>
                          <EmployeeRow
                            emp={emp}
                            selected={selectedId === emp.employeeId}
                            onSelect={() =>
                              setSelectedId(
                                selectedId === emp.employeeId ? null : emp.employeeId,
                              )
                            }
                          />
                          {selectedId === emp.employeeId && (
                            <EmployeeDetailRow emp={emp} />
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Tasks panel */}
            <div className="w-80 flex-shrink-0">
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      Compliance Tasks
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {(["open", "completed", "dismissed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setTaskFilter(s)}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                          taskFilter === s
                            ? "bg-accent text-white"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[calc(100vh-380px)] space-y-2 overflow-y-auto p-3">
                  {!tasks || tasks.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      {taskFilter === "open" ? (
                        <>
                          <CheckCircle2 className="h-7 w-7 text-emerald-500/60" />
                          <p className="text-xs text-muted-foreground">
                            All caught up. No open tasks.
                          </p>
                        </>
                      ) : (
                        <>
                          <ClipboardList className="h-7 w-7 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">No {taskFilter} tasks.</p>
                        </>
                      )}
                    </div>
                  ) : (
                    tasks.map((task) => <TaskCard key={task.id} task={task} />)
                  )}
                </div>
              </div>

              {/* Provider info */}
              <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="font-medium">Data sources</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No external HR provider connected. Data is entered manually or imported via CSV.
                  Connect an HR system in Settings to enable automatic sync.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sourceBadge("MANUAL")}
                  {sourceBadge("CSV")}
                  {sourceBadge("EXTERNAL")}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!isLoading && !error && dashboard?.totalEmployees === 0 && (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="rounded-2xl border border-border bg-card p-5">
            <Users className="h-10 w-10 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">No employees found</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add employees to your restaurant profile or import them via the Data Center to start
              monitoring compliance.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
