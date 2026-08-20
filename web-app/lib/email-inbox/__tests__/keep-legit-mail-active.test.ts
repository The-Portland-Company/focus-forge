/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { keepLegitMailActive } from "../reprocess";

const noRules = () => new Set<string>();

test("AI needs_project demotion of normal mail is reverted to active", () => {
  const out = keepLegitMailActive({
    classification: "actionable",
    status: "needs_project",
    needsProject: true,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "active");
  assert.equal(out.needsProject, false);
});

test("AI archived demotion of normal mail is reverted to active", () => {
  const out = keepLegitMailActive({
    classification: "reference",
    status: "archived",
    needsProject: false,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "active");
});

test("low-value quarantine of NON-spam mail is reverted to active", () => {
  const out = keepLegitMailActive({
    classification: "newsletter",
    status: "quarantine",
    needsProject: false,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "active");
});

test("genuine spam quarantine is preserved (spam path untouched)", () => {
  const out = keepLegitMailActive({
    classification: "spam",
    status: "quarantine",
    needsProject: false,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "quarantine");
  assert.equal(out.classification, "spam");
});

test("status spam is preserved", () => {
  const out = keepLegitMailActive({
    classification: "actionable",
    status: "spam",
    needsProject: false,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "spam");
});

test("always_delete rule (deleted) is preserved", () => {
  const out = keepLegitMailActive({
    classification: "spam",
    status: "deleted",
    needsProject: false,
    ruleActions: new Set(["always_delete"]),
  });
  assert.equal(out.status, "deleted");
});

test("explicit archive rule is honored", () => {
  const out = keepLegitMailActive({
    classification: "reference",
    status: "archived",
    needsProject: false,
    ruleActions: new Set(["archive"]),
  });
  assert.equal(out.status, "archived");
});

test("explicit require_project rule keeps needs_project", () => {
  const out = keepLegitMailActive({
    classification: "actionable",
    status: "needs_project",
    needsProject: true,
    ruleActions: new Set(["require_project"]),
  });
  assert.equal(out.status, "needs_project");
  assert.equal(out.needsProject, true);
});

test("explicit quarantine rule is honored on non-spam mail", () => {
  const out = keepLegitMailActive({
    classification: "newsletter",
    status: "quarantine",
    needsProject: false,
    ruleActions: new Set(["quarantine"]),
  });
  assert.equal(out.status, "quarantine");
});

test("already-active mail is left untouched", () => {
  const out = keepLegitMailActive({
    classification: "actionable",
    status: "active",
    needsProject: false,
    ruleActions: noRules(),
  });
  assert.equal(out.status, "active");
});
