"use client";

import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import type { HealthScoreBreakdown } from "@/types";

export function HealthScoreCard({ score }: { score: HealthScoreBreakdown }) {
  const data = [{ name: "score", value: score.overall, fill: "hsl(var(--accent))" }];

  return (
    <div className="card-surface flex flex-col items-center gap-2 p-5">
      <span className="self-start text-sm text-muted-foreground">
        Restaurant Health Score
      </span>
      <div className="relative h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="75%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "hsl(var(--muted))" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold">{score.overall}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 pt-2 text-xs">
        <ScoreRow label="Revenue" value={score.revenue} />
        <ScoreRow label="Inventory" value={score.inventory} />
        <ScoreRow label="Labor" value={score.labor} />
        <ScoreRow label="Compliance" value={score.compliance} />
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
