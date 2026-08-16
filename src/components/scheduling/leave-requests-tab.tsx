"use client";

import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { useAllLeaveRequests, useApproveLeave, useRejectLeave } from "@/hooks/use-my-work";
import { cn } from "@/lib/utils";

// Manager-facing review for My Work's self-service leave requests
// (src/app/dashboard/my-work/page.tsx). Lives as a tab here, next to
// Availability, rather than a new nav item — same "grouped employee
// workflows" reasoning as the rest of Scheduling.
export function LeaveRequestsTab() {
  const { data: requests, isLoading, error } = useAllLeaveRequests();
  const approve = useApproveLeave();
  const reject = useRejectLeave();

  if (isLoading) return <LoadingBanner label="Loading leave requests…" />;
  if (error) return <ErrorBanner message="Failed to load leave requests." />;

  const pending = (requests ?? []).filter((r) => r.status === "PENDING");
  const reviewed = (requests ?? []).filter((r) => r.status !== "PENDING").slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="card-surface flex h-24 items-center justify-center text-sm text-muted-foreground">
            No pending leave requests.
          </div>
        ) : (
          <div className="card-surface flex flex-col divide-y divide-border">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{r.employee?.name ?? "Employee"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.leaveType} · {r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}
                  </p>
                  {r.note && <p className="text-xs text-muted-foreground">&ldquo;{r.note}&rdquo;</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approve.mutate(r.id)}
                    disabled={approve.isPending || reject.isPending}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600/90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reject.mutate(r.id)}
                    disabled={approve.isPending || reject.isPending}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-red-500/50 hover:text-red-500 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewed.length > 0 && (
        <div>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recently reviewed</h2>
          <div className="card-surface flex flex-col divide-y divide-border">
            {reviewed.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-foreground">{r.employee?.name ?? "Employee"}</span>
                <span className="text-xs text-muted-foreground">{r.leaveType} · {r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    r.status === "APPROVED" ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500",
                  )}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
