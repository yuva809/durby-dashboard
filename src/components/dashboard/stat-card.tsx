import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number; // percentage change, positive or negative
  icon?: ReactNode;
}

export function StatCard({ label, value, delta, icon }: StatCardProps) {
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className="card-surface flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta !== undefined && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              isPositive ? "text-success" : "text-danger"
            )}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
