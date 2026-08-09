"use client";

import { Brain, RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useActiveMlModel,
  useRetrainingReadiness,
  useForecastAccuracySummary,
  useTrainMlModel,
} from "@/hooks/use-ml-forecast";

// Minimal "Model" panel — the first frontend surface for the ML forecast pipeline
// (XGBoost/LightGBM/CatBoost train/predict/evaluate, previously reachable only via direct
// API call). See docs/architecture/FORECASTING_NEXT_GEN_ROADMAP.md Part 2/21 Phase 1.
// Deliberately thin: model status, WAPE-based rule-vs-ML accuracy comparison, a retraining
// readiness signal, and a manual "Train model" trigger — no auto-retraining, matching
// RetrainingReadinessService's own "signal, never an action" design.

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ModelPanel() {
  const { data: model, isLoading: modelLoading } = useActiveMlModel();
  const { data: readiness } = useRetrainingReadiness();
  const { data: accuracy, isLoading: accuracyLoading } = useForecastAccuracySummary();
  const train = useTrainMlModel();

  if (modelLoading) return null;

  return (
    <div className="card-surface p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Forecast Model
          </h2>
        </div>
        <button
          onClick={() => train.mutate()}
          disabled={train.isPending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5",
            "text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("h-3 w-3", train.isPending && "animate-spin")} />
          {train.isPending ? "Training…" : model ? "Retrain" : "Train model"}
        </button>
      </div>

      {train.isError && (
        <p className="text-xs text-red-400">
          {train.error instanceof Error ? train.error.message : "Training failed — please try again."}
        </p>
      )}
      {train.isSuccess && (
        <p className="text-xs text-emerald-400">Model trained successfully.</p>
      )}

      {!model ? (
        <p className="text-sm text-muted-foreground">
          No ML model trained yet for this restaurant. The forecast above uses the rule-based
          engine (historical weekday averages + weather/holiday/event adjustments). Training a
          model unlocks a learned, feature-driven prediction — needs at least 20 days of sales
          history with the training dataset built (see Data Center).
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Algorithm</span>
            <span className="text-sm font-bold capitalize">{model.algorithm}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Trained</span>
            <span className="text-sm font-bold">{fmtDate(model.trainedAt)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Training rows</span>
            <span className="text-sm font-bold">{model.sampleSizeTrain + model.sampleSizeValidation}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Training MAE</span>
            <span className="text-sm font-bold">{model.metrics.mae.toFixed(1)} guests</span>
          </div>
        </div>
      )}

      {readiness?.shouldRetrain && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-400 mb-1">Retraining may improve accuracy</p>
          <ul className="flex flex-col gap-0.5">
            {readiness.reasons.map((r, i) => (
              <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
      )}

      {!accuracyLoading && accuracy && accuracy.reconciledCount > 0 && (
        <div className="border-t border-border/60 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Forecast accuracy — last {accuracy.reconciledCount} reconciled predictions (WAPE, lower is better)
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-muted-foreground">Rule engine: </span>
              <span className="font-bold">{fmtPct(accuracy.rule.wape)}</span>
            </span>
            {accuracy.ml && (
              <span>
                <span className="text-muted-foreground">ML model: </span>
                <span className="font-bold text-accent">{fmtPct(accuracy.ml.wape)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
