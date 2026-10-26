/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeThreadWithAI,
  buildHeuristicAnalysis,
  isCriticalAccountNotice,
} from "../email-inbox/ai";
import {
  canAutoCreateTasksForMessage,
  isNeverTaskSender,
} from "../email-inbox/reprocess";

const base = {
  mailboxEmail: "me@example.com",
  projectOptions: [],
  forceHeuristic: true,
};

test("(a) user's own outbound reply never creates tasks", () => {
  assert.equal(
    canAutoCreateTasksForMessage({ direction: "outbound" }, "me@example.com"),
    false,
  );
  assert.equal(
    canAutoCreateTasksForMessage({ direction: "inbound" }, "pat@client.com"),
    true,
  );
});

test("(b) no-reply newsletter yields no tasks", async () => {
  const result = await analyzeThreadWithAI({
    ...base,
    subject: "Weekly newsletter: please read",
    bodyText: "Please review our latest updates. Can you share this?",
    senderEmail: "noreply@news.example.com",
  });
  assert.deepEqual(result.taskSuggestions, []);
});

test("(c) Supabase 'has been paused' no-reply email still creates a task", async () => {
  const input = {
    ...base,
    subject: "Your Supabase Project Acme has been paused",
    bodyText: "Your project has been paused due to inactivity. Restore it from the dashboard.",
    senderEmail: "no-reply@supabase.io",
  };
  assert.equal(isCriticalAccountNotice(input.subject, input.bodyText), true);
  const result = await analyzeThreadWithAI(input);
  assert.equal(result.taskSuggestions.length, 1);
  assert.equal(result.classification, "actionable");
});

test("(d) self/system senders never create tasks", () => {
  for (const s of [
    "spencer@theportlandcompany.com",
    "notifications@focusforge.dev",
    "bartok@example.com",
    "swarm-tester@example.com",
    "noreply@usesend.com",
    "warmup@somewhere.com",
    "blast@nueraheat.net",
  ]) {
    assert.equal(isNeverTaskSender(s), true, s);
    assert.equal(canAutoCreateTasksForMessage({ direction: "inbound" }, s), false);
  }
  assert.equal(isNeverTaskSender("dan@danclemens.com"), false);
});

test("fallback splitter emits at most one task and none without a needed response", () => {
  const none = buildHeuristicAnalysis({
    ...base,
    subject: "FYI",
    bodyText: "Thanks, got it.",
    senderEmail: "pat@client.com",
  });
  assert.deepEqual(none.taskSuggestions, []);
  const many = buildHeuristicAnalysis({
    ...base,
    subject: "Quick ask",
    bodyText: "Please send the file. Please review the draft. Can you confirm the date?",
    senderEmail: "pat@client.com",
  });
  assert.equal(many.taskSuggestions.length, 1);
});
