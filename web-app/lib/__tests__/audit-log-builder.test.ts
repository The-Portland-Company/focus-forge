/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditLogRow } from "../audit/log";

test("buildAuditLogRow: maps fields to row shape", () => {
  const row = buildAuditLogRow({
    organizationId: "org-1",
    actorUserId: "user-1",
    action: "task.delete",
    entityType: "task",
    entityId: "task-9",
    metadata: { name: "Ship it" },
  });
  assert.deepEqual(row, {
    organization_id: "org-1",
    actor_user_id: "user-1",
    action: "task.delete",
    entity_type: "task",
    entity_id: "task-9",
    metadata: { name: "Ship it" },
  });
});

test("buildAuditLogRow: null actor and missing entityId become null", () => {
  const row = buildAuditLogRow({
    organizationId: "org-1",
    actorUserId: null,
    action: "member.remove",
    entityType: "member",
  });
  assert.equal(row.actor_user_id, null);
  assert.equal(row.entity_id, null);
});

test("buildAuditLogRow: coerces non-string entityId to string", () => {
  const row = buildAuditLogRow({
    organizationId: "org-1",
    actorUserId: "u",
    action: "project.delete",
    entityType: "project",
    entityId: 12345 as unknown as string,
  });
  assert.equal(row.entity_id, "12345");
});

test("buildAuditLogRow: empty metadata object becomes null", () => {
  const row = buildAuditLogRow({
    organizationId: "org-1",
    actorUserId: "u",
    action: "thread.delete",
    entityType: "thread",
    entityId: "t-1",
    metadata: {},
  });
  assert.equal(row.metadata, null);
});
