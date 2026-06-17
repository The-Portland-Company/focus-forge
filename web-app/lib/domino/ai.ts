// Domino Effect — AI-assisted NL capture (Phase 6).
// Modeled on web-app/lib/email-inbox/ai.ts: gpt-4.1 + strict json_schema,
// confidence + reason, and a PURE heuristic fallback when no API key is set.
// See web-app/docs/domino-effect-stakes-plan.md (Phase 6).

import { createClient } from "@/lib/supabase/server";
import type { StakeKind, ResolutionType } from "./scoring";
import type { Severity } from "./constants";

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

export interface StakeProposal {
  kind: StakeKind;
  name: string;
  monetary_value?: number | null;
  severity?: Severity | null;
  /** ISO-8601 timestamp when the domino falls. */
  trigger_at?: string | null;
  recurrence?: string | null;
  recurrence_interval_days?: number | null;
}

/**
 * Proposed parent → child cascade relationship.
 * Edges reference stakes by their INDEX in the returned `stakes` array
 * (parentIndex / childIndex). Index references keep the payload compact and
 * unambiguous before the proposed stakes have been persisted (no ids yet).
 */
export interface EdgeProposal {
  parentIndex: number;
  childIndex: number;
  weight_multiplier?: number | null;
}

/**
 * Proposed task ↔ stake link. `stakeIndex` references the `stakes` array;
 * `taskId` is optional because NL capture may run before a task is chosen.
 */
export interface LinkProposal {
  stakeIndex: number;
  taskId?: string | null;
  resolution_type: ResolutionType;
}

export interface StakeExtraction {
  stakes: StakeProposal[];
  edges: EdgeProposal[];
  links: LinkProposal[];
  confidence?: number;
  reason?: string;
}

export interface ExtractStakesInput {
  text: string;
  organizationId: string;
  userId: string;
  projectId?: string | null;
}

export interface StakeExtractionExample {
  rawInput: string;
  acceptedPayload: unknown;
}

// ---------------------------------------------------------------------------
// Pure heuristic helpers (unit-testable; no I/O)
// ---------------------------------------------------------------------------

const RECURRENCE_BY_UNIT: Record<string, { recurrence: string; days: number }> = {
  day: { recurrence: "daily", days: 1 },
  daily: { recurrence: "daily", days: 1 },
  week: { recurrence: "weekly", days: 7 },
  weekly: { recurrence: "weekly", days: 7 },
  month: { recurrence: "monthly", days: 30 },
  monthly: { recurrence: "monthly", days: 30 },
  year: { recurrence: "yearly", days: 365 },
  yearly: { recurrence: "yearly", days: 365 },
  annual: { recurrence: "yearly", days: 365 },
};

/**
 * Parse the first dollar amount from text. Handles "$40", "$1,250.50",
 * "$2k". Returns null when no amount is present.
 */
export function parseDollarAmount(text: string): number | null {
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([km])?/i);
  if (!match) return null;

  const raw = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(raw)) return null;

  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") return raw * 1_000;
  if (suffix === "m") return raw * 1_000_000;
  return raw;
}

/**
 * Infer a recurrence + interval from text such as "$40/week", "per month",
 * "every 2 weeks", "weekly". Returns null when no recurrence cue is present.
 */
