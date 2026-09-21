/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertNoPii,
  buildAgentToolCallAuditRow,
  hashForAudit,
} from "../ai-agent/audit";

const BASE_INPUT = {
  userId: "user-1",
  agentName: "Focus Forge Assistant",
  agentModel: "claude-sonnet-5",
  toolName: "create_task",
  classification: "write_low_risk" as const,
  riskScore: 0.2,
  authorizationOutcome: "allowed" as const,
  approvalId: null,
  executionResult: "success" as const,
  policyVersion: "v1",
  targetEntityType: "task",
  targetEntityId: "11111111-1111-1111-1111-111111111111",
};

test("buildAgentToolCallAuditRow: captures full OWASP §6 metadata shape", () => {
  const row = buildAgentToolCallAuditRow(BASE_INPUT);

  assert.equal(row.entity_type, "agent_tool_call");
  assert.equal(row.entity_id, BASE_INPUT.targetEntityId);
  assert.equal(row.operation, "agent_tool_call:create_task");
  assert.equal(row.actor_id, "user-1");
  assert.equal(row.organization_id, null);
  assert.equal(row.project_id, null);
  assert.ok(typeof row.id === "string" && row.id.length > 0);
  assert.ok(typeof row.occurred_at === "string" && !Number.isNaN(Date.parse(row.occurred_at)));

  assert.deepEqual(row.snapshot, {
    toolName: "create_task",
    classification: "write_low_risk",
    riskScore: 0.2,
    authorizationOutcome: "allowed",
    approvalId: null,
    executionResult: "success",
    policyVersion: "v1",
    agentName: "Focus Forge Assistant",
    agentModel: "claude-sonnet-5",
    targetEntityType: "task",
    targetEntityId: BASE_INPUT.targetEntityId,
  });
});

test("buildAgentToolCallAuditRow: generates an entity_id when no target entity exists", () => {
  const row = buildAgentToolCallAuditRow({
    ...BASE_INPUT,
    toolName: "list_tasks",
    targetEntityType: null,
    targetEntityId: null,
  });
  assert.ok(row.entity_id.length > 0);
  assert.notEqual(row.entity_id, BASE_INPUT.targetEntityId);
});

test("buildAgentToolCallAuditRow: destructive call with an approval id round-trips", () => {
  const row = buildAgentToolCallAuditRow({
    ...BASE_INPUT,
    toolName: "delete_project",
    classification: "destructive",
    riskScore: 0.95,
    authorizationOutcome: "needs_confirmation",
    approvalId: "deadbeef".repeat(4),
    executionResult: "failure",
  });
  assert.equal(row.snapshot.authorizationOutcome, "needs_confirmation");
  assert.equal(row.snapshot.approvalId, "deadbeef".repeat(4));
  assert.equal(row.snapshot.executionResult, "failure");
});

test("assertNoPii: allows uuids and sha256 hashes", () => {
  assert.doesNotThrow(() =>
    assertNoPii({
      targetEntityId: "11111111-1111-1111-1111-111111111111",
      contentHash: hashForAudit("some task description"),
    }),
  );
});

test("assertNoPii / buildAgentToolCallAuditRow: rejects an email address anywhere in the snapshot", () => {
  assert.throws(() => assertNoPii({ note: "sent to spencer@example.com" }));
  assert.throws(() =>
    buildAgentToolCallAuditRow({
      ...BASE_INPUT,
      approvalId: "confirmed by spencer@example.com",
    }),
  );
});

test("assertNoPii: rejects long opaque tokens (credentials) that are not a uuid/hash", () => {
  assert.throws(() => assertNoPii({ token: "sk_live_" + "a".repeat(40) }));
});

test("hashForAudit: deterministic and never returns the raw input", () => {
  const h1 = hashForAudit("Reply to invoice #4821 with card 4111111111111111");
  const h2 = hashForAudit("Reply to invoice #4821 with card 4111111111111111");
  assert.equal(h1, h2);
  assert.notEqual(h1, "Reply to invoice #4821 with card 4111111111111111");
  assert.equal(h1.length, 64);
});
