import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.AGENT_APPROVAL_SECRET = "unit-test-approval-secret";

import {
  DEFAULT_APPROVAL_TTL_MS,
  classifySendRisk,
  executeApprovedSend,
  hashSendParams,
  mintSendApproval,
  normalizeRecipients,
  resetApprovalLedger,
  selectApprovalForAction,
  validateSendApproval,
  type SendAction,
  type SendApproval,
} from "../ai-agent/approval";
import { executeTool, type AgentToolContext } from "../ai-agent/tools";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const DRAFT = "22222222-2222-2222-2222-222222222222";
const MAILBOX = "33333333-3333-3333-3333-333333333333";
const THREAD = "44444444-4444-4444-4444-444444444444";

function action(overrides: Partial<SendAction> = {}): SendAction {
  return {
    actorUserId: ACTOR,
    tool: "send_reply",
    draftId: DRAFT,
    mailboxId: MAILBOX,
    threadId: THREAD,
    recipients: ["client@example.com"],
    subject: "Re: Invoice 4821",
    body: "<p>Paid this morning — receipt attached.</p>",
    bodyText: "Paid this morning — receipt attached.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake Supabase client: entity_events (audit) + draft tables.
// ---------------------------------------------------------------------------

type FakeAdminOptions = {
  insertFails?: boolean;
  queryFails?: boolean;
  replyDrafts?: any[];
};

function makeFakeAdmin(options: FakeAdminOptions = {}) {
  const auditRows: any[] = [];
  const drafts = options.replyDrafts || [];

  const thenable = (produce: () => any) => {
    const builder: any = {
      filters: {} as Record<string, unknown>,
      eq(column: string, value: unknown) {
        builder.filters[column] = value;
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => produce.call(builder),
      then: (resolve: any, reject: any) =>
        Promise.resolve(produce.call(builder)).then(resolve, reject),
    };
    return builder;
  };

  const admin: any = {
    auditRows,
    from(table: string) {
      if (table === "entity_events") {
        return {
          insert: async (row: any) => {
            if (options.insertFails) return { error: { message: "insert denied" } };
            auditRows.push(row);
            return { error: null };
          },
          select: () =>
            thenable(function (this: any) {
              if (options.queryFails) return { data: null, error: { message: "unreadable" } };
              const wantedApproval = this.filters["snapshot->>approvalId"];
              const matched = auditRows.filter(
                (row) =>
                  row.entity_type === "agent_tool_call" &&
                  (wantedApproval === undefined || row.snapshot?.approvalId === wantedApproval),
              );
              return { data: matched.map((row) => ({ id: row.id })), error: null };
            }),
        };
      }
      if (table === "email_reply_drafts" || table === "email_outbound_drafts") {
        return {
          select: () =>
            thenable(function (this: any) {
              const row =
                drafts.find(
                  (candidate) =>
                    candidate.id === this.filters.id &&
                    candidate.created_by_user_id === this.filters.created_by_user_id,
                ) || null;
              return { data: row, error: null };
            }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return admin;
}

function makeSend(overrides: Partial<Parameters<typeof executeApprovedSend>[0]> = {}) {
  const calls: number[] = [];
  const admin = overrides.admin || makeFakeAdmin();
  const params = {
    admin,
    action: action(),
    approval: null as unknown,
    loadTarget: async () => ({
      status: "draft",
      paramsHash: hashSendParams(action()),
      sentAt: null,
      entityType: "email_reply_draft",
    }),
    transmit: async () => {
      calls.push(Date.now());
      return { id: DRAFT, status: "sent" };
    },
    ...overrides,
  };
  return { params, admin, transmitCount: () => calls.length };
}

beforeEach(() => {
  resetApprovalLedger();
});

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

test("recipient normalization ignores case, order and duplicates", () => {
  assert.deepEqual(
    normalizeRecipients(["B@Example.com", "a@example.com", " b@example.com "]),
    ["a@example.com", "b@example.com"],
  );
  assert.deepEqual(normalizeRecipients([{ email: "A@Example.com" }]), ["a@example.com"]);
});

test("params hash changes for any change to what leaves the system", () => {
  const base = hashSendParams(action());
  assert.equal(base, hashSendParams(action({ recipients: ["CLIENT@example.com"] })));
  assert.notEqual(base, hashSendParams(action({ recipients: ["attacker@example.com"] })));
  assert.notEqual(
    base,
    hashSendParams(action({ recipients: ["client@example.com", "cc@example.com"] })),
  );
  assert.notEqual(base, hashSendParams(action({ subject: "Re: Invoice 4822" })));
  assert.notEqual(base, hashSendParams(action({ body: "<p>Wire $40,000 to …</p>" })));
  assert.notEqual(base, hashSendParams(action({ draftId: "other" })));
  assert.notEqual(base, hashSendParams(action({ tool: "send_message" })));
});

test("classifySendRisk marks sends high-impact and refuses unclassifiable actions", () => {
  const risk = classifySendRisk(action());
  assert.equal(risk.classification, "write_high_risk");
  assert.ok(risk.riskScore >= 0.8);
  assert.throws(() => classifySendRisk(action({ recipients: [] })));
  assert.throws(() => classifySendRisk(action({ body: "", bodyText: "" })));
  assert.throws(() => classifySendRisk(action({ mailboxId: "" })));
});

// ---------------------------------------------------------------------------
// Approval validation
// ---------------------------------------------------------------------------

test("a minted approval validates for the action it was minted for", () => {
  const a = action();
  const approval = mintSendApproval(a, { approvedByUserId: ACTOR });
  const result = validateSendApproval(approval, a);
  assert.equal(result.valid, true);
  assert.equal(approval.signature.length, 64);
  assert.equal(Date.parse(approval.expiresAt) - Date.parse(approval.issuedAt), DEFAULT_APPROVAL_TTL_MS);
});

test("an approval does not authorize a different message, recipient, actor or tool", () => {
  const approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  assert.equal(
    (validateSendApproval(approval, action({ recipients: ["attacker@example.com"] })) as any).reason,
    "params_mismatch",
  );
  assert.equal(
    (validateSendApproval(approval, action({ body: "<p>Wire the money.</p>" })) as any).reason,
    "params_mismatch",
  );
  assert.equal(
    (validateSendApproval(approval, action({ subject: "Re: something else" })) as any).reason,
    "params_mismatch",
  );
  assert.equal(
    (validateSendApproval(approval, action({ actorUserId: "someone-else" })) as any).reason,
    "actor_mismatch",
  );
  assert.equal(
    (validateSendApproval(approval, action({ draftId: "other-draft" })) as any).reason,
    "target_mismatch",
  );
  assert.equal(
    (validateSendApproval(approval, action({ tool: "send_message" })) as any).reason,
    "tool_mismatch",
  );
  assert.equal((validateSendApproval(null, action()) as any).reason, "missing");
  assert.equal((validateSendApproval({ version: 1 }, action()) as any).reason, "malformed");
});

test("an approval expires", () => {
  const now = Date.now();
  const approval = mintSendApproval(action(), { approvedByUserId: ACTOR, now, ttlMs: 60_000 });
  assert.equal(validateSendApproval(approval, action(), { now: now + 59_000 }).valid, true);
  const late = validateSendApproval(approval, action(), { now: now + 60_001 });
  assert.equal(late.valid, false);
  assert.equal((late as any).reason, "expired");
});

test("tampered approval fields fail the signature check", () => {
  const approval = mintSendApproval(action(), { approvedByUserId: ACTOR });
  const stretched: SendApproval = {
    ...approval,
    expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
  };
  assert.equal((validateSendApproval(stretched, action()) as any).reason, "bad_signature");

  const forged: SendApproval = { ...approval, signature: "f".repeat(64) };
  assert.equal((validateSendApproval(forged, action()) as any).reason, "bad_signature");
});

test("selectApprovalForAction only returns an approval for the same actor/tool/target", () => {
  const approval = mintSendApproval(action(), { approvedByUserId: ACTOR });
  assert.equal(selectApprovalForAction([approval], action()), approval);
  assert.equal(selectApprovalForAction([approval], action({ draftId: "other" })), null);
  assert.equal(selectApprovalForAction([approval], action({ tool: "send_message" })), null);
  assert.equal(selectApprovalForAction(undefined, action()), null);
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

test("no approval: nothing is transmitted", async () => {
  const { params, transmitCount } = makeSend();
  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "missing");
  assert.equal(transmitCount(), 0);
});

test("approved send transmits once and writes the decision audit", async () => {
  const { params, admin, transmitCount } = makeSend();
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, true);
  assert.equal((result as any).sent, true);
  assert.equal(transmitCount(), 1);

  const rows = admin.auditRows;
  assert.equal(rows.length, 2, "write-ahead decision + outcome");
  assert.equal(rows[0].snapshot.authorizationOutcome, "allowed");
  assert.equal(rows[0].snapshot.classification, "write_high_risk");
  assert.equal(rows[0].snapshot.toolName, "send_reply");
  assert.equal(rows[1].snapshot.executionResult, "success");
  assert.equal(rows[1].snapshot.approvalId, (result as any).approvalId);
});

test("replaying the same approval never sends twice (idempotent retry)", async () => {
  const { params, transmitCount } = makeSend();
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const first = await executeApprovedSend(params);
  const second = await executeApprovedSend(params);

  assert.equal((first as any).idempotent, false);
  assert.equal(second.ok, true);
  assert.equal((second as any).idempotent, true);
  assert.equal((second as any).approvalId, (first as any).approvalId);
  assert.equal(transmitCount(), 1, "the retry must not re-transmit");
});

test("a consumed approval is rejected in another process (durable audit check)", async () => {
  const { params, transmitCount } = makeSend();
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });
  await executeApprovedSend(params);

  // Another instance: no in-process ledger, but the decision log remembers.
  resetApprovalLedger();
  const replay = await executeApprovedSend(params);
  assert.equal(replay.ok, false);
  assert.equal((replay as any).reason, "approval_already_used");
  assert.equal(transmitCount(), 1);
});

test("an expired approval is refused at execution", async () => {
  const now = Date.now();
  const { params, transmitCount } = makeSend({ now: now + 10 * 60_000 });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR, now, ttlMs: 60_000 });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "expired");
  assert.equal(transmitCount(), 0);
});

test("editing the draft after approval refuses the send", async () => {
  const { params, transmitCount } = makeSend({
    loadTarget: async () => ({
      status: "draft",
      // The persisted draft now says something else than what was approved.
      paramsHash: hashSendParams(action({ body: "<p>Wire $40,000.</p>" })),
      sentAt: null,
      entityType: "email_reply_draft",
    }),
  });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "target_changed");
  assert.equal(transmitCount(), 0);
});

test("an already-sent draft is never re-transmitted", async () => {
  const { params, transmitCount } = makeSend({
    loadTarget: async () => ({
      status: "sent",
      paramsHash: hashSendParams(action()),
      sentAt: "2026-09-21T10:00:00.000Z",
      entityType: "email_reply_draft",
    }),
  });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, true);
  assert.equal((result as any).sent, false);
  assert.equal((result as any).idempotent, true);
  assert.equal(transmitCount(), 0);
});

test("fail closed: a failed audit write refuses the send", async () => {
  const { params, transmitCount } = makeSend({ admin: makeFakeAdmin({ insertFails: true }) });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "audit_write_failed");
  assert.equal(transmitCount(), 0);
});

