"use client";

import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner, ConfigMissingBanner } from "@/components/shared/query-states";
import {
  useOperationalDashboard, useDemandSignals,
  type DemandLevel, type StatusLevel,
} from "@/hooks/use-operational-dashboard";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { useRestaurantContext } from "@/providers/restaurant-provider";
import { MyDayView } from "@/components/dashboard/my-day-view";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  AlertCircle, Package, ShieldCheck, CheckCircle2,
  Users, Clock, TrendingUp, Hourglass, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

// ── Small helpers ─────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted/40", className)} />;
}

function SL({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── Demand level config ───────────────────────────────────────────────────────

const DEMAND_CFG: Record<DemandLevel, { label: string; cls: string; barCls: string }> = {
  low:       { label: "Low",       cls: "border-blue-500/30  bg-blue-500/10  text-blue-400",   barCls: "bg-blue-500/60"   },
  moderate:  { label: "Normal",    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", barCls: "bg-emerald-500/70" },
  high:      { label: "High",      cls: "border-amber-500/30 bg-amber-500/10 text-amber-400",  barCls: "bg-amber-500/80"  },
  very_high: { label: "Very High", cls: "border-red-500/30   bg-red-500/10   text-red-500",    barCls: "bg-red-500/80"    },
};

// ── Status helpers ────────────────────────────────────────────────────────────

function statusDot(l: StatusLevel) {
  return l === "healthy" ? "bg-emerald-500" : l === "warning" ? "bg-amber-400" : "bg-red-500";
}
function statusText(l: StatusLevel) {
  return l === "healthy" ? "text-emerald-500" : l === "warning" ? "text-amber-400" : "text-red-500";
}
function statusLabel(l: StatusLevel) {
  return l === "healthy" ? "Healthy" : l === "warning" ? "Needs attention" : "Critical";
}

// ── Driver category icon ──────────────────────────────────────────────────────

function driverEmoji(cat: string) {
  if (cat === "weather") return "🌤";
  if (cat === "event")   return "🎵";
  if (cat === "day")     return "📅";
  return "📊";
}

// ── Critical action config ────────────────────────────────────────────────────

const ACTION_ICON: Record<string, React.ReactNode> = {
  compliance: <ShieldCheck className="h-3.5 w-3.5" />,
  inventory:  <Package className="h-3.5 w-3.5" />,
  alert:      <AlertCircle className="h-3.5 w-3.5" />,
};

const PRIORITY_CLS: Record<string, string> = {
  high:   "text-red-400 bg-red-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  low:    "text-muted-foreground bg-muted/30",
};

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1"><Sk className="h-6 w-52" /><Sk className="h-4 w-40" /></div>
      <Sk className="h-44" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Sk className="h-52" />
        <Sk className="h-52 lg:col-span-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Sk className="h-40" /><Sk className="h-40" />
      </div>
      <Sk className="h-24" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Sk className="h-48 lg:col-span-2" /><Sk className="h-48 lg:col-span-3" />
      </div>
      <Sk className="h-16" />
    </div>
  );
}

// ── Recharts tooltip ──────────────────────────────────────────────────────────

function HourlyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-semibold">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-border pt-1 text-xs font-semibold">Total: {total}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const restaurantId = useRestaurantId();
  const { role } = useRestaurantContext();
  // SERVICE/KITCHEN staff get "My Day" instead of the full operator
  // dashboard — same route, role-branched, so their nav's "My Day" link
  // and everyone else's "Dashboard" link both just point at /dashboard.
  const isServiceRole = role === "SERVICE" || role === "KITCHEN";
  const { data, isLoading, error } = useOperationalDashboard();
  const { data: signalsRaw } = useDemandSignals(restaurantId);

  if (isServiceRole) return <MyDayView />;

  // Merge live signal factors into drivers if available
  const liveFactors = signalsRaw?.revenue?.days?.[0]?.factors ?? [];

  // Both queries above are `enabled: !!restaurantId` — without this guard,
  // a missing/misconfigured restaurantId means isLoading never resolves and
  // the page spins forever with no explanation (looks identical to a frozen app).
  if (!restaurantId) return <AppShell title="Dashboard"><ConfigMissingBanner /></AppShell>;
  if (isLoading) return <AppShell title="Dashboard"><DashboardSkeleton /></AppShell>;
  if (error)     return <AppShell title="Dashboard"><ErrorBanner message="Failed to load today's dashboard." /></AppShell>;
  if (!data)     return <AppShell title="Dashboard"><LoadingBanner /></AppShell>;

  const { demand, drivers, hourlyDemand, walkInRatio, reservationRatio,
          walkInAccuracy, operations, dailyBrief, criticalActions, status, lowStockCount } = data;

  // Peak hour computed on the frontend from hourlyDemand
  const peakSlot = hourlyDemand.reduce((best, h) => h.guests > best.guests ? h : best, hourlyDemand[0] ?? { hour: "—", guests: 0, reservations: 0, walkIns: 0 });

  const demandCfg = DEMAND_CFG[demand.demandLevel];
  const dateLabel = new Date(data.date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Build driver list: prefer live signal factors, fall back to computed
  const displayDrivers: Array<{ label: string; emoji: string }> = liveFactors.length > 0
    ? liveFactors.map(f => ({ label: f.factor, emoji: f.emoji }))
    : drivers.map(d => ({ label: d.label, emoji: driverEmoji(d.category) }));

  // Find dinner ramp-up hour for "dinner begins" annotation
  const maxGuests = Math.max(...hourlyDemand.map(h => h.guests), 1);

  return (
    <AppShell title="Dashboard">
      <div className="flex flex-col gap-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">{dateLabel}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Operational overview · Demand-led intelligence</p>
          </div>
          {demand.hasForecast ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              AI Forecast Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
              Reservation-based estimate
            </span>
          )}
        </div>

        {/* ── HERO: Today's Demand Forecast ─────────────────────────────────── */}
        <div className={cn("card-surface rounded-xl p-6 border", demandCfg.cls)}>
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Today's Demand Forecast
            </span>
            <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", demandCfg.cls)}>
              {demandCfg.label} Demand
            </span>
          </div>

          {/* Big 3 numbers */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-[44px] font-bold leading-none tracking-tighter sm:text-[56px]">
                {demand.expectedGuests}
              </span>
              <span className="text-sm text-muted-foreground">Expected Guests</span>
              {demand.vsNormalDay !== 0 && (
                <span className={cn("text-xs font-medium", demand.vsNormalDay > 0 ? "text-amber-400" : "text-blue-400")}>
                  {demand.vsNormalDay > 0 ? "▲" : "▼"} {Math.abs(demand.vsNormalDay)}% vs avg
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 border-l border-border/60 pl-4 sm:pl-8">
              <span className="text-[32px] font-bold leading-none tracking-tighter text-accent sm:text-[40px]">
                {demand.reservations}
              </span>
              <span className="text-sm text-muted-foreground">Reservations</span>
              <span className="text-xs text-muted-foreground">{reservationRatio}% of forecast</span>
            </div>
            <div className="flex flex-col gap-1 border-l border-border/60 pl-4 sm:pl-8">
              <span className="text-[32px] font-bold leading-none tracking-tighter sm:text-[40px]">
                {demand.expectedWalkIns}
              </span>
              <span className="text-sm text-muted-foreground">Expected Walk-ins</span>
              {walkInAccuracy?.accuracy != null ? (
                <span className="text-xs text-emerald-400">
                  Yesterday: {walkInAccuracy.accuracy.toFixed(1)}% accurate
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{walkInRatio}% of forecast</span>
              )}
            </div>
          </div>

          {/* Walk-in callout — prominent, actionable */}
          {walkInRatio > 0 && (
            <div className={cn(
              "mt-5 flex items-center gap-3 rounded-lg border px-4 py-3",
              walkInRatio >= 60
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-border bg-muted/20"
            )}>
              <Users className={cn("h-4 w-4 shrink-0", walkInRatio >= 60 ? "text-amber-400" : "text-muted-foreground")} />
              <p className="text-sm font-medium">
                <span className={cn("text-lg font-bold", walkInRatio >= 60 ? "text-amber-400" : "text-foreground")}>
                  {walkInRatio}%
                </span>
                {" "}of today's guests are expected walk-ins —{" "}
                <span className="text-muted-foreground">
                  {demand.expectedWalkIns} guests with no reservation
                </span>
              </p>
            </div>
          )}

          {/* Chips row */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
            <Chip label={`${demand.confidence}% confidence`} icon={<TrendingUp className="h-3.5 w-3.5" />} />
            {demand.peakTime !== "—" && (
              <Chip label={demand.peakTime} icon={<Clock className="h-3.5 w-3.5" />} prefix="Peak" />
            )}
            <Chip label={`${demand.expectedGuests} covers est.`} icon={<Layers className="h-3.5 w-3.5" />} />
            {walkInAccuracy?.accuracy != null && (
              <Chip
                label={`Walk-in accuracy ${walkInAccuracy.accuracy.toFixed(1)}%`}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                muted
              />
            )}
          </div>
        </div>

        {/* ── Forecast Drivers + Demand Distribution ────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Drivers */}
          <div>
            <SL>Forecast Drivers</SL>
            <div className="card-surface flex h-full flex-col gap-3 p-5">
              {displayDrivers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Run a forecast to see demand drivers.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {displayDrivers.map((d, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm">
                      <span className="text-base leading-none">{d.emoji}</span>
                      <span>{d.label}</span>
                      <span className="ml-auto text-xs text-emerald-400">✓</span>
                    </li>
                  ))}
                </ul>
              )}
              {liveFactors.length > 0 && signalsRaw?.revenue?.days?.[0]?.totalAdjustmentPct !== undefined && (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="text-xs text-muted-foreground">
                    Net demand adjustment:{" "}
                    <span className={signalsRaw.revenue.days[0].totalAdjustmentPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {signalsRaw.revenue.days[0].totalAdjustmentPct > 0 ? "+" : ""}
                      {signalsRaw.revenue.days[0].totalAdjustmentPct.toFixed(0)}%
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Hourly demand chart */}
          <div className="lg:col-span-2">
            <SL>Hourly Demand Distribution</SL>
            <div className="card-surface p-5">
              {hourlyDemand.every(h => h.guests === 0) ? (
                <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                  No demand data. Import reservations or run a forecast.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourlyDemand} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<HourlyTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                    <Bar dataKey="reservations" name="Reservations" stackId="a" fill="hsl(var(--accent))" radius={[0,0,0,0]}>
                      {hourlyDemand.map((entry, i) => (
                        <Cell key={i} fill={entry.guests >= maxGuests * 0.85 ? "hsl(var(--accent))" : "hsl(var(--accent)/0.7)"} />
                      ))}
                    </Bar>
                    <Bar dataKey="walkIns" name="Walk-ins" stackId="a" fill="hsl(var(--accent)/0.35)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Reservations</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent/35" /> Expected walk-ins</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Peak Hours Today + Guest Mix ──────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Peak Hours Today */}
          <div>
            <SL>Peak Hours Today</SL>
            <div className="card-surface flex flex-col gap-4 p-5">
              {hourlyDemand.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hourly demand data yet for today.
                </p>
              ) : (
              <>
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-3xl font-bold tracking-tight">{peakSlot.hour}:00</span>
                  <span className="text-sm text-muted-foreground">Highest demand hour</span>
                </div>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                  Peak Hour
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
                <div className="flex flex-col gap-0.5 text-center">
                  <span className="text-xl font-bold">{peakSlot.guests}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Guests</span>
                </div>
                <div className="flex flex-col gap-0.5 border-x border-border text-center">
                  <span className="text-xl font-bold text-accent">{peakSlot.reservations}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Reservations</span>
                </div>
                <div className="flex flex-col gap-0.5 text-center">
                  <span className="text-xl font-bold">{peakSlot.walkIns}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Walk-ins</span>
                </div>
              </div>
              </>
              )}
              {walkInAccuracy && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Yesterday:{" "}
                    <span className="font-semibold text-foreground">{walkInAccuracy.actual} walk-ins</span>
                    {" "}vs{" "}
                    <span className="font-semibold">{walkInAccuracy.predicted} predicted</span>
                    {walkInAccuracy.accuracy != null && (
                      <span className="ml-2 font-bold text-emerald-400">{walkInAccuracy.accuracy.toFixed(1)}% accurate</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Guest Mix */}
          <div>
            <SL>Guest Mix</SL>
            <div className="card-surface flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-3 w-3 rounded-sm bg-accent" />
                    Reservations
                  </span>
                  <span className="font-bold text-accent">{reservationRatio}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${reservationRatio}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-3 w-3 rounded-sm bg-accent/35" />
                    Walk-ins
                  </span>
                  <span className="font-bold">{walkInRatio}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-accent/40 transition-all duration-500"
                    style={{ width: `${walkInRatio}%` }}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {demand.reservations} confirmed reservations out of {demand.expectedGuests} expected guests.
              </p>
            </div>
          </div>
        </div>

        {/* ── Operational Impact ────────────────────────────────────────────── */}
        <div>
          <SL>Operational Impact</SL>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Staff tile — richer than others */}
            <div className="card-surface flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Users className="h-5 w-5 text-muted-foreground/60" />
                {operations.staffCoverage > 0 && (
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5",
                    operations.staffCoverage >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                    operations.staffCoverage >= 50 ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>
                    {operations.staffCoverage}% covered
                  </span>
                )}
              </div>
              <span className="text-2xl font-bold leading-tight tracking-tight">
                {operations.peakStaff}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">Peak Staff Needed</span>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {operations.scheduledHours > 0 && (
                    <span>{operations.scheduledHours}h scheduled</span>
                  )}
                  {operations.scheduledStaff > 0 && (
                    <span>{operations.scheduledStaff} on roster</span>
                  )}
                </div>
              </div>
            </div>
            <OpTile
              icon={<Package className="h-5 w-5" />}
              value={`${operations.inventoryUsagePct}%`}
              label="Inventory Usage"
              sub="estimated utilisation"
              valueColor={operations.inventoryUsagePct >= 90 ? "text-red-400" : operations.inventoryUsagePct >= 75 ? "text-amber-400" : "text-emerald-400"}
            />
            <OpTile
              icon={<Layers className="h-5 w-5" />}
              value={operations.estimatedCovers.toString()}
              label="Table Turns"
              sub="estimated covers today"
            />
            <OpTile
              icon={<Hourglass className="h-5 w-5" />}
              value={operations.estimatedWaitMinutes > 0 ? `${operations.estimatedWaitMinutes} min` : "None"}
              label="Peak Wait Time"
              sub="at busiest hour"
              valueColor={operations.estimatedWaitMinutes > 15 ? "text-red-400" : operations.estimatedWaitMinutes > 5 ? "text-amber-400" : "text-emerald-400"}
            />
          </div>
        </div>

        {/* ── AI Daily Brief + Critical Actions ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SL>AI Daily Brief</SL>
            <div className="card-surface flex h-full flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                <span className="text-sm font-semibold">Today's Brief</span>
              </div>
              {dailyBrief.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Import sales and forecast data to activate the daily brief.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {dailyBrief.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="lg:col-span-3">
            <SL>Critical Actions</SL>
            <div className="card-surface flex h-full flex-col gap-3 p-5">
              <span className="text-sm font-semibold">Actions Required</span>
              {criticalActions.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                  <p className="text-sm text-muted-foreground">All clear — no critical actions right now.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {criticalActions.map(a => (
                    <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link href={a.href} className="group flex items-start gap-3 transition-opacity hover:opacity-75">
                        <span className={cn("mt-0.5 shrink-0 rounded p-1", PRIORITY_CLS[a.priority] ?? PRIORITY_CLS.low)}>
                          {ACTION_ICON[a.type] ?? <AlertCircle className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{a.title}</span>
                            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase", PRIORITY_CLS[a.priority] ?? PRIORITY_CLS.low)}>
                              {a.priority}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.description}</p>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── Restaurant Status ─────────────────────────────────────────────── */}
        <div>
          <SL>Restaurant Status</SL>
          <div className="card-surface px-5 py-4">
            <div className="flex flex-wrap items-center gap-0 divide-x divide-border">
              {[
                { key: "staffing",     label: "Staffing",     href: "/scheduling" },
                { key: "inventory",    label: "Inventory",    href: "/inventory",    note: lowStockCount > 0 ? `${lowStockCount} low` : undefined },
                { key: "compliance",   label: "Compliance",   href: "/compliance" },
                { key: "forecast",     label: "Forecast",     href: "/forecast" },
                { key: "integrations", label: "Integrations", href: "/integrations" },
              ].map(({ key, label, href, note }) => {
                const level = (status[key] ?? "warning") as StatusLevel;
                return (
                  <Link key={key} href={href} className="group flex flex-1 min-w-[140px] flex-col gap-1 px-5 py-2 first:pl-0 last:pr-0 transition-opacity hover:opacity-75">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", statusDot(level))} />
                      <span className={cn("text-sm font-medium", statusText(level))}>{statusLabel(level)}</span>
                      {note && <span className="ml-1 text-xs text-muted-foreground">({note})</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, icon, prefix, muted }: {
  label: string;
  icon?: React.ReactNode;
  prefix?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
      muted
        ? "border-border text-muted-foreground"
        : "border-border bg-muted/20 text-foreground"
    )}>
      {icon}
      {prefix && <span className="text-muted-foreground">{prefix}:</span>}
      {label}
    </span>
  );
}

function OpTile({ icon, value, label, sub, valueColor }: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="card-surface flex flex-col gap-2 p-4">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className={cn("text-xl font-bold leading-tight tracking-tight", valueColor ?? "text-foreground")}>
        {value}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium leading-tight">{label}</span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}
