export type ConnectorStatus =
  | "pending"
  | "connecting"
  | "waiting"
  | "approved"
  | "fetching"
  | "done"
  | "skipped"
  | "error";

export interface ConnectorDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  scope: string;
}

export interface ConnectorState {
  id: string;
  status: ConnectorStatus;
  grant: import("@opendatalabs/connect/core").GrantPayload | null;
  data: unknown;
  error: string | null;
}

export type AppStep = "connect" | "analyzing" | "results";

export interface Correlation {
  title: string;
  finding: string;
  impact: "high" | "medium" | "low";
  direction: "positive" | "negative";
}

export interface DayPattern {
  day: string;
  sleepQuality: number;
  thinkingQuality: number;
  readiness: number;
}

export interface ConversationCategory {
  category: string;
  percentage: number;
  quality: number;
  description: string;
}

export interface PeakCondition {
  condition: string;
  effect: string;
  confidence: "high" | "medium" | "low";
}

export interface Recommendation {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

export interface Insight {
  category: string;
  detail: string;
}

export interface AnalysisResult {
  overallScore: number;
  sleepImpactScore: number;
  thinkingQualityScore: number;
  summary: string;
  correlations: Correlation[];
  weeklyPattern: DayPattern[];
  conversationBreakdown: ConversationCategory[];
  peakConditions: PeakCondition[];
  recommendations: Recommendation[];
  insights: Insight[];
  dataSourcesUsed: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
