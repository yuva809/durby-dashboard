"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  ConfigMissingBanner,
  ErrorBanner,
  LoadingBanner,
} from "@/components/shared/query-states";
import { useAgentCheck, type AgentDomain } from "@/hooks/use-agent-check";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { formatPercent } from "@/lib/utils";

interface AgentCheckPanelProps {
  domain: AgentDomain;
  loadingLabel: string;
  emptyLabel: string;
  icon: ReactNode;
}

export function AgentCheckPanel({
  domain,
  loadingLabel,
  emptyLabel,
  icon,
}: AgentCheckPanelProps) {
  const restaurantId = useRestaurantId();
  const { data, isLoading, isError, error, refetch, isRefetching } = useAgentCheck(domain);

  if (!restaurantId) return <ConfigMissingBanner />;
  if (isLoading) return <LoadingBanner label={loadingLabel} />;
  if (isError || !data) {
    return (
      <ErrorBanner message={error instanceof Error ? error.message : "Failed to run agent check."} />
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          Generated {new Date(data.generatedAt).toLocaleString()}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          Re-run
        </button>
      </div>

      {data.recommendations.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.recommendations.map((rec) => (
            <div key={rec.id} className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{rec.problem}</span>
                <span className="text-xs text-muted-foreground">
                  Confidence {formatPercent(rec.confidence * 100)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{rec.risk}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Recommended: </span>
                {rec.recommendation}
              </p>
              <p className="mt-1 text-sm text-accent">{rec.suggestedAction}</p>
              <p className="mt-2 text-xs text-muted-foreground/80">
                <span className="font-medium text-foreground/70">Why: </span>
                {rec.explanation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
