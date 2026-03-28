/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  runAutoSectionModel,
  type AutoSectionSuggestion,
} from "./auto-section";

test("runAutoSectionModel batches large task sets and merges suggestions", async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const fetchCalls: Array<{ tasks: Array<{ id: string }> }> = [];

  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body || "{}"));
    const messageContent = String(payload?.messages?.[1]?.content || "{}");
    const parsedContent = JSON.parse(messageContent);
    const tasks = Array.isArray(parsedContent?.unassignedTasks)
      ? parsedContent.unassignedTasks
      : [];

    fetchCalls.push({ tasks });

    const suggestions: AutoSectionSuggestion[] = tasks.map((task: { id: string }) => ({
      taskId: task.id,
      targetSectionName: "Administrative",
      createSection: false,
      reason: "Matches the existing admin section.",
    }));

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: `Processed ${tasks.length} tasks`,
                suggestions,
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const unassignedTasks = Array.from({ length: 25 }, (_, index) => ({
      id: `task-${index + 1}`,
      name: `Task ${index + 1}`,
      description: `Description ${index + 1}`,
    }));

    const result = await runAutoSectionModel({
      projectName: "Organizer Test",
      existingSections: [{ id: "section-1", name: "Administrative" }],
      unassignedTasks,
    });

    assert.equal(fetchCalls.length, 3);
    assert.deepEqual(
      fetchCalls.map((call) => call.tasks.length),
      [12, 12, 1],
    );
    assert.equal(result.suggestions.length, 25);
    assert.equal(result.summary, "Processed 12 tasks");
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  }
});
