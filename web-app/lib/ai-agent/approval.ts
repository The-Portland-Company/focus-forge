import { createHash, randomUUID, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveGateToken } from "@/lib/ai-agent/confirm-gate";
import {
  recordAgentToolCallAudit,
  type AgentToolCallAuditInput,
} from "@/lib/ai-agent/audit";

/**
 * Approval gate for high-impact agent actions that leave the system —
 * today: sending email (OWASP AI Agent Security Cheat Sheet, "High-Impact
 * Action Integrity Controls" + §4 Human-in-the-Loop).
 *
 * The model may DECIDE to send; it can never EXECUTE one. Execution requires
 * an approval artifact that:
 *
 *  - is minted server-side only (`mintSendApproval`), from the action a human
 *    was shown. It is never returned to the model: the tool's
 *    "needs approval" result carries the action preview and its params hash,
 *    not a usable token. The host hands minted approvals to the tool layer
 *    out-of-band on `AgentToolContext.sendApprovals`.
 *  - is BOUND to the exact action: actor, tool name, draft id, mailbox,
 *    thread, normalized recipient list, subject and body all feed the params
 *    hash, and the params hash feeds the signature. A token for one message
 *    cannot authorize another message, another recipient, or another actor.
 *  - EXPIRES (default 5 minutes) and carries a one-time nonce.
 *  - is CONSUMED on use. A second presentation never re-transmits: it returns
 *    the recorded outcome (idempotent retry) instead.
 *
 * Nothing here is derivable by the model: the signature mixes a server-side
 * secret (`AGENT_APPROVAL_SECRET`, falling back to the service-role key) with
 * the same derivation the destructive confirm gate uses.
 *
 * Fail closed. Risk classification, approval validation, target re-binding,
 * and the write-ahead audit record must ALL succeed before anything is
 * transmitted; any failure refuses the send.
 */

export const SEND_POLICY_VERSION = "ai-agent-send-approval-v1";

const APPROVAL_SALT = "focus-forge:ai-agent:high-impact-send-approval:v1";

/** Approvals are short-lived on purpose: a stale "yes" is not a yes. */
export const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;

export const HIGH_IMPACT_SEND_TOOLS = ["send_reply", "send_message"] as const;
export type HighImpactSendTool = (typeof HIGH_IMPACT_SEND_TOOLS)[number];

/** The exact action a human is asked to approve, and that an approval binds to. */
export type SendAction = {
  /** User the send is performed as. */
  actorUserId: string;
  tool: HighImpactSendTool;
  /** Persisted draft the send transmits (reply draft or outbound draft). */
  draftId: string;
  mailboxId: string;
  threadId?: string | null;
  /** Every envelope recipient (to + cc + bcc), raw addresses. */
  recipients: string[];
  subject: string;
  /** Body exactly as it will be transmitted (html when present, else text). */
  body: string;
  /** Plain-text alternative, when the draft stores one separately. */
  bodyText?: string | null;
};

export type SendApproval = {
  version: 1;
  actorUserId: string;
  /** Human who approved. Recorded for provenance; the send runs as actorUserId. */
  approvedByUserId: string;
  tool: HighImpactSendTool;
  draftId: string;
  paramsHash: string;
  /** Stable per (actor, tool, draft, params) — a retry of the same action reuses it. */
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  /** sha256 over every field above + a server secret. Doubles as the approval id. */
  signature: string;
};

export type ApprovalRefusalReason =
  | "missing"
  | "malformed"
  | "actor_mismatch"
  | "tool_mismatch"
  | "target_mismatch"
  | "params_mismatch"
  | "expired"
  | "not_yet_valid"
  | "bad_signature";

export type SendRefusalReason =
  | ApprovalRefusalReason
  | "risk_classification_failed"
  | "target_missing"
  | "target_changed"
  | "target_not_sendable"
  | "send_in_flight"
  | "approval_already_used"
  | "audit_write_failed"
  | "send_failed";

// ---------------------------------------------------------------------------
// Binding: normalization + params hash
// ---------------------------------------------------------------------------

/** Lowercased, trimmed, de-duplicated, sorted — so recipient order never changes the hash. */
export function normalizeRecipients(recipients: unknown): string[] {
  const list = Array.isArray(recipients) ? recipients : [];
  const seen = new Set<string>();
  for (const entry of list) {
    const raw =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && typeof (entry as any).email === "string"
          ? (entry as any).email
          : "";
    const address = raw.trim().toLowerCase();
    if (address) seen.add(address);
  }
  return Array.from(seen).sort();
}

