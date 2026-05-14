import type {
  DailyPlanRequest,
  DailyPlanResponse,
} from "@/lib/daily-plan/types";

const PLANNER_MODEL = "gpt-4.1";

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
          },
          required: [
            "kind",
            "id",
            "rank",
            "estimateMinutes",
            "rationale",
            "suggestedStart",
            "suggestedEnd",
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
- Rank from 1 (do first). Higher priority, deadline pressure, dependencies blocking other work, and overdue status all increase rank importance.
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PLANNER_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: RESPONSE_SCHEMA,
      },
      messages: [
        {
          role: "system",
          content: getSystemPrompt({
            date: input.resolvedDate,
            capacityMinutes: input.capacityMinutes,
            trimToCapacity: input.trimToCapacity,
          }),
        },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Daily planner request failed (${response.status}): ${errorText}`,
    );
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Daily planner returned empty content");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Daily planner returned invalid JSON");
  }

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
