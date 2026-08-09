"use client";

import React, { useState } from "react";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import {
  useAvailabilityInbox,
  useCurrentAvailability,
  useRequestAvailability,
  useSubmitReply,
  useReviewProposal,
  useAvailabilityStatus,
  useResendReminder,
  type AvailabilityMessage,
  type AvailabilityProposal,
  type EmployeeAvailabilityStatus,
} from "@/hooks/use-availability";
import { cn } from "@/lib/utils";
import {
  Send, Check, X, Sparkles, MessageSquare, AlertCircle,
  Megaphone, CalendarCheck2, Bot, Users, Bell, Clock3,
} from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SL({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── Reply-status dashboard ────────────────────────────────────────────────────

function StatusTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-[110px] flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmployeeStatusRow({
  e, onRemind, remindingId,
}: {
  e: EmployeeAvailabilityStatus;
  onRemind: (employeeId: string) => void;
  remindingId: string | null;
}) {
  const statusCls =
    e.status === "replied" ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" :
    e.status === "pending" ? "text-amber-500 border-amber-500/30 bg-amber-500/10" :
    "text-muted-foreground border-border bg-muted/20";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/10 px-3 py-2 text-sm">
      <span className="font-medium text-foreground">{e.employeeName}</span>
      <span className="text-xs text-muted-foreground">{e.role}</span>
      <span className={cn("ml-auto rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", statusCls)}>
        {e.status === "not_requested" ? "not requested" : e.status}
      </span>
      {e.remindersSent > 0 && (
        <span className="text-[10px] text-muted-foreground">{e.remindersSent} reminder{e.remindersSent > 1 ? "s" : ""}</span>
      )}
      {e.status === "pending" && (
        <button
          type="button"
          onClick={() => onRemind(e.employeeId)}
          disabled={remindingId === e.employeeId}
          className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          <Bell size={11} />
          {remindingId === e.employeeId ? "Sending…" : "Remind"}
        </button>
      )}
    </div>
  );
}

function AvailabilityStatusDashboard() {
  const status = useAvailabilityStatus();
  const remind = useResendReminder();
  const [remindingId, setRemindingId] = useState<string | null>(null);

  if (status.isLoading) return <LoadingBanner label="Loading reply status…" />;
  if (status.isError || !status.data) return null;

  const d = status.data;
  const handleRemind = async (employeeId: string) => {
    setRemindingId(employeeId);
    try {
      await remind.mutateAsync(employeeId);
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div className="card-surface p-4">
      <SL>Availability Reply Status</SL>
      <div className="mb-3 flex flex-wrap gap-2">
        <StatusTile icon={<Users size={13} />} label="Total" value={String(d.totalEmployees)} />
        <StatusTile icon={<Check size={13} />} label="Replied" value={String(d.repliedCount)} />
        <StatusTile icon={<Clock3 size={13} />} label="Pending" value={String(d.pendingCount)} />
        <StatusTile icon={<Bell size={13} />} label="Reminders sent" value={String(d.remindersSent)} />
      </div>
      {d.estimatedCompletionAt && d.pendingCount > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Estimated completion: {new Date(d.estimatedCompletionAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {d.employees.map((e) => (
          <EmployeeStatusRow key={e.employeeId} e={e} onRemind={handleRemind} remindingId={remindingId} />
        ))}
      </div>
    </div>
  );
}

// ── Proposal row (approve / reject) ───────────────────────────────────────────

function ProposalRow({
  p, onReview, busy,
}: {
  p: AvailabilityProposal;
  onReview: (id: string, action: "approve" | "reject") => void;
  busy: boolean;
}) {
  const statusCls =
    p.status === "APPROVED" ? "text-emerald-400" :
    p.status === "REJECTED" ? "text-red-400" :
    "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
      {p.date ? (
        <span className="flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          One-off · {p.date}
        </span>
      ) : (
        <span className="w-10 font-medium text-foreground">{WEEKDAYS[p.weekday]}</span>
      )}
      {p.available ? (
        <span className="text-foreground">{p.startTime}–{p.endTime}</span>
      ) : (
        <span className="text-red-400">Not available</span>
      )}
      {p.note && <span className="text-xs text-muted-foreground">({p.note})</span>}
      <span className={cn("ml-auto text-xs font-medium", statusCls)}>
        {p.status === "PENDING" ? "" : p.status.toLowerCase()}
      </span>
      {p.status === "PENDING" && (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview(p.id, "approve")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
            title="Approve"
            aria-label="Approve availability proposal"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview(p.id, "reject")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
            title="Reject"
            aria-label="Reject availability proposal"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({
  m, onReview, busy,
}: {
  m: AvailabilityMessage;
  onReview: (id: string, action: "approve" | "reject") => void;
  busy: boolean;
}) {
  const isOut = m.direction === "OUT";
  return (
    <div className={cn("card-surface p-4", isOut && "opacity-60")}>
      <div className="mb-2 flex items-center gap-2 text-sm">
        {isOut
          ? <Bot size={14} className="text-accent" />
          : <MessageSquare size={14} className="text-muted-foreground" />}
        <span className="font-medium text-foreground">
          {isOut ? `AI → ${m.employee.name}` : m.employee.name}
        </span>
        <span className="text-xs text-muted-foreground">{m.employee.role}</span>
        <span className="ml-auto rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {m.channel}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(m.createdAt).toLocaleString("de-DE", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">&ldquo;{m.body}&rdquo;</p>

      {m.parseStatus === "FAILED" && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle size={12} />
          AI could not parse this message{m.parseError ? `: ${m.parseError}` : ""} — ask the employee to rephrase.
        </p>
      )}

      {m.proposals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs text-accent">
            <Sparkles size={12} /> AI-parsed availability — approve to apply
          </div>
          {m.proposals.map((p) => (
            <ProposalRow key={p.id} p={p} onReview={onReview} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export function AvailabilityTab() {
  const inbox = useAvailabilityInbox();
  const current = useCurrentAvailability();
  const requestAll = useRequestAvailability();
  const submitReply = useSubmitReply();
  const review = useReviewProposal();

  const [employeeId, setEmployeeId] = useState("");
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const employees = current.data?.employees ?? [];

  const handleSend = async () => {
    if (!employeeId || !message.trim()) return;
    setLastResult(null);
    const res = await submitReply.mutateAsync({ employeeId, message: message.trim() });
    setMessage("");
    setLastResult(
      res.parseStatus === "PARSED"
        ? `✓ Parsed (${Math.round((res.confidence ?? 0) * 100)}% confidence): ${res.summary}`
        : `✗ Parse failed — the AI could not understand this message.`,
    );
  };

  const handleReview = (proposalId: string, action: "approve" | "reject") => {
    review.mutate({ proposalId, action });
  };

  if (inbox.isLoading) return <LoadingBanner label="Loading availability…" />;
  if (inbox.isError) return <ErrorBanner message={(inbox.error as Error)?.message ?? "Failed to load"} />;

  const messages = inbox.data?.messages ?? [];
  const pendingCount = inbox.data?.pendingCount ?? 0;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

      {/* ── Left 2/3: request + status + inbox ────────────────────────── */}
      <div className="xl:col-span-2 space-y-6">

        <div className="card-surface flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Collect availability</p>
              <p className="text-xs text-muted-foreground">
                AI messages every active employee individually and parses their natural-language replies.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => requestAll.mutate()}
            disabled={requestAll.isPending}
            className="ml-auto rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {requestAll.isPending ? "Sending…" : "Request from all staff"}
          </button>
          {requestAll.data && (
            <span className="w-full text-xs text-emerald-400">
              ✓ Sent to {requestAll.data.requested} employees via {requestAll.data.channel} channel
            </span>
          )}
          {pendingCount > 0 && (
            <span className="w-full text-xs text-amber-400">
              {pendingCount} parsed {pendingCount === 1 ? "proposal" : "proposals"} awaiting your approval
            </span>
          )}
        </div>

        <AvailabilityStatusDashboard />

        {/* Simulated employee reply (stands in for WhatsApp until Phase 2+) */}
        <div className="card-surface p-4">
          <SL>Employee Reply (simulated channel)</SL>
          <div className="flex flex-col gap-3">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
              ))}
            </select>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder='e.g. "I can do lunch Mon-Wed, evenings Friday, but Sundays are out because of university"'
              className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={submitReply.isPending || !employeeId || !message.trim()}
              className="flex w-fit items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
            >
              <Send size={14} />
              {submitReply.isPending ? "AI is parsing…" : "Send reply"}
            </button>
            {lastResult && (
              <p className={cn(
                "text-xs",
                lastResult.startsWith("✓") ? "text-emerald-400" : "text-red-400",
              )}>
                {lastResult}
              </p>
            )}
          </div>
        </div>

        <div>
          <SL>Message Inbox</SL>
          <div className="flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="card-surface p-6 text-center text-sm text-muted-foreground">
                No messages yet — request availability from your staff to get started.
              </div>
            )}
            {messages.map((m) => (
              <MessageCard key={m.id} m={m} onReview={handleReview} busy={review.isPending} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Right 1/3: current approved availability ──────────────────── */}
      <div>
        <SL>Current Availability (approved)</SL>
        <div className="flex flex-col gap-3">
          {employees.length === 0 && (
            <div className="card-surface p-6 text-center text-sm text-muted-foreground">
              No active employees.
            </div>
          )}
          {employees.map((e) => (
            <div key={e.id} className="card-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <CalendarCheck2 size={14} className="text-accent" />
                <span className="text-sm font-medium text-foreground">{e.name}</span>
                <span className="text-xs text-muted-foreground">{e.role}</span>
              </div>
              {e.availability.length === 0 ? (
                <p className="text-xs text-muted-foreground">No availability on record.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {e.availability.map((a) => (
                    <div key={a.weekday} className="flex items-center gap-2 text-xs">
                      <span className="w-9 font-medium text-muted-foreground">{WEEKDAYS[a.weekday]}</span>
                      {a.available ? (
                        <span className="text-foreground">{a.startTime}–{a.endTime}</span>
                      ) : (
                        <span className="text-red-400">Unavailable</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {e.availabilityOverrides.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {e.availabilityOverrides.map((o) => (
                    <div key={o.date} className="flex items-center gap-2 text-xs">
                      <span className="rounded border border-accent/30 bg-accent/10 px-1 py-0.5 text-[10px] font-medium text-accent">
                        {o.date}
                      </span>
                      {o.available ? (
                        <span className="text-foreground">{o.startTime}–{o.endTime}</span>
                      ) : (
                        <span className="text-red-400">Unavailable{o.note ? ` (${o.note})` : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
