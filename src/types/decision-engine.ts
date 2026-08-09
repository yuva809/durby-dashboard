export type AgentName =
  | "INVENTORY"
  | "SCHEDULING"
  | "FORECAST"
  | "COMPLIANCE"
  | "FINANCE"
  | "ANALYTICS"
  | "MARKETING"
  | "SUPPLIER";

export interface DecisionEngineRecommendation {
  id: string;
  agent: AgentName;
  problem: string;
  risk: string;
  recommendation: string;
  suggestedAction: string;
  confidence: number;
  explanation: string;
}

export interface DecisionEngineResult {
  restaurantId: string;
  agent: AgentName;
  generatedAt: string;
  recommendations: DecisionEngineRecommendation[];
}
