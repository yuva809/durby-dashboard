"use client";

import { CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportLog } from "@/hooks/use-data-center";

// Four visible stages, matching the pipeline: file transfer (client ->
// server, real byte progress via XHR) -> parsing -> writing to the
// database -> agents/refresh. "Processing" below covers both parsing and
// writing (ImportLog.stage), since from the user's point of view both are
// "the server is working on my file" — the row-level detail (rowsProcessed
// / totalRows) is still shown as a sub-line.
type Step = "uploading" | "processing" | "saving" | "done";

function stepStatus(step: Step, uploadPct: number | null, lastImport: ImportLog | null): "pending" | "active" | "done" | "error" {
  if (lastImport?.stage === "failed") {
    if (step === "uploading") return "done";
    return "error";
  }
  if (step === "uploading") {
    if (uploadPct === null) return "pending";
    return uploadPct >= 100 ? "done" : "active";
  }
  if (uploadPct !== null && uploadPct < 100) return "pending"; // still uploading
  if (!lastImport) return step === "processing" ? "active" : "pending";

  const stage = lastImport.stage;
  if (step === "processing") {
    if (stage === "queued" || stage === "parsing" || stage === "writing") return "active";
    return "done";
  }
  if (step === "saving") {
    if (stage === "writing") return "active";
    if (stage === "agents_running" || stage === "completed") return "done";
    return "pending";
  }
  // step === "done"
  return stage === "completed" ? "done" : stage === "agents_running" ? "active" : "pending";
}

const STEP_LABELS: Record<Step, string> = {
  uploading: "Uploading file",
  processing: "Processing data",
  saving: "Saving to database",
  done: "Refreshing dashboard",
};

function StepRow({ label, status }: { label: string; status: "pending" | "active" | "done" | "error" }) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-xs",
      status === "pending" && "text-muted-foreground/50",
      status === "active" && "text-accent",
      status === "done" && "text-green-500",
      status === "error" && "text-red-500",
    )}>
      {status === "done" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      {status === "active" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
      {status === "error" && <XCircle className="h-3.5 w-3.5 shrink-0" />}
      {status === "pending" && <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-current" />}
      <span>{label}</span>
    </div>
  );
}

export function UploadProgress({
  uploadPct,
  lastImport,
  uploadError,
  onRetry,
  onDismiss,
}: {
  /** null = not currently uploading; 0-100 = real XHR transfer progress */
  uploadPct: number | null;
  lastImport: ImportLog | null;
  /** Set when the upload request itself failed (network error, 400
   *  validation) — no ImportLog exists for that attempt, so this is the
   *  only place that failure can be represented. Takes priority over
   *  lastImport when present. */
  uploadError?: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const steps: Step[] = ["uploading", "processing", "saving", "done"];
  const uploadFailed = !!uploadError;
  const processingFailed = !uploadFailed && lastImport?.stage === "failed";
  const failed = uploadFailed || processingFailed;
  const finished = !uploadFailed && lastImport?.stage === "completed";

  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-lg px-3 py-2.5",
      failed ? "bg-red-500/10" : finished ? "bg-green-500/10" : "bg-accent/5 border border-accent/20",
    )}>
      {!uploadFailed && uploadPct !== null && uploadPct < 100 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-accent transition-all duration-150"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}

      {!uploadFailed && (
        <div className="flex flex-col gap-1">
          {steps.map((step) => (
            <StepRow key={step} label={STEP_LABELS[step]} status={stepStatus(step, uploadPct, lastImport)} />
          ))}
        </div>
      )}

      {!uploadFailed && lastImport?.stage === "writing" && lastImport.totalRows ? (
        <p className="pl-5.5 text-[11px] text-muted-foreground">
          Row {lastImport.rowsProcessed.toLocaleString()} of {lastImport.totalRows.toLocaleString()}
        </p>
      ) : null}

      {finished && lastImport && (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <span>
            {lastImport.rowsImported.toLocaleString()} row{lastImport.rowsImported === 1 ? "" : "s"} imported
            {lastImport.rowsFailed > 0 ? `, ${lastImport.rowsFailed} failed` : ""}
            {lastImport.agentsTriggered.length > 0 ? ` — ${lastImport.agentsTriggered.length} agents ran` : ""}
          </span>
          {onDismiss && (
            <button className="ml-auto opacity-60 hover:opacity-100" onClick={onDismiss}>✕</button>
          )}
        </div>
      )}

      {failed && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          {uploadFailed
            ? <><XCircle className="h-3.5 w-3.5 shrink-0" /><span>{uploadError}</span></>
            : <span>{lastImport?.errors[0] ?? "Import failed"}</span>}
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-auto flex items-center gap-1 rounded border border-red-500/30 px-2 py-0.5 font-medium hover:bg-red-500/10"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      )}

      {!uploadFailed && lastImport && lastImport.errors.length > 0 && (
        <div className="flex flex-col gap-0.5 pl-5 text-[11px] text-red-400">
          {lastImport.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
          {lastImport.errors.length > 3 && <div className="opacity-60">+{lastImport.errors.length - 3} more</div>}
        </div>
      )}
    </div>
  );
}
