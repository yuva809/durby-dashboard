"use client";

import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSalesQualityReport } from "@/hooks/use-data-center";

// See docs/architecture/FORECASTING_NEXT_GEN_ROADMAP.md Part 4 — the honest
// answer to "can I trust the forecast built from this data," surfaced where
// a manager actually uploads sales data rather than buried in an API only
// this session's own audit found unused.

function scoreCfg(score: number): { label: string; cls: string; Icon: typeof ShieldCheck } {
  if (score >= 80) return { label: "Good", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", Icon: ShieldCheck };
  if (score >= 50) return { label: "Fair", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400", Icon: ShieldAlert };
  return { label: "Needs attention", cls: "border-red-500/30 bg-red-500/10 text-red-400", Icon: ShieldAlert };
}

export function SalesQualityCard() {
  const { data, isLoading } = useSalesQualityReport();

  if (isLoading || !data || data.dateRangeCovered === null) return null; // no sales data yet — nothing to report

  const cfg = scoreCfg(data.overallScore);
  const Icon = cfg.Icon;

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Sales Data Quality
          </h3>
        </div>
        <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", cfg.cls)}>
          <Icon className="h-3 w-3" />
          {cfg.label} — {data.overallScore}/100
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Coverage</span>
          <span className="font-semibold">
            {data.daysWithData} / {data.totalDaysInRange} days
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Missing days</span>
          <span className="font-semibold">{data.missingDayCount}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Estimated guest counts</span>
          <span className="font-semibold">{data.estimatedGuestCountDays} days</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Date range</span>
          <span className="font-semibold">
            {data.dateRangeCovered.from} → {data.dateRangeCovered.to}
          </span>
        </div>
      </div>

      {data.missingDayCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Forecasts are less reliable on weekdays with sparse history. Upload the missing days to improve accuracy.
        </p>
      )}
    </div>
  );
}
