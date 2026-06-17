export type DailyPlanItemKind = "task" | "inbox_item";

/** Compact per-stake summary attached to a plan task's `domino` object. */
export interface DominoStakeSummary {
  name: string | null;
  kind: "consequence" | "reward";
  /** Dollar magnitude (monetary_value or severity dollar-equivalent). */
  dollarEquivalent: number;
  triggerAt: string | null;
  resolution: "defuses_once" | "eliminates";
}

/** Compact domino payload attached to an eligible plan task. */
export interface DominoTaskSummary {
  score: number;
  topStakeSummary: string | null;
  nearestTriggerAt: string | null;
  stakes: DominoStakeSummary[];
}

export interface DailyPlanOrderedItem {
  kind: DailyPlanItemKind;
  id: string;
  rank: number;
  estimateMinutes: number;
  rationale: string;
  suggestedStart?: string | null;
  suggestedEnd?: string | null;
  dominoScore?: number;
  dominoRationale?: string;
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