/**
 * sha256 over every parameter that determines what actually leaves the system.
 * Any change — one extra recipient, one edited word — produces a different
 * hash, which invalidates every approval minted for the old action.
 */
export function hashSendParams(action: SendAction): string {
  return createHash("sha256")
    .update(
      [
        "v1",
        action.tool,
        action.actorUserId,
        action.draftId,
        action.mailboxId,
        action.threadId || "",
        normalizeRecipients(action.recipients).join(","),
        (action.subject || "").trim(),
        action.body || "",
        action.bodyText || "",
      ].join("\u0000"),
    )
    .digest("hex");
}

/** Stable across retries of the same action, so a retried send cannot double-send. */
export function deriveIdempotencyKey(action: SendAction, paramsHash: string): string {
  return deriveGateToken(
    `${APPROVAL_SALT}:idempotency`,
    [action.actorUserId, action.tool, action.draftId, paramsHash],
    { length: 32 },
  );
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export type SendRiskAssessment = {
  classification: "write_high_risk";
  /** 0-1, as recorded in the decision audit log. */
  riskScore: number;
  recipientCount: number;
};

export class SendRefusedError extends Error {
  readonly reason: SendRefusalReason;
  constructor(reason: SendRefusalReason, message?: string) {
    super(message || reason);
    this.name = "SendRefusedError";
    this.reason = reason;
  }
}

/**
 * Sending mail is always high-impact: it is irreversible and leaves the
 * system. Throws on an action that cannot be classified (no actor, no target,
 * no recipients, empty body) so the caller refuses rather than sends blind.
 */
export function classifySendRisk(action: SendAction): SendRiskAssessment {
  if (!action || typeof action !== "object") {
    throw new SendRefusedError("risk_classification_failed", "No action to classify.");
  }
  if (!action.actorUserId || !action.draftId || !action.mailboxId) {
    throw new SendRefusedError(
      "risk_classification_failed",
      "Action is missing actor, draft, or mailbox.",
    );
  }
  if (!HIGH_IMPACT_SEND_TOOLS.includes(action.tool)) {
    throw new SendRefusedError("risk_classification_failed", "Unknown send tool.");
  }
  const recipients = normalizeRecipients(action.recipients);
  if (recipients.length === 0) {
    throw new SendRefusedError("risk_classification_failed", "No recipients.");
  }
  if (!(action.body || action.bodyText || "").trim()) {
    throw new SendRefusedError("risk_classification_failed", "Empty message body.");
  }
  // Base risk for "mail leaves the building", rising with blast radius.
  const riskScore = Math.min(0.99, 0.8 + 0.02 * (recipients.length - 1));
  return { classification: "write_high_risk", riskScore, recipientCount: recipients.length };
}

// ---------------------------------------------------------------------------
// Mint / validate
// ---------------------------------------------------------------------------

function approvalSecret(): string {
  // Server-only. Absent in unit tests, where the salt alone still binds every
  // field; in production the service-role key is always present.
  return process.env.AGENT_APPROVAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function signApproval(fields: Omit<SendApproval, "signature">): string {
  return deriveGateToken(
    `${APPROVAL_SALT}:${approvalSecret()}`,
    [
      String(fields.version),
      fields.actorUserId,
      fields.approvedByUserId,
      fields.tool,
      fields.draftId,
      fields.paramsHash,
      fields.idempotencyKey,
      fields.issuedAt,
      fields.expiresAt,
      fields.nonce,
    ],
    { length: 64 },
  );
}

/** The approval's id, as recorded in the decision audit log. */
export function approvalId(approval: SendApproval): string {
  return approval.signature;
}

/**
 * Mint an approval for one exact action. SERVER-SIDE ONLY: call this from the
 * host route that receives a human's explicit approval of the previewed send,
 * never from anything the model controls. The result is handed to the tool
 * layer on `AgentToolContext.sendApprovals`.
 */
export function mintSendApproval(
  action: SendAction,
  options: {
    approvedByUserId: string;
    ttlMs?: number;
    now?: number;
    nonce?: string;
  },
): SendApproval {
  classifySendRisk(action);
  if (!options?.approvedByUserId) {
    throw new SendRefusedError("malformed", "An approval needs the approving user.");
  }
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
  const paramsHash = hashSendParams(action);
  const fields: Omit<SendApproval, "signature"> = {
    version: 1,
    actorUserId: action.actorUserId,
    approvedByUserId: options.approvedByUserId,
    tool: action.tool,
    draftId: action.draftId,
    paramsHash,
    idempotencyKey: deriveIdempotencyKey(action, paramsHash),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    nonce: options.nonce || randomUUID(),
  };
  return { ...fields, signature: signApproval(fields) };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type ApprovalValidation =
  | { valid: true; approval: SendApproval; paramsHash: string }
  | { valid: false; reason: ApprovalRefusalReason };

/**
 * Validate an approval against the action it is being used for. Every binding
 * is checked before the signature, so a mismatch is reported precisely; the
 * signature check is last and constant-time.
 */
export function validateSendApproval(
  candidate: unknown,
  action: SendAction,
  options: { now?: number } = {},
): ApprovalValidation {
  if (candidate == null) return { valid: false, reason: "missing" };
  const approval = candidate as SendApproval;
  if (
    typeof approval !== "object" ||
    approval.version !== 1 ||
    typeof approval.actorUserId !== "string" ||
    typeof approval.approvedByUserId !== "string" ||
    typeof approval.tool !== "string" ||
    typeof approval.draftId !== "string" ||
    typeof approval.paramsHash !== "string" ||
    typeof approval.idempotencyKey !== "string" ||
    typeof approval.issuedAt !== "string" ||
    typeof approval.expiresAt !== "string" ||
    typeof approval.nonce !== "string" ||
    typeof approval.signature !== "string"
  ) {
    return { valid: false, reason: "malformed" };
  }

  if (approval.actorUserId !== action.actorUserId) {
    return { valid: false, reason: "actor_mismatch" };
  }
  if (approval.tool !== action.tool) return { valid: false, reason: "tool_mismatch" };
  if (approval.draftId !== action.draftId) {
    return { valid: false, reason: "target_mismatch" };
  }

  const paramsHash = hashSendParams(action);
  if (approval.paramsHash !== paramsHash) {
    return { valid: false, reason: "params_mismatch" };
  }
  if (approval.idempotencyKey !== deriveIdempotencyKey(action, paramsHash)) {
    return { valid: false, reason: "malformed" };
  }

  const now = options.now ?? Date.now();
  const issuedAt = Date.parse(approval.issuedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { valid: false, reason: "malformed" };
  }
  if (now >= expiresAt) return { valid: false, reason: "expired" };
  // Small clock-skew allowance; a far-future issuedAt means a forged artifact.
  if (now + 60_000 < issuedAt) return { valid: false, reason: "not_yet_valid" };

  const { signature, ...fields } = approval;
  if (!constantTimeEquals(signature, signApproval(fields))) {
    return { valid: false, reason: "bad_signature" };
  }

  return { valid: true, approval, paramsHash };
}

/** Pick the approval (if any) the host supplied for this exact action. */
export function selectApprovalForAction(
  approvals: readonly SendApproval[] | undefined | null,
  action: SendAction,
): SendApproval | null {
  if (!Array.isArray(approvals)) return null;
  return (
    approvals.find(
      (a) =>
        a &&
        a.tool === action.tool &&
        a.draftId === action.draftId &&
        a.actorUserId === action.actorUserId,
    ) || null
  );
}

// ---------------------------------------------------------------------------
// Replay ledger (in-process) — see executeApprovedSend for the durable checks
// ---------------------------------------------------------------------------

type LedgerEntry = {
  idempotencyKey: string;
  state: "in_flight" | "completed";
  outcome?: ApprovedSendSuccess;
  at: number;
};

const approvalLedger = new Map<string, LedgerEntry>();

/** Test/process hygiene: forget consumed approvals. */
export function resetApprovalLedger(): void {
  approvalLedger.clear();
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Live state of the draft, re-read immediately before transmitting. */
export type SendTargetState = {
  status: string;
  /** Params hash recomputed from the PERSISTED draft — must equal the approved one. */
  paramsHash: string;
  sentAt?: string | null;
  entityType: string;
};

export type ApprovedSendSuccess = {
  ok: true;
  sent: boolean;
  /** true when this call returned a previous outcome instead of transmitting. */
  idempotent: boolean;
  approvalId: string;
  idempotencyKey: string;
  data?: unknown;
};

export type ApprovedSendRefusal = {
  ok: false;
  refused: true;
  reason: SendRefusalReason;
  error: string;
};

export type ApprovedSendResult = ApprovedSendSuccess | ApprovedSendRefusal;

export type ApprovedSendParams = {
  admin: SupabaseClient;
  action: SendAction;
  /** Host-minted approval; anything else (including nothing) refuses. */
  approval: unknown;
  /** Re-reads the persisted draft right before transmitting. */
  loadTarget: () => Promise<SendTargetState | null>;
  /** The real send (e.g. sendReplyDraftNow). Called at most once per approval. */
  transmit: () => Promise<unknown>;
  agentName?: string | null;
  agentModel?: string | null;
  now?: number;
};

const SENDABLE_STATUSES = new Set(["draft", "scheduled", "failed"]);

function refuse(reason: SendRefusalReason, error: string): ApprovedSendRefusal {
  return { ok: false, refused: true, reason, error };
}

/**
 * Write the decision record and verify it landed. `recordAgentToolCallAudit`
 * is best-effort by contract (it swallows DB errors), so the row is read back:
 * no audit record, no send.
 */
async function recordDecisionOrThrow(
  admin: SupabaseClient,
  input: AgentToolCallAuditInput,
): Promise<void> {
  await recordAgentToolCallAudit(admin, input);
  const present = await approvalAuditRows(admin, input.approvalId || "");
  if (present === null || present === 0) {
    throw new SendRefusedError(
      "audit_write_failed",
      "Refusing to send: the decision audit record could not be written.",
    );
  }
}

/**
 * Count of audit rows already carrying this approval id, or null when the
 * query itself failed (which is treated as fail-closed by both callers).
 */
async function approvalAuditRows(
  admin: SupabaseClient,
  approvalIdValue: string,
): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from("entity_events")
      .select("id")
      .eq("entity_type", "agent_tool_call")
      .eq("snapshot->>approvalId", approvalIdValue)
      .limit(1);
    if (error || !Array.isArray(data)) return null;
    return data.length;
  } catch {
    return null;
  }
}

/**
 * The single path through which the agent may transmit mail.
 *
 * Order matters and every step fails closed:
 *  1. classify risk (throws → refuse)
 *  2. validate the approval against the exact action (binding + expiry + signature)
 *  3. in-process ledger: a consumed approval returns its recorded outcome,
 *     never a second transmission; an in-flight one is refused
 *  4. durable prior-use check against the audit log (covers other processes)
 *  5. re-read the persisted draft: already sent → idempotent no-op; edited
 *     since approval → refuse; not sendable → refuse
 *  6. write-ahead decision audit, verified → only then transmit
 *  7. record the outcome (best effort) and consume the approval
 */
export async function executeApprovedSend(
  params: ApprovedSendParams,
): Promise<ApprovedSendResult> {
  const { admin, action, approval: candidate } = params;
  const now = params.now ?? Date.now();

  let risk: SendRiskAssessment;
  try {
    risk = classifySendRisk(action);
  } catch (error) {
    return refuse(
      "risk_classification_failed",
      error instanceof Error ? error.message : "Could not classify this send.",
    );
  }

  const validation = validateSendApproval(candidate, action, { now });
  if (!validation.valid) {
    // Denied decisions are audited too, but a denial can never be blocked by a
    // logging failure — that would turn a refusal into an exception.
    await recordAgentToolCallAudit(admin, {
      userId: action.actorUserId,
      agentName: params.agentName ?? null,
      agentModel: params.agentModel ?? null,
      toolName: action.tool,
      classification: risk.classification,
      riskScore: risk.riskScore,
      authorizationOutcome: validation.reason === "missing" ? "needs_confirmation" : "denied",
      approvalId: null,
      executionResult: "failure",
      policyVersion: SEND_POLICY_VERSION,
      targetEntityType: "email_draft",
      targetEntityId: action.draftId,
    });
    return refuse(
      validation.reason,
      validation.reason === "missing"
        ? "This send needs an approval from the user. Nothing was sent."
        : `Approval rejected (${validation.reason}). Nothing was sent.`,
    );
  }

  const approval = validation.approval;
  const id = approvalId(approval);

  const ledgerEntry = approvalLedger.get(id);
  if (ledgerEntry) {
    if (ledgerEntry.state === "in_flight") {
      return refuse("send_in_flight", "This send is already in flight. Nothing was re-sent.");
    }
    if (ledgerEntry.idempotencyKey === approval.idempotencyKey && ledgerEntry.outcome) {
      // Replay / retry of a consumed approval: return the prior outcome,
      // never a second transmission.
      return { ...ledgerEntry.outcome, idempotent: true };
    }
    return refuse("approval_already_used", "This approval was already used. Nothing was sent.");
  }

  let target: SendTargetState | null;
  try {
    target = await params.loadTarget();
  } catch (error) {
    return refuse(
      "target_missing",
      error instanceof Error ? error.message : "Could not load the draft to send.",
    );
  }
  if (!target) return refuse("target_missing", "Draft not found. Nothing was sent.");

  if (target.status === "sent") {
    // Durable idempotency: the message already went out (possibly from another
    // process or the UI). Never transmit twice.
    return {
      ok: true,
      sent: false,
      idempotent: true,
      approvalId: id,
      idempotencyKey: approval.idempotencyKey,
      data: { alreadySent: true, sentAt: target.sentAt ?? null, draftId: action.draftId },
    };
  }
  if (target.status === "sending") {
    return refuse("send_in_flight", "This draft is already being sent. Nothing was re-sent.");
  }
  if (!SENDABLE_STATUSES.has(target.status)) {
    return refuse("target_not_sendable", `Draft status "${target.status}" cannot be sent.`);
  }
  if (target.paramsHash !== approval.paramsHash) {
    return refuse(
      "target_changed",
      "The draft changed after it was approved. Nothing was sent — re-approve the new version.",
    );
  }

  // Durable replay check: this approval id already appears in the decision log,
  // so it was exercised elsewhere. Fail closed — a fresh approval is required.
  const priorRows = await approvalAuditRows(admin, id);
  if (priorRows === null) {
    return refuse(
      "audit_write_failed",
      "Refusing to send: the decision audit log is unreadable.",
    );
  }
  if (priorRows > 0) {
    return refuse(
      "approval_already_used",
      "This approval was already used. Nothing was sent.",
    );
  }

  approvalLedger.set(id, {
    idempotencyKey: approval.idempotencyKey,
    state: "in_flight",
    at: now,
  });

  const auditBase = {
    userId: action.actorUserId,
    agentName: params.agentName ?? null,
    agentModel: params.agentModel ?? null,
    toolName: action.tool,
    classification: risk.classification,
    riskScore: risk.riskScore,
    authorizationOutcome: "allowed" as const,
    approvalId: id,
    policyVersion: SEND_POLICY_VERSION,
    targetEntityType: target.entityType,
    targetEntityId: action.draftId,
  };

  try {
    // Write-ahead intent record, superseded by the outcome row written below
    // under the same approvalId.
    await recordDecisionOrThrow(admin, { ...auditBase, executionResult: "pending" });
  } catch (error) {
    approvalLedger.delete(id);
    return refuse(
      "audit_write_failed",
      error instanceof Error ? error.message : "Decision audit write failed.",
    );
  }

  let sendResult: unknown;
  try {
    sendResult = await params.transmit();
  } catch (error) {
    // The transport may or may not have delivered. Keep the approval consumed
    // so nothing auto-retries: a retry needs a fresh human approval.
    approvalLedger.set(id, {
      idempotencyKey: approval.idempotencyKey,
      state: "completed",
      at: now,
    });
    await recordAgentToolCallAudit(admin, { ...auditBase, executionResult: "error" });
    return refuse(
      "send_failed",
      error instanceof Error ? error.message : "The send failed.",
    );
  }

  const outcome: ApprovedSendSuccess = {
    ok: true,
    sent: true,
    idempotent: false,
    approvalId: id,
    idempotencyKey: approval.idempotencyKey,
    data: sendResult,
  };
  approvalLedger.set(id, {
    idempotencyKey: approval.idempotencyKey,
    state: "completed",
    outcome,
    at: now,
  });
  await recordAgentToolCallAudit(admin, { ...auditBase, executionResult: "success" });
  return outcome;
}
