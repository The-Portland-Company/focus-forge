import type {
  DailyPlanRequest,
  DailyPlanResponse,
  DominoTaskSummary,
} from "@/lib/daily-plan/types";
import { runStructuredWithFallback } from "@/lib/ai-agent/providers";

/**
 * Extract and parse a JSON object from a model completion. OpenAI/xAI JSON modes
 * return clean JSON, but Anthropic (no json_schema support) may wrap it in prose
 * or a ```json fence. This parses defensively: try as-is, strip code fences,
 * then fall back to the first balanced {...} object in the text.
 *
 * Exported for unit testing.
 */
export function parsePlannerJson(raw: string): any {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Daily planner returned empty content");
  }

  const tryParse = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // 1) Direct parse.
  const direct = tryParse(raw.trim());
  if (direct && typeof direct === "object") return direct;

  // 2) Strip markdown code fences (```json ... ``` or ``` ... ```).
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced && typeof fenced === "object") return fenced;
  }

  // 3) Extract the first balanced top-level {...} object.
  const start = raw.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = tryParse(raw.slice(start, i + 1));
          if (candidate && typeof candidate === "object") return candidate;
          break;
        }
      }
    }
  }

  throw new Error("Daily planner returned invalid JSON");
}

const RESPONSE_SCHEMA = {
  name: "daily_plan_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      orderedItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["task", "inbox_item"] },
            id: { type: "string" },
            rank: { type: "integer", minimum: 1 },
            estimateMinutes: {
              type: "integer",
              minimum: 5,
              maximum: 480,
            },
            rationale: { type: "string" },
            suggestedStart: { type: ["string", "null"] },
            suggestedEnd: { type: ["string", "null"] },
            dominoScore: { type: ["number", "null"] },
            dominoRationale: { type: ["string", "null"] },
          },
          required: [
            "kind",
            "id",
            "rank",
            "estimateMinutes",
            "rationale",
            "suggestedStart",
            "suggestedEnd",
            "dominoScore",
            "dominoRationale",
          ],
        },
      },
      deferred: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["task", "inbox_item"] },
            id: { type: "string" },
            suggestedSnoozeUntil: { type: "string" },
            reason: { type: "string" },
          },
          required: ["kind", "id", "suggestedSnoozeUntil", "reason"],
        },
      },
      estimatesProposed: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            taskId: { type: "string" },
            minutes: { type: "integer", minimum: 5, maximum: 480 },
            confidence: {
              type: "string",
              enum: ["low", "med", "high"],
            },
          },
          required: ["taskId", "minutes", "confidence"],
        },
      },
    },
    required: ["orderedItems", "deferred", "estimatesProposed"],
  },
} as const;

function getSystemPrompt(opts: {
  date: string;
  capacityMinutes: number;
  trimToCapacity: boolean;
}): string {
  return `You are a focused daily planner. Order today's work for an experienced knowledge worker.

Date: ${opts.date}
Capacity: ${opts.capacityMinutes} focus minutes total
${opts.trimToCapacity ? "Trim aggressively: defer items that do not fit within capacity." : "Order all items, but mark items that overflow capacity as deferred when they are not deadline-critical."}

Rules:
- Output JSON only matching the provided schema, no markdown.
- dominoScore is the PRIMARY ranking signal. Each task may carry a "domino" object with a precomputed score, the nearest trigger date, and the underlying stakes (what falls or pays off, in dollar-equivalents, and whether a resolver defuses it once or eliminates it for good). The tasks are already pre-sorted by this score; respect that order as the strong default. Higher dominoScore = do sooner.
- Apply capacity and deadline judgment ON TOP of the domino order: you may move a task up for a hard imminent deadline, or down/defer if it cannot fit capacity and is not deadline-critical, but only override the domino order when there is a clear capacity or deadline reason — explain that reason.
- Rank from 1 (do first). Within similar domino scores, higher priority, deadline pressure, dependencies blocking other work, and overdue status all increase rank importance.
- Echo each task's domino score back in dominoScore (null if the task has no domino object). For EVERY task that has a domino object, dominoRationale MUST explain the domino concretely: what falls (or what reward lands), WHEN it triggers (the date), its dollar-equivalent, and whether the task defuses it once or eliminates it permanently. Fold this domino explanation into the main rationale too.
- Pinned tasks must appear in orderedItems with a low rank (do soon).
- estimateMinutes: use the provided estimate when present; otherwise propose one in estimatesProposed. Round to common chunks: 15, 30, 45, 60, 90, 120, 180, 240.
- rationale: one short sentence per item explaining why it sits here.
- For deferred items, propose suggestedSnoozeUntil as an ISO timestamp (use tomorrow morning 8:00 AM by default; later for low-urgency items).
- Inbox items are usually fast (15-30m). Prefer "convert to task" framing only if the email implies real work; otherwise treat as quick triage.
- Never invent ids — only emit ids present in the input.`;
}