export function parseRecurrence(
  text: string,
): { recurrence: string; recurrence_interval_days: number } | null {
  const lower = text.toLowerCase();

  // "every N days/weeks/months"
  const everyN = lower.match(
    /every\s+(\d+)\s*(day|days|week|weeks|month|months|year|years)/,
  );
  if (everyN) {
    const n = Number(everyN[1]);
    const unit = everyN[2].replace(/s$/, "");
    const base = RECURRENCE_BY_UNIT[unit];
    if (base && Number.isFinite(n) && n > 0) {
      return {
        recurrence: base.recurrence,
        recurrence_interval_days: base.days * n,
      };
    }
  }

  // "/week", "/mo", "per week", "weekly", "monthly", "a month"
  const unitMatch = lower.match(
    /(?:\/|per\s+|a\s+|each\s+)(day|week|month|year)\b|\b(daily|weekly|monthly|yearly|annual)\b/,
  );
  if (unitMatch) {
    const unit = unitMatch[1] || unitMatch[2];
    const base = RECURRENCE_BY_UNIT[unit];
    if (base) {
      return {
        recurrence: base.recurrence,
        recurrence_interval_days: base.days,
      };
    }
  }

  return null;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/**
 * Parse a deadline cue into an ISO trigger_at, relative to `now`.
 * Handles "by Friday"/weekday names (next occurrence), "tomorrow",
 * "today", "next week", "in N days/weeks". Returns null when no cue found.
 * Pure: the clock is injected via `now`.
 */
export function parseDeadline(text: string, now: Date = new Date()): string | null {
  const lower = text.toLowerCase();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const atEndOfDay = (d: Date) => {
    const out = new Date(d);
    out.setUTCHours(23, 59, 59, 0);
    return out.toISOString();
  };

  if (/\btoday\b/.test(lower)) {
    return atEndOfDay(now);
  }
  if (/\btomorrow\b/.test(lower)) {
    return atEndOfDay(new Date(now.getTime() + DAY_MS));
  }

  // "in N days/weeks"
  const inN = lower.match(/\bin\s+(\d+)\s*(day|days|week|weeks)\b/);
  if (inN) {
    const n = Number(inN[1]);
    const mult = inN[2].startsWith("week") ? 7 : 1;
    if (Number.isFinite(n) && n > 0) {
      return atEndOfDay(new Date(now.getTime() + n * mult * DAY_MS));
    }
  }

  // weekday: "by Friday", "on monday", "Friday"
  const weekdayMatch = lower.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekdayMatch) {
    const target = WEEKDAYS.indexOf(weekdayMatch[1]);
    const current = now.getUTCDay();
    let delta = (target - current + 7) % 7;
    // "next week" qualifier or same-day → push to the next occurrence (not today).
    if (delta === 0) delta = 7;
    if (/\bnext\b/.test(lower)) delta += 7;
    return atEndOfDay(new Date(now.getTime() + delta * DAY_MS));
  }

  // "next week" with no weekday → 7 days out.
  if (/\bnext\s+week\b/.test(lower)) {
    return atEndOfDay(new Date(now.getTime() + 7 * DAY_MS));
  }

  return null;
}

/**
 * Detect whether the text describes a reward rather than a consequence.
 * Defaults to "consequence" (the common stakes case).
 */
export function inferKind(text: string): StakeKind {
  const lower = text.toLowerCase();
  if (
    /\b(reward|bonus|earn|win|gain|payout|prize|i (?:get|receive)|payday)\b/.test(
      lower,
    )
  ) {
    return "reward";
  }
  return "consequence";
}

/** Strip leading conditionals/cruft to make a short stake name. */
function deriveStakeName(text: string): string {
  let name = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^if\s+i\s+(?:don'?t|do not|can'?t|cannot|fail to)\s+/i, "")
    .replace(/^if\s+/i, "");
  // Drop a trailing "I can't work" style consequence clause for the name.
  name = name.split(/\s+(?:i|then|so|or|otherwise)\s+/i)[0] || name;
  name = name.replace(/[.,!?]+$/, "").trim();
  if (name.length > 120) name = `${name.slice(0, 117)}...`;
  return name || text.slice(0, 120) || "Stake";
}

/**
 * Pure heuristic extraction used when no OpenAI key is configured.
 * Produces a single best-guess stake (no edges/links inferred heuristically).
 */
