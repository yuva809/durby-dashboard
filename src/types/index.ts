// Domain types shared between server, services, and UI.
// These mirror the Prisma schema but stay framework-agnostic
// so they can be reused in the AI Decision Engine layer too.

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AlertType =
  | "LOW_INVENTORY"
  | "REVENUE_DROP"
  | "FOOD_WASTE"
  | "MISSING_STAFF"
  | "SUPPLIER_PRICE_INCREASE"
  | "HIGH_LABOUR_COST"
  | "COMPLIANCE_ISSUE"
  | "DOCUMENT_EXPIRY"
  | "TRAINING_EXPIRY"
  | "CERTIFICATION_EXPIRY"
  | "CONTRACT_EXPIRY"
  | "EMPLOYEE_MESSAGE_ESCALATION";

// Which system component raised the alert — orthogonal to AlertType (the
// business issue). Mirrors the backend's SourceAgent enum.
export type AlertSourceAgent =
  | "INVENTORY"
  | "SCHEDULING"
  | "FORECAST"
  | "COMPLIANCE"
  | "FINANCE"
  | "ANALYTICS"
  | "MARKETING"
  | "SUPPLIER"
  | "INTENT_ROUTER";

export interface AlertItem {
  id: string;
  type: AlertType;
  sourceAgent: AlertSourceAgent;
  severity: AlertSeverity;
  title: string;
  description: string;
  explanation: string; // every alert must explain WHY
  createdAt: string;
  resolved: boolean;
}

export interface HealthScoreBreakdown {
  overall: number; // 0-100
  revenue: number;
  inventory: number;
  labor: number;
  compliance: number;
}

export interface DashboardSummary {
  date: string;
  dataDate: string;
  isLiveToday: boolean;
  revenueToday: number;
  revenueYesterday: number;
  profitToday: number;
  reservationsToday: number;
  walkInPrediction: number;
  inventoryHealth: number; // 0-100
  laborCostPct: number; // % of revenue
  foodCostPct: number; // % of revenue
  wastePct: number;
  healthScore: HealthScoreBreakdown;
  alerts: AlertItem[];
  revenueTrend: { date: string; revenue: number; profit: number }[];
}

export interface DecisionEngineRecommendation {
  id: string;
  agent:
    | "INVENTORY"
    | "SCHEDULING"
    | "FORECAST"
    | "COMPLIANCE"
    | "FINANCE"
    | "ANALYTICS"
    | "MARKETING"
    | "SUPPLIER";
  problem: string;
  recommendation: string;
  confidence: number; // 0-1
  explanation: string;
}
