import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared across Inventory and Menu overview sections — same fixed height,
// icon-badge, and label/value rhythm as Analytics' KpiTile, just without
// the period-over-period delta line those pages don't have data for.
// Keeping this in one place means the two pages can't quietly drift apart
// in height/padding the way they already had (150px vs 130px) before.

export function OverviewTile({
  label, value, sub, icon, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="card-surface flex h-[150px] flex-col justify-between p-6">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent",
          tone === "danger" && "bg-red-500/10 text-red-500",
          tone === "warning" && "bg-amber-500/10 text-amber-500",
        )}>
          {icon}
        </span>
      </div>
      <span className="truncate text-[26px] font-semibold leading-none tracking-tight">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
