/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { shouldCreateMemoryFromEvent } from "../ai-memory/write";
import type { AIMemoryEventInput } from "../ai-memory/types";

function makeEvent(event_type: AIMemoryEventInput["event_type"]): AIMemoryEventInput {
  return {
    user_id: "user-test",
    organization_id: null,
    source_type: "task",
    source_id: "task-001",
    event_type,
    before_json: null,
    after_json: { category: "Hygiene" },
    reason: "user_approved",
  };
}

// ── Events that SHOULD create a memory ──────────────────────────────────────

test("shouldCreateMemoryFromEvent: true for user_approved_task_category", () => {
  assert.equal(shouldCreateMemoryFromEvent(makeEvent("user_approved_task_category")), true);
});

test("shouldCreateMemoryFromEvent: true for user_corrected_task_category", () => {
  assert.equal(shouldCreateMemoryFromEvent(makeEvent("user_corrected_task_category")), true);
});

test("shouldCreateMemoryFromEvent: true for user_moved_task_project", () => {
  assert.equal(shouldCreateMemoryFromEvent(makeEvent("user_moved_task_project")), true);
});

test("shouldCreateMemoryFromEvent: true for user_changed_priority", () => {
  assert.equal(shouldCreateMemoryFromEvent(makeEvent("user_changed_priority")), true);
});

test("shouldCreateMemoryFromEvent: true for email_taskified", () => {
  const event = makeEvent("email_taskified");
  event.source_type = "email";
  assert.equal(shouldCreateMemoryFromEvent(event), true);
});

test("shouldCreateMemoryFromEvent: true for memory_created", () => {
  const event = makeEvent("memory_created");
  event.source_type = "manual";
  assert.equal(shouldCreateMemoryFromEvent(event), true);
});

// ── Events that should NOT create a memory ───────────────────────────────────

test("shouldCreateMemoryFromEvent: false for ai_suggested_task_category", () => {
  assert.equal(shouldCreateMemoryFromEvent(makeEvent("ai_suggested_task_category")), false);
});
