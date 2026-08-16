"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import {
  useMyWorkOverview, useMyWorkHours, useMyWorkSchedule, useMyAvailability,
  useMyLeaveRequests, useCreateLeaveRequest, useCancelLeaveRequest, useProposeAvailability,
  type MyShift, type MyWorkOverview,
} from "@/hooks/use-my-work";

type Section = "overview" | "schedule" | "hours" | "leave" | "availability";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MyWorkPage() {
  const [section, setSection] = useState<Section>("overview");
  const { data: overview, isLoading, error } = useMyWorkOverview();

  return (
    <AppShell title="My Work">
      <div className="flex flex-col gap-5">
        {section !== "overview" && (
          <button
            onClick={() => setSection("overview")}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> My Work
          </button>
        )}

        {isLoading ? (
          <LoadingBanner label="Loading your work info…" />
        ) : error ? (
          <ErrorBanner message="Failed to load My Work." />
        ) : !overview?.linked ? (
          <div className="card-surface flex h-48 flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="font-medium">Your account isn&apos;t linked to a staff record yet</p>
            <p className="text-sm text-muted-foreground">Ask a manager to link your account in Workforce.</p>
          </div>
        ) : section === "overview" ? (
          <Overview overview={overview} onNavigate={setSection} />
        ) : section === "schedule" ? (
          <ScheduleSection />
        ) : section === "hours" ? (
          <HoursSection />
        ) : section === "leave" ? (
          <LeaveSection />
        ) : (
          <AvailabilitySection />
        )}
      </div>
    </AppShell>
  );
}

function ShiftRow({ shift }: { shift: MyShift }) {
  const dateLabel = new Date(shift.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground">{dateLabel}</span>
      <span className="text-muted-foreground">{shift.startTime}–{shift.endTime}</span>
    </div>
  );
}

function Overview({ overview, onNavigate }: { overview: Extract<MyWorkOverview, { linked: true }>; onNavigate: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="card-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s Shift</p>
        {overview.todayShift ? (
          <p className="mt-1 text-xl font-semibold text-foreground">{overview.todayShift.startTime} → {overview.todayShift.endTime}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No shift scheduled today.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["schedule", "Schedule"], ["hours", "Hours"], ["leave", "Leave"], ["availability", "Availability"],
        ] as Array<[Section, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className="rounded-lg border border-border bg-card py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card-surface p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Shifts</p>
        {overview.upcomingShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled in the next two weeks.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {overview.upcomingShifts.map((s) => <ShiftRow key={s.id} shift={s} />)}
          </div>
        )}
      </div>

      <div className="card-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hours This Month</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{overview.hoursThisMonth}h</p>
      </div>
    </div>
  );
}

function ScheduleSection() {
  const { data, isLoading, error } = useMyWorkSchedule();
  if (isLoading) return <LoadingBanner label="Loading your schedule…" />;
  if (error) return <ErrorBanner message="Failed to load your schedule." />;
  if (!data?.linked || data.shifts.length === 0) {
    return <div className="card-surface flex h-32 items-center justify-center text-sm text-muted-foreground">No upcoming shifts.</div>;
  }
  return (
    <div className="card-surface flex flex-col divide-y divide-border p-2">
      {data.shifts.map((s) => (
        <div key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
          <ShiftRow shift={s} />
          <span className="ml-3 text-xs text-muted-foreground">{s.role}</span>
        </div>
      ))}
    </div>
  );
}

function HoursSection() {
  const { data, isLoading, error } = useMyWorkHours();
  if (isLoading) return <LoadingBanner label="Loading your hours…" />;
  if (error) return <ErrorBanner message="Failed to load your hours." />;
  if (!data?.linked) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Week</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{data.hoursThisWeek} hours</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Month</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{data.hoursThisMonth} hours</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shift History</p>
        <div className="card-surface flex flex-col divide-y divide-border p-2">
          {data.shiftHistory.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No past shifts yet.</p>
          ) : (
            data.shiftHistory.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <ShiftRow shift={s} />
                <span className="text-muted-foreground">{s.hours}h</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const LEAVE_TYPES = [
  { value: "SICK", label: "Sick leave" },
  { value: "VACATION", label: "Urlaub / Vacation" },
  { value: "OTHER", label: "Other" },
] as const;

function LeaveSection() {
  const { data: requests, isLoading, error } = useMyLeaveRequests();
  const createLeave = useCreateLeaveRequest();
  const cancelLeave = useCancelLeaveRequest();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<(typeof LEAVE_TYPES)[number]["value"]>("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    if (!startDate || !endDate) return;
    createLeave.mutate(
      { leaveType: type, startDate, endDate, note: reason || undefined },
      { onSuccess: () => { setShowForm(false); setStartDate(""); setEndDate(""); setReason(""); } },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-fit items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" /> Request Leave
        </button>
      ) : (
        <div className="card-surface flex flex-col gap-3 p-5">
          <div className="flex gap-2">
            {LEAVE_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium",
                  type === t.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" />
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            rows={2}
          />
          {createLeave.isError && <p className="text-sm text-red-500">Could not submit — please try again.</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={createLeave.isPending || !startDate || !endDate}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {createLeave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingBanner label="Loading your leave requests…" />
      ) : error ? (
        <ErrorBanner message="Failed to load leave requests." />
      ) : (requests?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">No leave requests yet.</p>
      ) : (
        <div className="card-surface flex flex-col divide-y divide-border p-2">
          {requests!.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <div>
                <p className="text-foreground">{r.leaveType} · {r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}</p>
                {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    r.status === "PENDING" && "bg-yellow-500/15 text-yellow-500",
                    r.status === "APPROVED" && "bg-green-500/15 text-green-500",
                    r.status === "REJECTED" && "bg-red-500/15 text-red-500",
                  )}
                >
                  {r.status}
                </span>
                {r.status === "PENDING" && (
                  <button onClick={() => cancelLeave.mutate(r.id)} className="text-xs text-muted-foreground hover:text-red-500">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AvailabilitySection() {
  const { data, isLoading, error } = useMyAvailability();
  const propose = useProposeAvailability();
  const [showForm, setShowForm] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [available, setAvailable] = useState(true);

  if (isLoading) return <LoadingBanner label="Loading your availability…" />;
  if (error) return <ErrorBanner message="Failed to load your availability." />;
  if (!data?.linked) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface flex flex-col divide-y divide-border p-2">
        {data.current.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No availability on file yet.</p>
        ) : (
          data.current.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-foreground">{WEEKDAY_LABELS[a.weekday]}</span>
              <span className="text-muted-foreground">{a.available ? `${a.startTime}–${a.endTime}` : "Not available"}</span>
            </div>
          ))
        )}
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="flex w-fit items-center gap-1.5 text-sm text-accent hover:underline">
          <Plus className="h-4 w-4" /> Propose a change
        </button>
      ) : (
        <div className="card-surface flex flex-col gap-3 p-5">
          <p className="text-xs text-muted-foreground">Changes need manager approval, same as availability requested via WhatsApp.</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setWeekday(i)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium",
                  weekday === i ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} /> Available
            </label>
            {available && (
              <>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
                <span className="text-muted-foreground">–</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                propose.mutate({ weekday, startTime, endTime, available }, { onSuccess: () => setShowForm(false) })
              }
              disabled={propose.isPending}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {propose.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