export function heuristicExtract(
  input: { text: string },
  now: Date = new Date(),
): StakeExtraction {
  const text = (input.text || "").trim();

  if (!text) {
    return {
      stakes: [],
      edges: [],
      links: [],
      confidence: 0,
      reason: "No input text provided.",
    };
  }

  const monetary = parseDollarAmount(text);
  const recurrence = parseRecurrence(text);
  const triggerAt = parseDeadline(text, now);
  const kind = inferKind(text);

  const stake: StakeProposal = {
    kind,
    name: deriveStakeName(text),
    monetary_value: monetary,
    severity: monetary === null ? "moderate" : null,
    trigger_at: triggerAt,
    recurrence: recurrence?.recurrence ?? null,
    recurrence_interval_days: recurrence?.recurrence_interval_days ?? null,
  };

  // Confidence reflects how many signals we resolved.
  const signals = [
    monetary !== null,
    triggerAt !== null,
    recurrence !== null,
  ].filter(Boolean).length;
  const confidence = 0.4 + signals * 0.15;

  return {
    stakes: [stake],
    edges: [],
    links: [],
    confidence,
    reason:
      `Heuristic parse: detected ${kind}` +
      (monetary !== null ? `, $${monetary}` : "") +
      (recurrence ? `, ${recurrence.recurrence}` : "") +
      (triggerAt ? `, deadline ${triggerAt}` : "") +
      ". No API key configured.",
  };
}

// ---------------------------------------------------------------------------
// Few-shot example persistence (parallel to ai-estimator/examples.ts)
// ---------------------------------------------------------------------------

/** Pull the user's recent accepted stake extractions for few-shot calibration. */
export async function loadStakeExtractionExamples(
  userId: string,
  options?: { limit?: number },
): Promise<StakeExtractionExample[]> {
  const limit = options?.limit ?? 8;
  const supabase = await createClient();

  const { data } = await (supabase as any)
    .from("stake_extraction_examples")
    .select("raw_input, accepted_payload")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? [])
    .filter((row: any) => row?.raw_input)
    .map((row: any) => ({
      rawInput: row.raw_input as string,
      acceptedPayload: row.accepted_payload,
    }));
}

/** Persist an accepted extraction so future captures calibrate to the user. */
export async function appendStakeExtractionExample(
  userId: string,
  rawInput: string,
  acceptedPayload: unknown,
): Promise<void> {
  const supabase = await createClient();
  await (supabase as any).from("stake_extraction_examples").insert({
    user_id: userId,
    raw_input: rawInput,
    accepted_payload: acceptedPayload,
  });
}

// ---------------------------------------------------------------------------
// Strict json_schema
// ---------------------------------------------------------------------------

function getResponseSchema() {
  return {
    name: "domino_stake_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        stakes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["consequence", "reward"] },
              name: { type: "string" },
              monetary_value: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              severity: {
                anyOf: [
                  {
                    type: "string",
                    enum: ["minor", "moderate", "severe", "critical"],
                  },
                  { type: "null" },
                ],
              },
              trigger_at: { anyOf: [{ type: "string" }, { type: "null" }] },
              recurrence: { anyOf: [{ type: "string" }, { type: "null" }] },
              recurrence_interval_days: {
                anyOf: [{ type: "integer" }, { type: "null" }],
              },
            },
            required: [
              "kind",
              "name",
              "monetary_value",
              "severity",
              "trigger_at",
              "recurrence",
              "recurrence_interval_days",
            ],
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              parentIndex: { type: "integer" },
              childIndex: { type: "integer" },
              weight_multiplier: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
            },
            required: ["parentIndex", "childIndex", "weight_multiplier"],
          },
        },
        links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              stakeIndex: { type: "integer" },
              taskId: { anyOf: [{ type: "string" }, { type: "null" }] },
              resolution_type: {
                type: "string",
                enum: ["defuses_once", "eliminates"],
              },
            },
            required: ["stakeIndex", "taskId", "resolution_type"],
          },
        },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["stakes", "edges", "links", "confidence", "reason"],
    },
  };
}

// ---------------------------------------------------------------------------
// Normalization of AI output → typed proposals
// ---------------------------------------------------------------------------

const SEVERITIES: Severity[] = ["minor", "moderate", "severe", "critical"];