test("fail closed: an unreadable audit log refuses the send", async () => {
  const { params, transmitCount } = makeSend({ admin: makeFakeAdmin({ queryFails: true }) });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "audit_write_failed");
  assert.equal(transmitCount(), 0);
});

test("fail closed: an unclassifiable action refuses before any approval check", async () => {
  const { params, transmitCount } = makeSend({ action: action({ recipients: [] }) });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const result = await executeApprovedSend(params);
  assert.equal(result.ok, false);
  assert.equal((result as any).reason, "risk_classification_failed");
  assert.equal(transmitCount(), 0);
});

test("a transmit failure consumes the approval instead of auto-retrying", async () => {
  let attempts = 0;
  const { params } = makeSend({
    transmit: async () => {
      attempts += 1;
      throw new Error("SMTP refused");
    },
  });
  params.approval = mintSendApproval(action(), { approvedByUserId: ACTOR });

  const first = await executeApprovedSend(params);
  assert.equal(first.ok, false);
  assert.equal((first as any).reason, "send_failed");

  const retry = await executeApprovedSend(params);
  assert.equal(retry.ok, false);
  assert.equal((retry as any).reason, "approval_already_used");
  assert.equal(attempts, 1);
});

// ---------------------------------------------------------------------------
// Tool layer
// ---------------------------------------------------------------------------

