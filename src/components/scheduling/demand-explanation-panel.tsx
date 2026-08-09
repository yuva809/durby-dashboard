"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, CloudRain, PartyPopper, Landmark, Gauge } from "lucide-react";
import type { DailyExpectedDemand, DemandFactor } from "@/hooks/use-scheduling";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<DemandFactor["category"], React.ReactNode> = {
  weather: <CloudRain className="h-3 w-3" />,
  holiday: <Landmark className="h-3 w-3" />,
  event: <PartyPopper className="h-3 w-3" />,
  capacity: <Gauge className="h-3 w-3" />,
};

function DayCard({ day }: { day: DailyExpectedDemand }) {
  const [open, setOpen] = useState(false);
  const date = new Date(day.date + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });

  return (
    <div className="rounded-lg border border-border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="w-20 shrink-0 text-xs font-medium text-foreground">{date}</span>
        <span className="text-sm font-semibold text-foreground">{Math.round(day.expectedGuests)} guests</span>
        <span className="text-xs text-muted-foreground">
          {day.confirmedReservations} reservations + {Math.round(day.forecastedWalkIns)} walk-ins
        </span>
        {day.forecastCoverage === "reservations_only" && (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            No forecast — reservations only
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          {day.factors.map((f) => (
            <span key={f.category} title={f.description}>{CATEGORY_ICON[f.category]}</span>
          ))}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          <ul className="space-y-1">
            {day.reasoning.map((line, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Why AI made this schedule" — the reasoning behind the guest-demand
 *  number that drove staffing, not just the final number. */
export function DemandExplanationPanel({ demandBreakdown }: { demandBreakdown: DailyExpectedDemand[] }) {
  if (demandBreakdown.length === 0) return null;

  const totalReservations = demandBreakdown.reduce((s, d) => s + d.confirmedReservations, 0);
  const totalWalkIns = demandBreakdown.reduce((s, d) => s + d.forecastedWalkIns, 0);
  const totalGuests = demandBreakdown.reduce((s, d) => s + d.expectedGuests, 0);
  const gapDays = demandBreakdown.filter((d) => d.forecastCoverage === "reservations_only").length;

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
        <Brain className="h-4 w-4" />
        Why AI made this schedule
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <span className="text-muted-foreground">
          Expected guests: <span className="font-semibold text-foreground">{Math.round(totalGuests)}</span>
        </span>
        <span className="text-muted-foreground">
          Confirmed reservations: <span className="font-semibold text-foreground">{totalReservations}</span>
        </span>
        <span className="text-muted-foreground">
          Forecasted walk-ins: <span className="font-semibold text-foreground">{Math.round(totalWalkIns)}</span>
        </span>
        {gapDays > 0 && (
          <span className={cn("font-medium text-amber-600 dark:text-amber-400")}>
            {gapDays} day{gapDays > 1 ? "s" : ""} outside forecast coverage — reservations only
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {demandBreakdown.map((day) => (
          <DayCard key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}