function normalizeExtraction(parsed: any, stakeCount: number): StakeExtraction {
  const stakes: StakeProposal[] = Array.isArray(parsed?.stakes)
    ? parsed.stakes.map((s: any) => ({
        kind: s?.kind === "reward" ? "reward" : "consequence",
        name: String(s?.name || "Stake").slice(0, 200),
        monetary_value:
          typeof s?.monetary_value === "number" &&
          Number.isFinite(s.monetary_value)
            ? Math.abs(s.monetary_value)
            : null,
        severity: SEVERITIES.includes(s?.severity) ? s.severity : null,
        trigger_at: s?.trigger_at ? String(s.trigger_at) : null,
        recurrence: s?.recurrence ? String(s.recurrence) : null,
        recurrence_interval_days:
          typeof s?.recurrence_interval_days === "number" &&
          Number.isFinite(s.recurrence_interval_days) &&
          s.recurrence_interval_days > 0
            ? Math.floor(s.recurrence_interval_days)
            : null,
      }))
    : [];

  const count = stakeCount || stakes.length;
  const inRange = (i: unknown) =>
    typeof i === "number" && Number.isInteger(i) && i >= 0 && i < count;

  const edges: EdgeProposal[] = Array.isArray(parsed?.edges)
    ? parsed.edges
        .filter(
          (e: any) =>
            inRange(e?.parentIndex) &&
            inRange(e?.childIndex) &&
            e.parentIndex !== e.childIndex,
        )
        .map((e: any) => ({
          parentIndex: e.parentIndex,
          childIndex: e.childIndex,
          weight_multiplier:
            typeof e?.weight_multiplier === "number" &&
            Number.isFinite(e.weight_multiplier)
              ? e.weight_multiplier
              : null,
        }))
    : [];

  const links: LinkProposal[] = Array.isArray(parsed?.links)
    ? parsed.links
        .filter((l: any) => inRange(l?.stakeIndex))
        .map((l: any) => ({
          stakeIndex: l.stakeIndex,
          taskId: l?.taskId ? String(l.taskId) : null,
          resolution_type:
            l?.resolution_type === "eliminates"
              ? "eliminates"
              : "defuses_once",
        }))
    : [];

  return {
    stakes,
    edges,
    links,
    confidence:
      typeof parsed?.confidence === "number" ? parsed.confidence : undefined,
    reason: typeof parsed?.reason === "string" ? parsed.reason : undefined,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function extractStakesWithAI(
  input: ExtractStakesInput,
): Promise<StakeExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = heuristicExtract({ text: input.text });

  if (!apiKey) {
    return fallback;
  }

  let examples: StakeExtractionExample[] = [];
  try {
    examples = await loadStakeExtractionExamples(input.userId);
  } catch {
    examples = [];
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: getResponseSchema(),
        },
        messages: [
          {
            role: "system",
            content: `You extract "stakes" (consequences and rewards) from a user's natural-language note for Focus: Forge's Domino Effect feature.
Return JSON only.
A stake has a kind (consequence|reward), a short name, and either a monetary_value (positive dollars) OR a severity tier (minor|moderate|severe|critical) when no dollar figure is given.
If a deadline is implied (a weekday, "by Friday", "next week", "tomorrow", "in N days"), set trigger_at to an ISO-8601 timestamp.
If a cost recurs (e.g. "$40/week", "monthly"), set recurrence (daily|weekly|monthly|yearly) and recurrence_interval_days.
edges describe cascades: parentIndex and childIndex refer to positions in the stakes array (parent's fall triggers the child). Only emit an edge when the note clearly chains one consequence into another.
links describe task↔stake resolution: stakeIndex refers to the stakes array; resolution_type is "defuses_once" (handles this instance) or "eliminates" (removes the recurring stake). Only emit links when a concrete action is described; leave taskId null.
Default kind to consequence. Provide a confidence (0-1) and a one-sentence reason.
Today is ${new Date().toISOString()}.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              text: input.text,
              projectId: input.projectId ?? null,
              examples: examples.map((ex) => ({
                rawInput: ex.rawInput,
                acceptedPayload: ex.acceptedPayload,
              })),
              fallback,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return fallback;
    }

    const parsed = JSON.parse(content);
    const normalized = normalizeExtraction(parsed, parsed?.stakes?.length ?? 0);

    if (normalized.stakes.length === 0) {
      return fallback;
    }

    return {
      ...normalized,
      confidence: normalized.confidence ?? fallback.confidence,
      reason: normalized.reason ?? fallback.reason,
    };
  } catch {
    return fallback;
  }
}
