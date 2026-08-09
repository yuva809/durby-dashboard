"use client";

import React, { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner, ConfigMissingBanner } from "@/components/shared/query-states";
import { useAnalyticsData, type AnalyticsData, type ComparisonKpi } from "@/hooks/use-analytics";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { formatCurrency, cn } from "@/lib/utils";
import {
  ArrowUpRight, ArrowDownRight, Download, FileText,
  TrendingUp, Euro, ChefHat, UtensilsCrossed, Users, Wallet, Target,
  Sparkles, Package, ShieldCheck, Trash2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  RadialBarChart, RadialBar,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 7 | 30 | 90 | 365;
const PERIODS: { value: Period; label: string }[] = [
  { value: 7,   label: "7 days" },
  { value: 30,  label: "30 days" },
  { value: 90,  label: "90 days" },
  { value: 365, label: "12 months" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Sk({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted/40", className)} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function fmtAxis(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  if (days <= 30) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTooltipDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Period Selector ───────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            value === p.value
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── KPI Comparison Tile ───────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  kpi: ComparisonKpi;
  format: "currency" | "pct" | "count";
  unit?: string;
  invertColor?: boolean;
  icon: React.ReactNode;
}

function KpiTile({ label, kpi, format, unit, invertColor, icon }: KpiTileProps) {
  const fmt = (v: number) => {
    if (format === "currency") return formatCurrency(v);
    if (format === "pct") return `${v.toFixed(1)}%`;
    return Math.round(v).toLocaleString() + (unit ? ` ${unit}` : "");
  };

  const isGood = invertColor ? !kpi.better : kpi.better;
  const hasDelta = Math.abs(kpi.changePct) >= 0.1;

  return (
    <div className="card-surface flex h-[190px] flex-col justify-between p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          {icon}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="truncate text-[26px] font-semibold leading-none tracking-tight">{fmt(kpi.current)}</span>
        {hasDelta ? (
          <span className={cn("flex items-center gap-0.5 text-xs font-semibold", isGood ? "text-emerald-500" : "text-red-500")}>
            {kpi.change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(kpi.changePct).toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No change</span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">Previous {fmt(kpi.previous)}</span>
    </div>
  );
}

// ── Forecast Accuracy Tile ────────────────────────────────────────────────────
// The backend already computes this as accuracy (100 - avg error%), not error —
// so it's shown honestly as accuracy with a derived error line, never inverted.

function forecastLabel(accuracy: number): { text: string; className: string } {
  if (accuracy >= 90) return { text: "Excellent", className: "text-emerald-500" };
  if (accuracy >= 75) return { text: "Good", className: "text-accent" };
  if (accuracy >= 50) return { text: "Fair", className: "text-amber-500" };
  return { text: "Needs attention", className: "text-red-500" };
}

function ForecastAccuracyTile({ accuracy }: { accuracy: number }) {
  const hasData = accuracy > 0;
  const errorPct = Math.max(0, 100 - accuracy);
  const label = forecastLabel(accuracy);

  return (
    <div className="card-surface flex h-[190px] flex-col justify-between p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Forecast Accuracy</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Target className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-tight">
          {hasData ? `${accuracy.toFixed(1)}%` : "—"}
        </span>
        {hasData && <span className={cn("text-xs font-semibold", label.className)}>{label.text}</span>}
      </div>
      <span className="text-xs text-muted-foreground">
        {hasData ? `Error ±${errorPct.toFixed(1)}%` : "No forecasts in period"}
      </span>
    </div>
  );
}

// ── AI Impact Tile ────────────────────────────────────────────────────────────

function ImpactTile({ value, label, icon, accent }: { value: string; label: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("card-surface flex flex-col gap-2 p-5", accent && "border-accent/30 bg-accent/5")}>
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", accent ? "bg-accent/15 text-accent" : "bg-muted/40 text-muted-foreground")}>
        {icon}
      </span>
      <span className={cn("text-2xl font-bold tracking-tight", accent ? "text-accent" : "text-foreground")}>
        {value}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Custom Recharts Tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatValue }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  days: number;
  formatValue?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{fmtTooltipDate(label)}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-xs capitalize text-muted-foreground">{p.name}:</span>
          <span className="text-xs font-semibold">
            {formatValue ? formatValue(p.value, p.name) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Chart tick formatters ─────────────────────────────────────────────────────

function tickEur(v: number) { return `€${(v / 1000).toFixed(0)}k`; }
function tickPct(v: number) { return `${v}%`; }

// ── Trend series selector ─────────────────────────────────────────────────────

const TREND_SERIES = [
  { key: "revenue", label: "Revenue",   color: "hsl(var(--accent))" },
  { key: "profit",  label: "Profit",    color: "#34d399" },
  { key: "guests",  label: "Guests",    color: "#60a5fa" },
] as const;

type TrendKey = (typeof TREND_SERIES)[number]["key"];

// ── Loading skeleton ──────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between"><Sk className="h-8 w-40" /><Sk className="h-9 w-64" /></div>
      <Sk className="h-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => <Sk key={i} className="h-[190px]" />)}
      </div>
      <Sk className="h-64" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Sk className="h-56" /><Sk className="h-56" /></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Sk key={i} className="h-32" />)}
      </div>
    </div>
  );
}

// ── Inventory health radial gauge ─────────────────────────────────────────────

function InventoryHealthGauge({ pct }: { pct: number }) {
  const color = pct >= 85 ? "#34d399" : pct >= 60 ? "#f59e0b" : "#ef4444";
  const data = [{ name: "health", value: pct, fill: color }];
  return (
    <div className="relative flex h-[150px] w-[150px] shrink-0 items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={90 - 360 * (pct / 100)}
        >
          <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted))" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute flex flex-col items-center">
        <span className="text-2xl font-bold tracking-tight">{pct}%</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Health</span>
      </div>
    </div>
  );
}

// ── Executive AI summary ──────────────────────────────────────────────────────
// Derived client-side from the already-fetched analytics payload — no new
// backend logic, just a plain-language readout of the numbers below.

function periodTitle(period: Period): string {
  return period === 365 ? "Last 12 Months" : `Last ${period} Days`;
}

function buildExecutiveSummary(data: AnalyticsData): { bullets: string[]; recommendations: string[] } {
  const { executive, aiImpact, inventory } = data;
  const bullets: string[] = [];
  const dir = (v: number) => (v >= 0 ? "increased" : "decreased");

  if (Math.abs(executive.revenue.changePct) >= 0.5) {
    bullets.push(`Revenue ${dir(executive.revenue.change)} ${Math.abs(executive.revenue.changePct).toFixed(0)}% compared to the previous period.`);
  }
  if (Math.abs(executive.profit.change) >= 1) {
    bullets.push(`Profit ${dir(executive.profit.change)} by ${formatCurrency(Math.abs(executive.profit.change))}.`);
  }
  if (Math.abs(executive.guests.changePct) >= 0.5) {
    const phrase = executive.guests.changePct >= 80
      ? "nearly doubled"
      : `${dir(executive.guests.change)} ${Math.abs(executive.guests.changePct).toFixed(0)}%`;
    bullets.push(`Guest count ${phrase} compared to the previous period.`);
  }
  if (Math.abs(executive.foodCostPct.change) >= 0.1) {
    bullets.push(`Food cost ${executive.foodCostPct.better ? "improved" : "worsened"} ${Math.abs(executive.foodCostPct.changePct).toFixed(1)}%.`);
  }
  if (Math.abs(executive.labourCostPct.change) >= 0.1) {
    bullets.push(`Labour cost ${executive.labourCostPct.better ? "improved" : "increased"} by ${Math.abs(executive.labourCostPct.changePct).toFixed(1)}%.`);
  }
  if (aiImpact.stockoutsPrevented > 0) {
    bullets.push(`AI prevented ${aiImpact.stockoutsPrevented} stockout${aiImpact.stockoutsPrevented === 1 ? "" : "s"}.`);
  }
  if (aiImpact.estimatedSavings > 0) {
    bullets.push(`Estimated savings: ${formatCurrency(aiImpact.estimatedSavings)}.`);
  }

  const recommendations: string[] = [];
  if (inventory.lowStockCount > 0) {
    recommendations.push(`Reorder the ${inventory.lowStockCount} low-stock product${inventory.lowStockCount === 1 ? "" : "s"}.`);
  }
  if (!executive.labourCostPct.better && Math.abs(executive.labourCostPct.changePct) >= 1) {
    recommendations.push(`Review staffing levels — labour cost ${executive.labourCostPct.change >= 0 ? "increased" : "decreased"} ${Math.abs(executive.labourCostPct.changePct).toFixed(1)}%.`);
  }
  if (executive.forecastAccuracy > 0 && executive.forecastAccuracy < 75) {
    recommendations.push("Review forecast inputs — recent prediction accuracy has been low.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Keep monitoring key metrics — no urgent actions flagged this period.");
  }

  return { bullets, recommendations };
}

function ExecutiveSummaryCard({ data, period }: { data: AnalyticsData; period: Period }) {
  const { bullets, recommendations } = useMemo(() => buildExecutiveSummary(data), [data]);

  return (
    <div className="card-surface border-accent/20 bg-accent/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">Executive Summary — {periodTitle(period)}</h2>
      </div>
      {bullets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No significant changes to report for this period.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90">
              <span className="text-accent">•</span>
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key Recommendations</p>
        <ul className="flex flex-col gap-1.5">
          {recommendations.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90">
              <span className="text-accent">•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const restaurantId = useRestaurantId();
  const [period, setPeriod] = useState<Period>(30);
  const [activeTrends, setActiveTrends] = useState<Set<TrendKey>>(new Set(["revenue", "profit"]));

  const { data, isLoading, error } = useAnalyticsData(period);

  const toggleTrend = (key: TrendKey) => {
    setActiveTrends(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  };

  // Reduce chart points for 90d / 12m by sampling every Nth row
  const chartRevenue = useMemo(() => {
    if (!data) return [];
    const rows = data.revenueTrend;
    if (period <= 30 || rows.length <= 60) return rows;
    const step = Math.ceil(rows.length / 60);
    return rows.filter((_, i) => i % step === 0);
  }, [data, period]);

  const chartCost = useMemo(() => {
    if (!data) return [];
    const rows = data.costTrend;
    if (period <= 30 || rows.length <= 60) return rows;
    const step = Math.ceil(rows.length / 60);
    return rows.filter((_, i) => i % step === 0);
  }, [data, period]);

  const chartForecast = useMemo(() => {
    if (!data) return [];
    return data.forecastAccuracy;
  }, [data]);

  // useAnalyticsData is `enabled: !!restaurantId` — without this guard, a
  // missing/misconfigured restaurantId means isLoading never resolves and
  // the page spins forever with no explanation.
  if (!restaurantId) return <AppShell title="Analytics"><ConfigMissingBanner /></AppShell>;
  if (isLoading) return <AppShell title="Analytics"><AnalyticsSkeleton /></AppShell>;
  if (error) return <AppShell title="Analytics"><ErrorBanner message="Failed to load analytics data." /></AppShell>;
  if (!data)  return <AppShell title="Analytics"><LoadingBanner /></AppShell>;

  const { executive, workforce, inventory, aiImpact, period: p } = data;

  const periodLabel = period === 365 ? "12 months" : `${period} days`;

  const handleExport = (type: string) => {
    // Placeholder — CSV/PDF generation will be implemented per export format
    alert(`${type} export coming soon.`);
  };

  return (
    <AppShell title="Analytics">
      <div className="flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Business Analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {p.from} → {p.to} · compared with {p.prevFrom} → {p.prevTo}
            </p>
          </div>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* Section 1 — Executive AI Summary */}
        <ExecutiveSummaryCard data={data} period={period} />

        {/* Section 2 — Executive KPI Cards */}
        <div>
          <SectionLabel>Executive Summary</SectionLabel>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <KpiTile label="Revenue"      kpi={executive.revenue}       format="currency" icon={<Euro className="h-4 w-4" />} />
            <KpiTile label="Profit"       kpi={executive.profit}        format="currency" icon={<TrendingUp className="h-4 w-4" />} />
            <KpiTile label="Labour Cost"  kpi={executive.labourCostPct} format="pct" invertColor icon={<ChefHat className="h-4 w-4" />} />
            <KpiTile label="Food Cost"    kpi={executive.foodCostPct}   format="pct" invertColor icon={<UtensilsCrossed className="h-4 w-4" />} />
            <KpiTile label="Guests"       kpi={executive.guests}        format="count" icon={<Users className="h-4 w-4" />} />
            <KpiTile label="Avg. Spend"   kpi={executive.avgSpend}      format="currency" icon={<Wallet className="h-4 w-4" />} />
            <ForecastAccuracyTile accuracy={executive.forecastAccuracy} />
          </div>
        </div>

        {/* Section 3 — Daily Revenue Trend */}
        <div>
          <SectionLabel>Daily Revenue Trend</SectionLabel>
          <div className="card-surface p-6">
            {chartRevenue.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                No sales data in this period. Import data in{" "}
                <a href="/dashboard/data-center" className="ml-1 text-accent hover:underline">Data Center</a>.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartRevenue} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => fmtAxis(d, period)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.ceil(chartRevenue.length / 8)}
                  />
                  <YAxis tickFormatter={tickEur} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        days={period}
                        formatValue={(v, n) => n === "guests" ? v.toLocaleString() : formatCurrency(v)}
                      />
                    }
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, top: -8 }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--accent))" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="profit"  name="Profit"  stroke="#34d399" fill="url(#profGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Section 4 + 5 — Cost Analytics + Forecast vs Actual Revenue */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Cost Analytics */}
          <div>
            <SectionLabel>Cost Analytics</SectionLabel>
            <div className="card-surface p-6">
              {chartCost.length === 0 ? (
                <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No data in this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartCost} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={d => fmtAxis(d, period)}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.ceil(chartCost.length / 6)}
                    />
                    <YAxis tickFormatter={tickPct} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      content={
                        <ChartTooltip days={period} formatValue={(v) => `${v.toFixed(1)}%`} />
                      }
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, top: -8 }} />
                    <Bar dataKey="labour" name="Labour %" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="food"   name="Food %"   fill="#f97316" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="margin" name="Margin %"  fill="#34d399" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Forecast vs Actual Revenue */}
          <div>
            <SectionLabel>Forecast vs Actual Revenue</SectionLabel>
            <div className="card-surface p-6">
              {chartForecast.length === 0 ? (
                <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                  No forecast data. Run a forecast in the{" "}
                  <a href="/dashboard/forecast" className="ml-1 text-accent hover:underline">Forecast</a> module.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartForecast} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={d => fmtAxis(d, period)}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.ceil(chartForecast.length / 6)}
                    />
                    <YAxis tickFormatter={tickEur} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                    <Tooltip
                      content={
                        <ChartTooltip days={period} formatValue={(v) => formatCurrency(v)} />
                      }
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, top: -8 }} />
                    <Line type="monotone" dataKey="actual"    name="Actual"    stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Section 6 — Workforce Analytics */}
        <div>
          <SectionLabel>Workforce Analytics</SectionLabel>
          <div className="card-surface p-6">
            {workforce.shiftCount === 0 ? (
              <p className="text-sm text-muted-foreground">No shift data in this period.</p>
            ) : (
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
                <div className="flex-1">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Staff Active",  value: workforce.uniqueEmployees.toLocaleString() },
                      { label: "Total Hours",   value: `${workforce.totalHours.toLocaleString()} h` },
                      { label: "Shifts Worked", value: workforce.shiftCount.toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                        <span className="text-xl font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hidden w-px bg-border sm:block" />
                <div className="flex-1">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Efficiency</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Avg Hours/Employee", value: `${workforce.avgHoursPerEmployee} h` },
                      { label: "Avg Shift Length",    value: `${(workforce.shiftCount > 0 ? workforce.totalHours / workforce.shiftCount : 0).toFixed(1)} h` },
                      { label: "Cancellation Rate",   value: `${workforce.cancellationRate.toFixed(1)}%` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                        <span className="text-xl font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 7 — Inventory Analytics */}
        <div>
          <SectionLabel>Inventory Analytics</SectionLabel>
          <div className="card-surface p-6">
            {inventory.totalItems === 0 ? (
              <p className="text-sm text-muted-foreground">No inventory data. Add products in the Inventory module.</p>
            ) : (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                <InventoryHealthGauge pct={inventory.healthPct} />
                <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-2">
                  {[
                    { label: "Total Products", value: inventory.totalItems.toLocaleString() },
                    { label: "Well-Stocked",   value: `${inventory.totalItems - inventory.lowStockCount}` },
                    { label: "Low Stock",      value: inventory.lowStockCount.toLocaleString(), danger: inventory.lowStockCount > 0 },
                    { label: "Reorder Needed", value: inventory.lowStockCount.toLocaleString(), danger: inventory.lowStockCount > 0 },
                  ].map(({ label, value, danger }) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                      <span className={cn("text-xl font-semibold", danger ? "text-red-500" : "")}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 8 — AI Impact */}
        <div>
          <SectionLabel>AI Impact</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card-surface p-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Operational Improvements</p>
              <div className="grid grid-cols-2 gap-3">
                <ImpactTile value={aiImpact.stockoutsPrevented.toString()} label="Stockouts Prevented" icon={<Package className="h-4 w-4" />} />
                <ImpactTile value={aiImpact.staffingGapsClosed.toString()} label="Staffing Issues Resolved" icon={<Users className="h-4 w-4" />} />
                <ImpactTile value={aiImpact.complianceViolationsPrevented.toString()} label="Compliance Issues Prevented" icon={<ShieldCheck className="h-4 w-4" />} />
                <ImpactTile value={aiImpact.wasteCasesHandled.toString()} label="Waste Incidents Prevented" icon={<Trash2 className="h-4 w-4" />} />
              </div>
            </div>
            <div className="card-surface p-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Business Impact</p>
              <div className="grid grid-cols-2 gap-3">
                <ImpactTile
                  value={aiImpact.estimatedSavings > 0 ? formatCurrency(aiImpact.estimatedSavings) : "—"}
                  label="Estimated Savings"
                  icon={<Euro className="h-4 w-4" />}
                  accent
                />
                <ImpactTile
                  value={aiImpact.forecastAccuracy > 0 ? `${aiImpact.forecastAccuracy.toFixed(1)}%` : "—"}
                  label="Forecast Accuracy"
                  icon={<Target className="h-4 w-4" />}
                  accent
                />
              </div>
              {aiImpact.totalAlertsResolved > 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  {aiImpact.totalAlertsResolved} total alerts resolved. Savings based on industry benchmarks per incident type.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 9 — Business Trends */}
        <div>
          <SectionLabel>Business Trends</SectionLabel>
          <div className="card-surface p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TREND_SERIES.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleTrend(s.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                    activeTrends.has(s.key) ? "opacity-100" : "opacity-30",
                  )}
                  style={{ borderColor: s.color, color: activeTrends.has(s.key) ? s.color : undefined }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
            {chartRevenue.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No data in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartRevenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => fmtAxis(d, period)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.ceil(chartRevenue.length / 8)}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60}
                    tickFormatter={(v) => {
                      if (activeTrends.has("guests") && !activeTrends.has("revenue") && !activeTrends.has("profit")) {
                        return v.toLocaleString();
                      }
                      return tickEur(v);
                    }}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        days={period}
                        formatValue={(v, n) => n === "guests" ? v.toLocaleString() : formatCurrency(v)}
                      />
                    }
                  />
                  {TREND_SERIES.filter(s => activeTrends.has(s.key)).map(s => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Section 10 — Period Comparison */}
        <div>
          <SectionLabel>Period Comparison — {periodLabel} vs Previous {periodLabel}</SectionLabel>
          <div className="card-surface overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metric</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">This Period</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Period</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border px-5">
                {[
                  { label: "Revenue",        ...executive.revenue,      format: "currency" as const },
                  { label: "Profit",         ...executive.profit,       format: "currency" as const },
                  { label: "Labour Cost %",  ...executive.labourCostPct, format: "pct" as const },
                  { label: "Food Cost %",    ...executive.foodCostPct,   format: "pct" as const },
                  { label: "Guests",         ...executive.guests,       format: "count" as const },
                  { label: "Avg. Spend",     ...executive.avgSpend,     format: "currency" as const },
                ].map(row => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-sm text-muted-foreground">{row.label}</td>
                    <td className="px-5 py-3 text-right text-sm font-medium">
                      {row.format === "currency" ? formatCurrency(row.current) : row.format === "pct" ? `${row.current.toFixed(1)}%` : Math.round(row.current).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-muted-foreground">
                      {row.format === "currency" ? formatCurrency(row.previous) : row.format === "pct" ? `${row.previous.toFixed(1)}%` : Math.round(row.previous).toLocaleString()}
                    </td>
                    <td className={cn("px-5 py-3 text-right text-sm font-semibold", row.better ? "text-emerald-500" : "text-red-500")}>
                      {row.change >= 0 ? "+" : ""}{row.changePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 11 — Export */}
        <div>
          <SectionLabel>Export</SectionLabel>
          <div className="card-surface p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={() => handleExport("PDF Executive")}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90"
              >
                <FileText className="h-4 w-4" />
                Executive Report PDF
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleExport("CSV")}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport("PDF Investor")}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
                >
                  <TrendingUp className="h-4 w-4" />
                  Investor Report
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Exports include data for the selected period ({periodLabel}).</p>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
