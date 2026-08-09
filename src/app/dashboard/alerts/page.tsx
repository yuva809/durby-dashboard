"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  ConfigMissingBanner,
  ErrorBanner,
  LoadingBanner,
} from "@/components/shared/query-states";
import { useAlerts, useResolveAlert } from "@/hooks/use-alerts";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { cn } from "@/lib/utils";
import type { AlertSeverity, AlertSourceAgent } from "@/types";

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  LOW: "text-muted-foreground bg-muted/50",
  MEDIUM: "text-warning bg-warning/10",
  HIGH: "text-danger bg-danger/10",
  CRITICAL: "text-danger bg-danger/15",
};

const SOURCE_AGENT_LABELS: Record<AlertSourceAgent, string> = {
  INVENTORY: "Inventory",
  SCHEDULING: "Scheduling",
  FORECAST: "Forecast",
  COMPLIANCE: "Compliance",
  FINANCE: "Finance",
  ANALYTICS: "Analytics",
  MARKETING: "Marketing",
  SUPPLIER: "Supplier",
  INTENT_ROUTER: "Employee Messages",
};

type SourceAgentFilter = AlertSourceAgent | "ALL";

export default function AlertsPage() {
  const restaurantId = useRestaurantId();
  const { data: alerts, isLoading, isError, error } = useAlerts();
  const resolveAlert = useResolveAlert();
  const [sourceAgentFilter, setSourceAgentFilter] = useState<SourceAgentFilter>("ALL");

  // Only offer filter pills for agents that actually have open alerts right
  // now, rather than always showing all 9 (most would be empty most days).
  const presentAgents = useMemo(() => {
    const seen = new Set<AlertSourceAgent>();
    for (const alert of alerts ?? []) seen.add(alert.sourceAgent);
    return Array.from(seen).sort((a, b) => SOURCE_AGENT_LABELS[a].localeCompare(SOURCE_AGENT_LABELS[b]));
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    if (!alerts) return alerts;
    if (sourceAgentFilter === "ALL") return alerts;
    return alerts.filter((alert) => alert.sourceAgent === sourceAgentFilter);
  }, [alerts, sourceAgentFilter]);

  if (!restaurantId) {
    return (
      <AppShell title="Alerts">
        <ConfigMissingBanner />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell title="Alerts">
        <LoadingBanner label="Loading alerts…" />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Alerts">
        <ErrorBanner message={error instanceof Error ? error.message : "Failed to load alerts."} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Alerts">
      <div className="card-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Active alerts across all agents</span>
          <span className="text-xs text-muted-foreground">{filteredAlerts?.length ?? 0} open</span>
        </div>

        {presentAgents.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              onClick={() => setSourceAgentFilter("ALL")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                sourceAgentFilter === "ALL"
                  ? "border-foreground/20 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              All
            </button>
            {presentAgents.map((agent) => (
              <button
                key={agent}
                onClick={() => setSourceAgentFilter(agent)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  sourceAgentFilter === agent
                    ? "border-foreground/20 bg-foreground/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {SOURCE_AGENT_LABELS[agent]}
              </button>
            ))}
          </div>
        )}

        {!filteredAlerts || filteredAlerts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {alerts && alerts.length > 0
              ? "No open alerts from this agent."
              : "No open alerts. Run an agent check (e.g. on the Inventory page) to generate new ones."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{alert.title}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          SEVERITY_STYLES[alert.severity]
                        )}
                      >
                        {alert.severity}
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/70">
                        {SOURCE_AGENT_LABELS[alert.sourceAgent]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground/80">
                      <span className="font-medium text-foreground/70">Why: </span>
                      {alert.explanation}
                    </p>
                  </div>
                  <button
                    onClick={() => resolveAlert.mutate(alert.id)}
                    disabled={resolveAlert.isPending}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
