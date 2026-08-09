"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import {
  ConfigMissingBanner,
  ErrorBanner,
  LoadingBanner,
} from "@/components/shared/query-states";
import { useAdjustedForecast } from "@/hooks/use-forecast";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { formatCurrency, cn } from "@/lib/utils";
import type { AdjustedForecastDay, AdjustmentFactor } from "@/hooks/use-forecast";
import { ModelPanel } from "@/components/forecast/model-panel";
import {
  Users, TrendingUp, Package, ChevronDown, ChevronUp,
  CalendarCheck, Footprints,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function fmtDay(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric",
  });
}

type DemandLevel = "low" | "moderate" | "high" | "very_high";

function demandLevel(guests: number, avg: number): DemandLevel {
  const ratio = avg > 0 ? guests / avg : 1;
  if (ratio >= 1.5) return "very_high";
  if (ratio >= 1.2) return "high";
  if (ratio >= 0.8) return "moderate";
  return "low";
}

const DEMAND_CFG: Record<DemandLevel, { label: string; cls: string }> = {
  low:       { label: "Quiet",     cls: "border-blue-500/30   bg-blue-500/10   text-blue-400"    },
  moderate:  { label: "Normal",    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  high:      { label: "Busy",      cls: "border-amber-500/30  bg-amber-500/10  text-amber-400"   },
  very_high: { label: "Very Busy", cls: "border-red-500/30    bg-red-500/10    text-red-400"     },
};

function confidenceCfg(pct: number): { label: string; cls: string } {
  if (pct >= 80) return { label: "High",   cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" };
  if (pct >= 60) return { label: "Medium", cls: "border-amber-500/30   bg-amber-500/10   text-amber-400"   };
  return              { label: "Low",    cls: "border-red-500/30     bg-red-500/10     text-red-400"     };
}

function invDemandCfg(level: DemandLevel): { label: string; color: string } {
  if (level === "very_high") return { label: "Very High", color: "text-red-400"     };
  if (level === "high")      return { label: "High",      color: "text-amber-400"   };
  if (level === "moderate")  return { label: "Normal",    color: "text-emerald-400" };
  return                            { label: "Low",       color: "text-blue-400"    };
}

// Placeholder hourly shape (10:00–22:00, 13 slots) — NOT restaurant-specific and NOT backed
// by any real per-restaurant data source yet. Every value derived from this is labeled
// "(typical pattern)" wherever it's shown, rather than presented as a computed forecast —
// see docs/architecture/FORECASTING_NEXT_GEN_ROADMAP.md Part 2/19 (bottom-up hourly
// forecasting is blocked on POS/canonical timestamp data that doesn't exist today; this
// stays an honestly-labeled estimate until it does).
const DEMAND_CURVE: [number, number][] = [
  [10,2],[11,4],[12,11],[13,14],[14,9],[15,4],[16,3],
  [17,6],[18,13],[19,16],[20,12],[21,8],[22,3],
];
const CURVE_TOTAL  = DEMAND_CURVE.reduce((s, [, v]) => s + v, 0);
const PEAK_HOUR    = DEMAND_CURVE.reduce((b, c) => c[1] > b[1] ? c : b)[0]; // 19
const PEAK_WEIGHT  = DEMAND_CURVE.find(([h]) => h === PEAK_HOUR)?.[1] ?? 16;

function peakHourGuests(total: number) {
  return Math.round((PEAK_WEIGHT / CURVE_TOTAL) * total);
}

// Same caveat as DEMAND_CURVE above — no real wait-time data source exists in this product.
const WAIT_MAP: Record<DemandLevel, number> = { low: 0, moderate: 5, high: 12, very_high: 22 };

// Combine AI signal factors with computed context drivers into bullet list
function buildDrivers(factors: AdjustmentFactor[], date: string) {
  const list: Array<{ label: string; emoji: string }> = factors.map(f => ({
    label: f.factor,
    emoji: f.emoji,
  }));
  const dow = new Date(date + "T12:00:00Z").getDay();
  if ((dow === 0 || dow === 6) && !list.some(d => /weekend/i.test(d.label))) {
    list.push({ label: "Weekend", emoji: "📅" });
  }
  list.push({ label: "Historical Pattern", emoji: "📊" });
  return list;
}

// ── Provider badge ────────────────────────────────────────────────────────────

function ProviderBadge({ name }: { name: string }) {
  const meta: Record<string, { emoji: string; label: string }> = {
    weather: { emoji: "🌤️", label: "Weather" },
    holiday: { emoji: "🎉", label: "Holidays" },
    event:   { emoji: "🎵", label: "Events" },
  };
  const m = meta[name] ?? { emoji: "📡", label: name };
  return (
    <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] text-accent">
      {m.emoji} {m.label}
    </span>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function GuestTooltip({ active, payload, label, revenueByDate }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
  revenueByDate: Record<string, number>;
}) {
  if (!active || !payload?.length || !label) return null;
  const reservations = payload.find(p => p.name === "reservations")?.value ?? 0;
  const walkIns      = payload.find(p => p.name === "walkIns")?.value ?? 0;
  const total        = reservations + walkIns;
  const resPct       = total > 0 ? Math.round((reservations / total) * 100) : 0;
  const estRev       = revenueByDate[label] ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-3 shadow-xl backdrop-blur-sm min-w-[200px]">
      <p className="font-semibold text-sm mb-1">{fmtDate(label)}</p>
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <span className="text-2xl font-bold">{total}</span>
        <span className="text-xs text-muted-foreground">guests expected</span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs border-t border-border pt-2">
        <div className="flex justify-between gap-8">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-accent shrink-0" />
            Reservations
          </span>
          <span className="font-semibold">
            {reservations}
            <span className="text-muted-foreground font-normal ml-1">({resPct}%)</span>
          </span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-accent/40 shrink-0" />
            Walk-ins
          </span>
          <span className="font-semibold">
            {walkIns}
            <span className="text-muted-foreground font-normal ml-1">({100 - resPct}%)</span>
          </span>
        </div>
      </div>
      {estRev > 0 && (
        <div className="flex justify-between gap-8 border-t border-border pt-2 mt-2 text-xs">
          <span className="text-muted-foreground">Est. revenue</span>
          <span className="text-muted-foreground">{formatCurrency(estRev)}</span>
        </div>
      )}
    </div>
  );
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({
  guestDay, revDay, invDay, staffDay,
  avgGuests, avgInventorySpend, confirmedReservations,
  expanded, onToggle,
}: {
  guestDay:              AdjustedForecastDay;
  revDay:                AdjustedForecastDay | undefined;
  invDay:                AdjustedForecastDay | undefined;
  staffDay:              AdjustedForecastDay | undefined;
  avgGuests:             number;
  avgInventorySpend:     number;
  confirmedReservations: number;
  expanded:              boolean;
  onToggle:              () => void;
}) {
  const guests      = Math.round(guestDay.adjustedPredicted);
  const baseline    = Math.round(guestDay.baselinePredicted);
  const delta       = guests - baseline;
  const confPct     = Math.round(guestDay.adjustedConfidence * 100);
  const level       = demandLevel(guests, avgGuests);
  const demandCls   = DEMAND_CFG[level];
  const confCls     = confidenceCfg(confPct);
  // Real backend inventory forecast (EUR food cost, computeInventoryForecast) — categorized
  // against the week's own average inventory spend, not a guest-count heuristic. Falls back
  // to "—" only when the backend genuinely has no inventory forecast for this day.
  const invSpend    = invDay ? Math.round(invDay.adjustedPredicted) : null;
  const invLevel    = invDay ? demandLevel(invDay.adjustedPredicted, avgInventorySpend) : null;
  const invCfg      = invLevel ? invDemandCfg(invLevel) : { label: "—", color: "text-muted-foreground" };
  // Real backend staffing forecast (staff-hours, computeStaffForecast) — not a guests/5 guess.
  const staffHours  = staffDay ? Math.round(staffDay.adjustedPredicted) : null;
  const estRevenue  = revDay ? Math.round(revDay.adjustedPredicted) : 0;
  const waitMins    = WAIT_MAP[level];
  const drivers     = buildDrivers(guestDay.factors, guestDay.date);

  const walkIns = Math.max(0, guests - confirmedReservations);
  const resPct  = guests > 0 ? Math.round((confirmedReservations / guests) * 100) : 0;
  const walkPct = 100 - resPct;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card/50 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{fmtDate(guestDay.date)}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", demandCls.cls)}>
            {demandCls.label}
          </span>
        </div>
        <span
          title={`Forecast confidence: ${confPct}%`}
          className={cn("cursor-default rounded-full border px-2 py-0.5 text-[10px] font-medium", confCls.cls)}
        >
          {confCls.label}
        </span>
      </div>

      {/* ── Guest hero ── */}
      <div className="px-4 pt-4 pb-4 flex flex-col gap-3">

        {/* Total */}
        <div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold tracking-tight leading-none">{guests}</span>
            <span className="text-sm text-muted-foreground mb-0.5">expected guests</span>
          </div>
          {delta !== 0 && (
            <p className={cn("mt-1 text-xs font-medium", delta > 0 ? "text-amber-400" : "text-blue-400")}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs historical average
            </p>
          )}
        </div>

        {/* Reservations + Walk-ins tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-accent/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
              Reservations
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-accent">{confirmedReservations}</span>
              <span className="text-[10px] text-muted-foreground">{resPct}%</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
              Walk-ins
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{walkIns}</span>
              <span className="text-[10px] text-muted-foreground">{walkPct}%</span>
            </div>
          </div>
        </div>

        {/* Staff → Inventory → Revenue strip */}
        <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border overflow-hidden">
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Staff Hours</span>
            <span className="text-sm font-bold">{staffHours ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Inventory</span>
            <span className={cn("text-sm font-bold", invCfg.color)}>{invCfg.label}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Est. Revenue</span>
            <span className="text-xs font-semibold text-muted-foreground">
              {estRevenue > 0 ? formatCurrency(estRevenue) : "—"}
            </span>
          </div>
        </div>

        {/* Forecast Drivers */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
            Forecast Drivers
          </p>
          <div className="flex flex-col gap-1">
            {drivers.map((d, i) => (
              <span key={i} className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span className="text-muted-foreground">{d.emoji} {d.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center gap-1.5 border-t border-border/60 py-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors w-full"
      >
        {expanded
          ? <><ChevronUp className="h-3.5 w-3.5" /> Hide operational plan</>
          : <><ChevronDown className="h-3.5 w-3.5" /> View operational plan</>
        }
      </button>

      {/* ── Drill-down ── */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/10 px-4 py-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Operational Plan — {fmtDate(guestDay.date)}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-0.5">Peak Hour (typical)</p>
              <p className="text-lg font-bold">{PEAK_HOUR}:00</p>
              <p className="text-[10px] text-muted-foreground">~{peakHourGuests(guests)} guests — estimated pattern, not restaurant-specific</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-0.5">Staff Hours</p>
              <p className="text-lg font-bold">{staffHours ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">forecasted for the day</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-0.5">Inventory Demand</p>
              <p className={cn("text-lg font-bold", invCfg.color)}>{invCfg.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {invSpend !== null ? `~${formatCurrency(invSpend)} food cost` : "vs weekly average"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground mb-0.5">Est. Wait Time (typical)</p>
              <p className={cn("text-lg font-bold",
                waitMins > 15 ? "text-red-400" : waitMins > 5 ? "text-amber-400" : "text-emerald-400"
              )}>
                {waitMins > 0 ? `${waitMins} min` : "None"}
              </p>
              <p className="text-[10px] text-muted-foreground">estimated pattern, not restaurant-specific</p>
            </div>
          </div>

          {/* Guest split bars */}
          <div className="rounded-lg border border-border bg-card px-3 py-3 flex flex-col gap-2.5">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Guest Breakdown</p>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reservation customers</span>
                  <span className="font-semibold">{confirmedReservations} <span className="text-muted-foreground font-normal">({resPct}%)</span></span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${resPct}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected walk-ins</span>
                  <span className="font-semibold">{walkIns} <span className="text-muted-foreground font-normal">({walkPct}%)</span></span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full bg-accent/40 transition-all" style={{ width: `${walkPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {estRevenue > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Estimated revenue:{" "}
              <span className="font-semibold text-foreground">{formatCurrency(estRevenue)}</span>
              <span className="opacity-60 ml-1">— derived from {guests} guests</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary stat tile ─────────────────────────────────────────────────────────

function StatTile({ icon, label, value, sub, valueColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="card-surface flex items-center gap-3 p-4">
      <span className="text-muted-foreground/60 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={cn("text-lg font-bold leading-tight truncate", valueColor ?? "text-foreground")}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const restaurantId = useRestaurantId();
  const { data, isLoading, isError, error } = useAdjustedForecast(7);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (!restaurantId) {
    return <AppShell title="Forecast"><ConfigMissingBanner /></AppShell>;
  }
  if (isLoading) {
    return <AppShell title="Forecast"><LoadingBanner label="Calculating forecast…" /></AppShell>;
  }
  if (isError || !data) {
    return (
      <AppShell title="Forecast">
        <ErrorBanner message={error instanceof Error ? error.message : "Failed to load forecast."} />
      </AppShell>
    );
  }

  const guestDays = data.guests.days;
  const hasData   = guestDays.length > 0;

  // Cross-reference maps by date
  const revByDate: Record<string, AdjustedForecastDay> = {};
  const invByDate: Record<string, AdjustedForecastDay> = {};
  const staffByDate: Record<string, AdjustedForecastDay> = {};
  data.revenue.days.forEach(d   => { revByDate[d.date] = d; });
  data.inventory.days.forEach(d => { invByDate[d.date] = d; });
  data.staff.days.forEach(d     => { staffByDate[d.date] = d; });

  // ── Weekly summary metrics ────────────────────────────────────────────────
  // guestDays can be empty (insufficient sales history) — everything below
  // is only ever rendered inside the `hasData` branch, but reduce() on an
  // empty array with no seed still needs a safe peakDay to derive from.
  const totalGuests       = guestDays.reduce((s, d) => s + Math.round(d.adjustedPredicted), 0);
  const avgGuests         = totalGuests / Math.max(guestDays.length, 1);
  const avgInventorySpend = data.inventory.days.length
    ? data.inventory.days.reduce((s, d) => s + d.adjustedPredicted, 0) / data.inventory.days.length
    : 0;
  const peakDay           = hasData
    ? guestDays.reduce((b, d) => d.adjustedPredicted > b.adjustedPredicted ? d : b, guestDays[0])
    : null;
  const totalRevenue      = data.revenue.days.reduce((s, d) => s + d.adjustedPredicted, 0);
  const totalReservations = Object.values(data.reservationsByDate).reduce((s, n) => s + n, 0);
  const totalWalkIns      = Math.max(0, totalGuests - totalReservations);
  // Real backend forecasts for the day with the highest expected guest count —
  // no client-side guests/5 or guest-count-vs-average proxy for either figure.
  const peakDayStaffHours = peakDay ? staffByDate[peakDay.date]?.adjustedPredicted ?? null : null;
  const peakDayInventory  = peakDay ? invByDate[peakDay.date]?.adjustedPredicted ?? null : null;
  const peakInvLevel      = peakDayInventory !== null
    ? invDemandCfg(demandLevel(peakDayInventory, avgInventorySpend))
    : { label: "—", color: "text-muted-foreground" };

  // ── Chart data ────────────────────────────────────────────────────────────
  const revenueByDate: Record<string, number> = {};
  data.revenue.days.forEach(d => { revenueByDate[d.date] = Math.round(d.adjustedPredicted); });

  const chartData = guestDays.map(d => {
    const total        = Math.round(d.adjustedPredicted);
    const reservations = data.reservationsByDate[d.date] ?? 0;
    return {
      date:         d.date,
      reservations,
      walkIns:      Math.max(0, total - reservations),
    };
  });

  return (
    <AppShell title="Forecast">
      <div className="flex flex-col gap-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Weekly Demand Forecast</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Guest demand · Reservations + walk-ins · Operational planning
            </p>
          </div>
          {data.providersActive.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Live signals:</span>
              {data.providersActive.map(p => <ProviderBadge key={p} name={p} />)}
            </div>
          )}
        </div>

        <ModelPanel />

        {!hasData ? (
          <div className="card-surface p-12 text-center text-sm text-muted-foreground">
            Not enough sales history yet. Forecasts appear automatically once a few days of sales data exist.
          </div>
        ) : (
          <>
            {/* ── Summary — 6 tiles ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile
                icon={<Users className="h-5 w-5" />}
                label="Total guests (7d)"
                value={totalGuests.toLocaleString()}
                sub={`~${Math.round(avgGuests)} per day`}
              />
              <StatTile
                icon={<CalendarCheck className="h-5 w-5" />}
                label="Reservations"
                value={totalReservations.toLocaleString()}
                sub={`${Math.round((totalReservations / Math.max(totalGuests, 1)) * 100)}% of total`}
              />
              <StatTile
                icon={<Footprints className="h-5 w-5" />}
                label="Expected walk-ins"
                value={totalWalkIns.toLocaleString()}
                sub={`${Math.round((totalWalkIns / Math.max(totalGuests, 1)) * 100)}% of total`}
              />
              <StatTile
                icon={<Users className="h-5 w-5" />}
                label="Staff hours (peak day)"
                value={peakDayStaffHours !== null ? `${Math.round(peakDayStaffHours)}` : "—"}
                sub={`on ${fmtDay(peakDay!.date)}`}
              />
              <StatTile
                icon={<Package className="h-5 w-5" />}
                label="Peak inventory"
                value={peakInvLevel.label}
                sub="demand level"
                valueColor={peakInvLevel.color}
              />
              <StatTile
                icon={<TrendingUp className="h-5 w-5" />}
                label="Est. revenue (7d)"
                value={formatCurrency(totalRevenue)}
                sub="derived from guests"
                valueColor="text-muted-foreground"
              />
            </div>

            {/* ── Chart ────────────────────────────────────────────────────── */}
            <div>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Expected Guests by Day
              </h2>
              <div className="card-surface p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={d => fmtDate(d).slice(0, 6)}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <Tooltip
                      content={<GuestTooltip revenueByDate={revenueByDate} />}
                      cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                    />
                    {/* Left bar — confirmed reservations */}
                    <Bar
                      dataKey="reservations"
                      name="reservations"
                      fill="hsl(var(--accent))"
                      radius={[4, 4, 0, 0]}
                    />
                    {/* Right bar — expected walk-ins */}
                    <Bar
                      dataKey="walkIns"
                      name="walkIns"
                      fill="hsl(var(--accent)/0.4)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-3 flex flex-wrap items-center gap-5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-accent inline-block" />
                    Reservation customers
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-accent/40 inline-block" />
                    Expected walk-ins
                  </span>
                </div>
              </div>
            </div>

            {/* ── Day cards ────────────────────────────────────────────────── */}
            <div>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Daily Operational Forecast
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {guestDays.map(day => (
                  <DayCard
                    key={day.date}
                    guestDay={day}
                    revDay={revByDate[day.date]}
                    invDay={invByDate[day.date]}
                    staffDay={staffByDate[day.date]}
                    avgGuests={avgGuests}
                    avgInventorySpend={avgInventorySpend}
                    confirmedReservations={data.reservationsByDate[day.date] ?? 0}
                    expanded={expandedDate === day.date}
                    onToggle={() =>
                      setExpandedDate(expandedDate === day.date ? null : day.date)
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
