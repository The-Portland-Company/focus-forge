import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChatExample,
  buildTrainingJsonl,
  type TrainingExampleRow,
} from "../ai-estimator/training-export";
import { SYSTEM_PROMPT } from "../ai-estimator/server";

const ROW: TrainingExampleRow = {
  task_name: "Draft Q3 outreach email",
  task_description: "To the donor list",
  project_name: "Marketing",
  tags: ["email"],
  priority: 2,
  ai_confidence: "med",
  accepted_minutes: 40,
};

test("buildChatExample emits system+user+assistant with the estimator system prompt", () => {
  const ex = buildChatExample(ROW);
  assert.equal(ex.messages.length, 3);
  assert.equal(ex.messages[0].role, "system");
  assert.equal(ex.messages[0].content, SYSTEM_PROMPT);
  assert.equal(ex.messages[1].role, "user");
  // The user turn reuses the estimator's buildUserMessage format.
  assert.match(ex.messages[1].content, /Draft Q3 outreach email/);
  assert.match(ex.messages[1].content, /Project: Marketing/);
});

test("assistant completion is valid JSON carrying the approved minutes", () => {
  const ex = buildChatExample(ROW);
  const completion = JSON.parse(ex.messages[2].content);
  assert.equal(completion.minutes, 40);
  assert.equal(completion.confidence, "med");
  assert.equal(typeof completion.rationale, "string");
});

test("completion confidence defaults to high when none recorded", () => {
  const ex = buildChatExample({ ...ROW, ai_confidence: null });
  assert.equal(JSON.parse(ex.messages[2].content).confidence, "high");
});

test("buildTrainingJsonl yields one JSON object per line + trailing newline", () => {
  const jsonl = buildTrainingJsonl([ROW, { ...ROW, accepted_minutes: 90 }]);
  const lines = jsonl.trimEnd().split("\n");
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const obj = JSON.parse(line);
    assert.ok(Array.isArray(obj.messages));
  }
  assert.ok(jsonl.endsWith("\n"));
  assert.equal(buildTrainingJsonl([]), "");
});
