export type DailyPlanItemKind = "task" | "inbox_item";

export interface DailyPlanOrderedItem {
  kind: DailyPlanItemKind;
  id: string;
  rank: number;
  estimateMinutes: number;
  rationale: string;
  suggestedStart?: string | null;
  suggestedEnd?: string | null;
}

export interface DailyPlanDeferredItem {
  kind: DailyPlanItemKind;
  id: string;
  suggestedSnoozeUntil: string;
  reason: string;
}

export interface DailyPlanEstimateProposal {
  taskId: string;
  minutes: number;
  confidence: "low" | "med" | "high";
}

export interface DailyPlanResponse {
  date: string;
  capacityMinutes: number;
  plannedMinutes: number;
  overflowMinutes: number;
  orderedItems: DailyPlanOrderedItem[];
  deferred: DailyPlanDeferredItem[];
  estimatesProposed: DailyPlanEstimateProposal[];
  generatedAt: string;
}

export interface DailyPlanRequest {
  date?: string;
  overrideCapacityMinutes?: number;
  pinnedTaskIds?: string[];
  trimToCapacity?: boolean;
}