interface PlanInputTask {
  id: string;
  name: string;
  description?: string | null;
  priority: number | null;
  dueDate?: string | null;
  deadline?: string | null;
  timeEstimateMinutes?: number | null;
  projectName?: string | null;
  isOverdue: boolean;
  blockedBy: string[];
  blocking: string[];
  domino?: DominoTaskSummary;
}

interface PlanInputInboxItem {
  id: string;
  actionTitle: string;
  subject: string;
  classification?: string | null;
  summary?: string | null;
}

interface PlanInputBlock {
  id: string;
  startTime: string;
  endTime: string;
  title?: string | null;
}

interface RunDailyPlannerInput {
  request: DailyPlanRequest;
  resolvedDate: string;
  capacityMinutes: number;
  trimToCapacity: boolean;
  tasks: PlanInputTask[];
  inboxItems: PlanInputInboxItem[];
  timeBlocks: PlanInputBlock[];
  pinnedTaskIds: string[];
}

export async function runDailyPlanner(
  input: RunDailyPlannerInput,
): Promise<DailyPlanResponse> {
  const userMessage = JSON.stringify(
    {
      date: input.resolvedDate,
      capacityMinutes: input.capacityMinutes,
      pinnedTaskIds: input.pinnedTaskIds,
      tasks: input.tasks,
      inboxItems: input.inboxItems,
      timeBlocks: input.timeBlocks,
    },
    null,
    2,
  );

  // Route through the shared OpenAI→Anthropic→xAI fallback chain so a single
  // provider's quota/outage no longer takes the Today planner down. Structured
  // JSON is requested per provider (json_schema where supported, json_object /
  // prompt-enforced JSON otherwise) and parsed defensively below. On all
  // providers failing, runStructuredWithFallback throws an error whose text
  // still contains provider/quota wording so the card's billing button fires.
  const { text: content } = await runStructuredWithFallback({
    systemPrompt: getSystemPrompt({
      date: input.resolvedDate,
      capacityMinutes: input.capacityMinutes,
      trimToCapacity: input.trimToCapacity,
    }),
    userMessage,
    jsonSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.2,
  });

  const parsed = parsePlannerJson(content);

  const orderedItems = Array.isArray(parsed?.orderedItems)
    ? parsed.orderedItems
    : [];
  const deferred = Array.isArray(parsed?.deferred) ? parsed.deferred : [];
  const estimatesProposed = Array.isArray(parsed?.estimatesProposed)
    ? parsed.estimatesProposed
    : [];

  const plannedMinutes = orderedItems.reduce(
    (acc: number, item: any) =>
      acc + (Number.isFinite(item?.estimateMinutes) ? item.estimateMinutes : 0),
    0,
  );

  return {
    date: input.resolvedDate,
    capacityMinutes: input.capacityMinutes,
    plannedMinutes,
    overflowMinutes: Math.max(0, plannedMinutes - input.capacityMinutes),
    orderedItems,
    deferred,
    estimatesProposed,
    generatedAt: new Date().toISOString(),
  };
}
