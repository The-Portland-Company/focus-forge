/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { isValidTaskBlueprint } from "../ai-planner/types";
import { validatePlanDraftQuality } from "../ai-planner/persistence";

test("accepts valid task blueprint", () => {
  const valid = isValidTaskBlueprint({
    lists: [
      {
        name: "Backend",
        tasks: [
          {
            name: "Build API",
            priority: 2,
            dependencies: ["Schema ready"],
            estimate: "6h",
            subtasks: [{ name: "Write endpoint" }],
          },
        ],
      },
    ],
  });

  assert.equal(valid, true);
});

test("rejects invalid task blueprint", () => {
  const invalid = isValidTaskBlueprint({
    lists: [{ name: "Backend", tasks: [{ priority: 2 }] }],
  });

  assert.equal(invalid, false);
});

test("plan quality validator marks weak drafts as invalid", () => {
  const result = validatePlanDraftQuality({
    title: "MVP",
    overview: "Build app",
    objectives: ["A"],
    scope: { in: ["A"], out: [] },
    architecture: ["A"],
    milestones: [{ name: "M1", outcome: "o", acceptanceCriteria: ["a"] }],
    risks: [{ risk: "r", mitigation: "m" }],
  });

  assert.equal(result.valid, false);
  assert.ok(result.missing.length >= 1);
});

test("plan quality validator accepts robust drafts", () => {
  const result = validatePlanDraftQuality({
    title: "MVP",
    overview: "Build app",
    objectives: ["Auth", "Projects", "Tasks"],
    scope: { in: ["Auth", "API", "UI"], out: ["Billing"] },
    architecture: ["Next.js", "Supabase", "RLS"],
    milestones: [
      { name: "M1", outcome: "Base", acceptanceCriteria: ["Auth works"] },
      { name: "M2", outcome: "Planner", acceptanceCriteria: ["Chat persists"] },
      { name: "M3", outcome: "Pipeline", acceptanceCriteria: ["Tasks created"] },
    ],
    risks: [
      { risk: "Ambiguous scope", mitigation: "Clarifying questions" },
      { risk: "Schema drift", mitigation: "Validation + retries" },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.missing.length, 0);
});