function makeToolCtx(admin: any): AgentToolContext {
  return {
    admin,
    userId: ACTOR,
    accessibleProjectIds: new Set<string>(),
    agentName: "Bartok",
    agentModel: "test-model",
  };
}

const REPLY_DRAFT_ROW = {
  id: DRAFT,
  created_by_user_id: ACTOR,
  mailbox_id: MAILBOX,
  thread_id: THREAD,
  status: "draft",
  subject: "Re: Invoice 4821",
  content_text: "Paid this morning — receipt attached.",
  content_html: "<p>Paid this morning — receipt attached.</p>",
  to_json: [{ email: "client@example.com" }],
  cc_json: [],
  sent_at: null,
};

test("send_reply without an approval returns an approval request and sends nothing", async () => {
  const admin = makeFakeAdmin({ replyDrafts: [REPLY_DRAFT_ROW] });
  const result = await executeTool(makeToolCtx(admin), "send_reply", { draftId: DRAFT });

  assert.equal(result.ok, true);
  const data = result.data as any;
  assert.equal(data.needsApproval, true);
  assert.equal(data.sent, false);
  assert.deepEqual(data.recipients, ["client@example.com"]);
  assert.equal(typeof data.paramsHash, "string");
  // The model gets a request, never anything it can replay as an approval.
  assert.equal(JSON.stringify(data).includes("signature"), false);
});

test("send_reply with a host-minted approval for a different draft still sends nothing", async () => {
  const admin = makeFakeAdmin({ replyDrafts: [REPLY_DRAFT_ROW] });
  const ctx = makeToolCtx(admin);
  ctx.sendApprovals = [
    mintSendApproval(action({ draftId: "99999999-9999-9999-9999-999999999999" }), {
      approvedByUserId: ACTOR,
    }),
  ];

  const result = await executeTool(ctx, "send_reply", { draftId: DRAFT });
  assert.equal(result.ok, true);
  assert.equal((result.data as any).needsApproval, true);
});

test("send_reply on a draft that is not the user's is refused", async () => {
  const admin = makeFakeAdmin({
    replyDrafts: [{ ...REPLY_DRAFT_ROW, created_by_user_id: "someone-else" }],
  });
  const result = await executeTool(makeToolCtx(admin), "send_reply", { draftId: DRAFT });
  assert.equal(result.ok, false);
  assert.match(result.error || "", /not found/i);
});
