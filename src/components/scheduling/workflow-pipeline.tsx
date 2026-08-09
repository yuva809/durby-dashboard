"use client";

import { TrendingUp, UserCheck, Sparkles, ClipboardCheck, Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineStageStatus = "done" | "active" | "pending";

export interface PipelineStage {
  key: string;
  label: string;
  detail: string;
  status: PipelineStageStatus;
  icon: React.ReactNode;
}

export function buildWorkflowStages(opts: {
  demandReady: boolean;
  availabilityTotal: number;
  availabilityReplied: number;
  scheduleExists: boolean;
  scheduleStatus: "DRAFT" | "APPROVED" | null;
}): PipelineStage[] {
  const { demandReady, availabilityTotal, availabilityReplied, scheduleExists, scheduleStatus } = opts;
  const availabilityDone = availabilityTotal > 0 && availabilityReplied >= availabilityTotal;

  return [
    {
      key: "forecast",
      label: "Forecast Demand",
      detail: demandReady ? "Expected demand computed" : "Awaiting generation",
      status: demandReady ? "done" : "pending",
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      key: "availability",
      label: "Collect Availability",
      detail:
        availabilityTotal === 0
          ? "No active employees"
          : `${availabilityReplied}/${availabilityTotal} replied`,
      status: availabilityDone ? "done" : availabilityReplied > 0 ? "active" : "pending",
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      key: "generate",
      label: "Generate AI Schedule",
      detail: scheduleExists ? "Schedule generated" : "Not yet generated",
      status: scheduleExists ? "done" : "pending",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      key: "review",
      label: "Manager Review",
      detail:
        scheduleStatus === "APPROVED" ? "Reviewed" : scheduleExists ? "Awaiting review" : "—",
      status: scheduleStatus === "APPROVED" ? "done" : scheduleExists ? "active" : "pending",
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      key: "publish",
      label: "Publish Schedule",
      detail: scheduleStatus === "APPROVED" ? "Published to staff" : "Not published",
      status: scheduleStatus === "APPROVED" ? "done" : "pending",
      icon: <Send className="h-4 w-4" />,
    },
  ];
}

export function WorkflowPipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="mb-6 flex items-stretch gap-1 overflow-x-auto rounded-xl border border-border bg-card px-3 py-3">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center">
          <div className="flex min-w-[130px] flex-col gap-1 px-2">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  stage.status === "done"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                    : stage.status === "active"
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                {stage.status === "done" ? <Check className="h-3.5 w-3.5" /> : stage.icon}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  stage.status === "pending" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
            <p className="pl-7 text-[11px] text-muted-foreground">{stage.detail}</p>
          </div>
          {i < stages.length - 1 && (
            <div
              className={cn(
                "mx-1 h-px w-6 shrink-0",
                stage.status === "done" ? "bg-emerald-500/40" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
