/* eslint-env node */
import test from "node:test"
import assert from "node:assert/strict"
import { buildProjectAiExport } from "../project-ai-export"

test("buildProjectAiExport nests task comments and file links", () => {
  const payload = buildProjectAiExport({
    exportedAt: "2026-03-20T20:50:00.000Z",
    project: {
      id: "project-1",
      name: "AI Export",
      color: "#fff",
      organizationId: "org-1",
      description: "<p>Project summary</p>",
      archived: false,
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      memberIds: [],
    },
    sections: [
      {
        id: "section-1",
        name: "Backlog",
        project_id: "project-1",
        parent_id: null,
        color: null,
        description: null,
        icon: null,
        order_index: 2,
        todoist_order: null,
        created_at: "2026-03-20T10:00:00.000Z",
        updated_at: "2026-03-20T10:00:00.000Z",
      },
    ],
    taskSections: [
      {
        id: "task-section-1",
        task_id: "task-1",
        section_id: "section-1",
        created_at: "2026-03-20T10:00:00.000Z",
      },
    ],
    tasks: [
      {
        id: "task-1",
        name: "Draft export",
        description: "<p>Task body</p>",
        completed: false,
        priority: 4,
        projectId: "project-1",
        tags: ["tag-1"],
        reminders: [],
        files: [
          {
            id: "file-1",
            name: "Spec",
            url: "https://example.com/spec",
            type: "link",
          },
        ],
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
    ],
    comments: [
      {
        id: "comment-1",
        content: "<p>Looks good</p>",
        task_id: "task-1",
        project_id: "project-1",
        user_id: "user-1",
        created_at: "2026-03-20T10:00:00.000Z",
        updated_at: "2026-03-20T10:00:00.000Z",
        author_name: "Casey Nguyen",
        author_email: "casey@example.com",
      },
      {
        id: "comment-2",
        content: "<p>Project note</p>",
        task_id: null,
        project_id: "project-1",
        user_id: "user-2",
        created_at: "2026-03-20T10:00:00.000Z",
        updated_at: "2026-03-20T10:00:00.000Z",
        author_name: "Robin Stone",
        author_email: "robin@example.com",
      },
    ],
  })

  assert.equal(payload.summary.taskCount, 1)
  assert.equal(payload.summary.projectCommentCount, 1)
  assert.deepEqual(payload.tasks[0].fileLinks, ["https://example.com/spec"])
  assert.equal(payload.tasks[0].sections[0]?.name, "Backlog")
  assert.equal(payload.tasks[0].comments[0]?.authorName, "Casey Nguyen")
  assert.equal(payload.projectComments[0]?.contentPlainText, "Project note")
})
