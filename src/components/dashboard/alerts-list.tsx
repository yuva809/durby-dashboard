import { AlertTriangle, Info, Flame, ShieldAlert } from "lucide-react";
import type { AlertItem, AlertSeverity } from "@/types";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  LOW: "text-muted-foreground bg-muted/50",
  MEDIUM: "text-warning bg-warning/10",
  HIGH: "text-danger bg-danger/10",
  CRITICAL: "text-danger bg-danger/15",
};

const SEVERITY_ICON: Record<AlertSeverity, typeof Info> = {
  LOW: Info,
  MEDIUM: AlertTriangle,
  HIGH: Flame,
  CRITICAL: ShieldAlert,
};

export function AlertsList({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="card-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Active Alerts</span>
        <span className="text-xs text-muted-foreground">{alerts.length} open</span>
      </div>
      <div className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const Icon = SEVERITY_ICON[alert.severity];
          return (
            <div
              key={alert.id}
              className="rounded-lg border border-border bg-muted/20 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    SEVERITY_STYLES[alert.severity]
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{alert.title}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        SEVERITY_STYLES[alert.severity]
                      )}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {alert.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    <span className="font-medium text-foreground/70">Why: </span>
                    {alert.explanation}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
