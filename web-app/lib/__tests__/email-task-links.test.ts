import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskLinkMaps,
  type EmailThreadTaskRow,
} from "../email-inbox/task-links";

test("buildTaskLinkMaps maps links, ai-origin, and public flag", () => {
  const rows: EmailThreadTaskRow[] = [
    {
      task_id: "t1",
      thread_id: "th1",
      generated_by: "ai",
      rationale: "looked task-worthy",
      public: true,
    },
    {
      task_id: "t2",
      thread_id: "th2",
      generated_by: "user",
      rationale: null,
      public: false,
    },
  ];

  const { links, aiCreated, publicByTaskId } = buildTaskLinkMaps(rows);

  assert.equal(links.t1, "th1");
  assert.equal(links.t2, "th2");

  // AI-origin map only includes ai-generated links.
  assert.deepEqual(aiCreated.t1, {
    threadId: "th1",
    generatedBy: "ai",
    rationale: "looked task-worthy",
  });
  assert.equal(aiCreated.t2, undefined);

  // Public flag reflects per-row state.
  assert.equal(publicByTaskId.t1, true);
  assert.equal(publicByTaskId.t2, false);
});

test("buildTaskLinkMaps treats missing/null public as false and tolerates empty input", () => {
  const { publicByTaskId, links } = buildTaskLinkMaps([
    { task_id: "t3", thread_id: "th3" },
    { task_id: "t4", thread_id: "th4", public: null },
  ]);
  assert.equal(publicByTaskId.t3, false);
  assert.equal(publicByTaskId.t4, false);
  assert.equal(links.t3, "th3");

  const empty = buildTaskLinkMaps(null);
  assert.deepEqual(empty.links, {});
  assert.deepEqual(empty.aiCreated, {});
  assert.deepEqual(empty.publicByTaskId, {});
});
