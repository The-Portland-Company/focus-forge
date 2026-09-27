import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Decision audit log for AI agent tool calls (OWASP AI Agent Security Cheat
 * Sheet §6: log classification, risk, authorization outcome, approval id,
 * execution result and policy version for every tool invocation).
 *
 * Reuses the existing `entity_events` audit table (see lib/db/supabase-adapter.ts
 * and lib/history-timeline.ts) rather than introducing a new table/migration.
 * Rows are written with `entity_type: "agent_tool_call"` and with
 * `organization_id`/`project_id` left null so they never surface in the
 * existing org/project history timeline (lib/history-timeline.ts,
 * getScopeHistory), which is scoped to those columns and to the entity types
 * "organization" | "project" | "section" | "task". Per-entity lookups
 * (getEntityHistory) are also unaffected since they filter on a specific
 * entity_type/entity_id.
 *
 * HARD RULE: never persist message bodies, email addresses, or credentials.
 * `assertNoPii` below scans the serialized snapshot before insert and throws
 * rather than write anything that looks like an email address or a raw
 * secret; callers must pass ids/hashes for anything user-authored.
 */

export type ToolCallClassification =
  | "read"
  | "write_low_risk"
  | "write_high_risk"
  | "destructive";

export type AuthorizationOutcome = "allowed" | "denied" | "needs_confirmation";

export type ToolExecutionResult =
  | "success"
  | "failure"
  | "error"
  | "pending";

export interface AgentToolCallAuditInput {
  /** Acting user's id (provenance — matches tasks.agent_name/agent_model pattern). */
  userId: string;
  agentName?: string | null;
  agentModel?: string | null;
  /** Name of the tool as declared in AGENT_TOOLS, e.g. "create_task". */
  toolName: string;
  classification: ToolCallClassification;
  /** 0 (no risk) - 1 (maximum risk). */
  riskScore: number;
  authorizationOutcome: AuthorizationOutcome;
  /** Confirm-gate token / approval id when the call required one (see confirm-gate.ts). */
  approvalId?: string | null;
  executionResult: ToolExecutionResult;
  /** Version of the tool-authorization policy that evaluated this call. */
  policyVersion: string;
  /** Type of entity the tool acted on, if any (e.g. "task"). Never free text. */
  targetEntityType?: string | null;
  /** Id of the entity the tool acted on, if any. Never a name, email, or body. */
  targetEntityId?: string | null;
}

export type AgentToolCallAuditRow = {
  id: string;
  entity_type: "agent_tool_call";
  entity_id: string;
  operation: string;
  actor_id: string | null;
  organization_id: null;
  project_id: null;
  delete_batch_id: null;
  occurred_at: string;
  snapshot: Record<string, unknown>;
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
// Long opaque tokens (JWTs, API keys, bearer tokens) — anything that looks
// like base64/hex of 20+ chars, which a hash or uuid never produces raw.
const SECRET_LIKE_RE = /\b[A-Za-z0-9_-]{32,}\b/;

/**
 * Recursively scans a value for anything that looks like an email address or
 * a long opaque secret and throws if found. Called on the snapshot before
 * every insert so a caller mistake (passing a raw email or token) fails
 * loudly instead of landing in the audit log.
 */
export function assertNoPii(value: unknown, path = "snapshot"): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (EMAIL_RE.test(value)) {
      throw new Error(`assertNoPii: email-like string at ${path}`);
    }
    if (SECRET_LIKE_RE.test(value) && !isKnownSafeId(value)) {
      throw new Error(`assertNoPii: secret-like string at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPii(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoPii(v, `${path}.${k}`);
    }
  }
}

/**
 * UUIDs and sha256 hex hashes are exactly the kind of "hash or id" this log
 * is supposed to store, and both happen to be 32+ opaque chars — allow them
 * through the secret-like check instead of forcing every id to be shortened.
 */
function isKnownSafeId(value: string): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hex32to64 = /^[0-9a-f]{32,64}$/i;
  return uuid.test(value) || hex32to64.test(value);
}

/** sha256 hex digest, for callers who need to reference user content (e.g. a task name) without storing it. */
export function hashForAudit(value: string): string {
  // Lazy require to keep this module import-cheap in edge/browser bundles that
  // never call it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(value).digest("hex");
}

/** Pure builder: normalizes audit input into the entity_events row shape. Throws if the snapshot contains PII. */
export function buildAgentToolCallAuditRow(
  input: AgentToolCallAuditInput,
): AgentToolCallAuditRow {
  const snapshot = {
    toolName: input.toolName,
    classification: input.classification,
    riskScore: input.riskScore,
    authorizationOutcome: input.authorizationOutcome,
    approvalId: input.approvalId ?? null,
    executionResult: input.executionResult,
    policyVersion: input.policyVersion,
    agentName: input.agentName ?? null,
    agentModel: input.agentModel ?? null,
    targetEntityType: input.targetEntityType ?? null,
    targetEntityId: input.targetEntityId ?? null,
  };

  assertNoPii(snapshot);

  return {
    id: randomUUID(),
    entity_type: "agent_tool_call",
    entity_id: input.targetEntityId ?? randomUUID(),
    operation: `agent_tool_call:${input.toolName}`,
    actor_id: input.userId ?? null,
    organization_id: null,
    project_id: null,
    delete_batch_id: null,
    occurred_at: new Date().toISOString(),
    snapshot,
  };
}

/**
 * Best-effort insert of an agent tool-call decision record. Never throws for
 * DB errors (mirrors lib/audit/log.ts's writeAuditLog contract so a logging
 * failure can never break the primary tool action) — but a PII violation from
 * buildAgentToolCallAuditRow is NOT swallowed, since that indicates a caller
 * bug that must be fixed, not a transient failure.
 *
 * Adopt at the tool executor's call site (lib/ai-agent/tools.ts), immediately
 * after each tool's executor resolves, wrapping every dispatch in AGENT_TOOLS.
 */
export async function recordAgentToolCallAudit(
  admin: SupabaseClient,
  input: AgentToolCallAuditInput,
): Promise<void> {
  const row = buildAgentToolCallAuditRow(input);
  try {
    const { error } = await admin.from("entity_events").insert(row);
    if (error) {
      console.error("recordAgentToolCallAudit insert failed:", error.message || error);
    }
  } catch (err) {
    console.error("recordAgentToolCallAudit threw (suppressed):", err);
  }
}
