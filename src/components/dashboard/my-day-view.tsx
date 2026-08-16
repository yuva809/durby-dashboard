"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { useMyWorkOverview } from "@/hooks/use-my-work";
import { useServiceOrders } from "@/hooks/use-service-orders";
import { ClipboardList, UserCircle } from "lucide-react";

// The whole "home" screen for SERVICE/KITCHEN roles — deliberately just
// today's shift + a couple of quick links, not the full operator
// dashboard. Keeps the promise in the nav restructuring: this should feel
// like a simple employee app.
export function MyDayView() {
  const { data: overview, isLoading, error } = useMyWorkOverview();
  const { data: activeOrders } = useServiceOrders("active");

  if (isLoading) return <AppShell title="My Day"><LoadingBanner label="Loading your day…" /></AppShell>;
  if (error) return <AppShell title="My Day"><ErrorBanner message="Failed to load My Day." /></AppShell>;

  return (
    <AppShell title="My Day">
      <div className="flex flex-col gap-5">
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s Shift</p>
          {overview?.linked && overview.todayShift ? (
            <p className="mt-1 text-xl font-semibold text-foreground">
              {overview.todayShift.startTime} → {overview.todayShift.endTime}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No shift scheduled today.</p>
          )}
        </div>

        {typeof activeOrders !== "undefined" && (
          <div className="card-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Orders</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{activeOrders.length}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/dashboard/order"
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card py-6 text-sm font-medium text-foreground hover:border-accent/50"
          >
            <ClipboardList className="h-5 w-5 text-accent" />
            Durby Order
          </Link>
          <Link
            href="/dashboard/my-work"
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card py-6 text-sm font-medium text-foreground hover:border-accent/50"
          >
            <UserCircle className="h-5 w-5 text-accent" />
            My Work
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
