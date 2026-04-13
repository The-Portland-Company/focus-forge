/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReplyHtml,
  buildReplyPlainText,
  formatReplyAttachmentSize,
  isInlineAttachmentEligible,
} from "../email-reply";
import {
  buildHeuristicReplyDraft,
  buildProjectReplyContextSnapshot,
} from "../email-inbox/ai";

test("isInlineAttachmentEligible allows images and pdfs", () => {
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "image/png",
      name: "diagram.png",
      type: "png",
    }),
    true,
  );
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "application/pdf",
      name: "proposal.pdf",
      type: "pdf",
    }),
    true,
  );
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "application/vnd.ms-excel",
      name: "sheet.xls",
      type: "xls",
    }),
    false,
  );
});

test("buildReplyHtml appends signature and inline attachments", () => {
  const html = buildReplyHtml({
    contentHtml: "<p>Hello team,</p><p>See the latest draft.</p>",
    signatureText: "Spencer Hill\nFocus Forge",
    attachments: [
      {
        id: "att-1",
        name: "preview.png",
        url: "user/path/preview.png",
        type: "png",
        mimeType: "image/png",
        inline: true,
        publicUrl: "https://files.example.com/preview.png",
      },
      {
        id: "att-2",
        name: "proposal.pdf",
        url: "user/path/proposal.pdf",
        type: "pdf",
        mimeType: "application/pdf",
        inline: true,
        publicUrl: "https://files.example.com/proposal.pdf",
      },
    ],
  });

  assert.match(html, /Hello team/);
  assert.match(html, /Spencer Hill<br\/>Focus Forge/);
  assert.match(html, /<img src="https:\/\/files\.example\.com\/preview\.png"/);
  assert.match(html, /proposal\.pdf/);
});

test("buildReplyPlainText includes inline attachment links", () => {
  const text = buildReplyPlainText({
    contentHtml: "<p>Hello team,</p><p>See the latest draft.</p>",
    signatureText: "Spencer Hill",
    attachments: [
      {
        id: "att-1",
        name: "preview.png",
        url: "user/path/preview.png",
        type: "png",
        mimeType: "image/png",
        inline: true,
        publicUrl: "https://files.example.com/preview.png",
      },
    ],
  });

  assert.match(text, /Hello team,/);
  assert.match(text, /Spencer Hill/);
  assert.match(text, /preview\.png: https:\/\/files\.example\.com\/preview\.png/);
});

test("formatReplyAttachmentSize formats bytes across ranges", () => {
  assert.equal(formatReplyAttachmentSize(980), "980 B");
  assert.equal(formatReplyAttachmentSize(2048), "2.0 KB");
  assert.equal(formatReplyAttachmentSize(3 * 1024 * 1024), "3.0 MB");
});

test("buildProjectReplyContextSnapshot favors active tasks and recent comments", () => {
  const snapshot = buildProjectReplyContextSnapshot({
    projectExport: {
      exportedAt: "2026-04-13T10:00:00.000Z",
      project: {
        id: "project-1",
        name: "Client Launch",
        descriptionPlainText: "Website redesign rollout",
      },
      summary: {
        taskCount: 2,
        activeTaskCount: 1,
      },
      sections: [],
      projectComments: [
        {
          authorName: "Spencer",
          createdAt: "2026-04-12T10:00:00.000Z",
          contentPlainText: "Need final client signoff before publishing.",
        },
      ],
      tasks: [
        {
          id: "task-1",
          name: "Ship revised homepage",
          completed: false,
          priority: 1,
          dueDate: "2026-04-20",
          assignedToName: "Avery",
          descriptionPlainText: "Update the hero and pricing modules.",
          sections: [{ name: "Launch" }],
          comments: [
            {
              authorName: "Avery",
              createdAt: "2026-04-12T09:00:00.000Z",
              contentPlainText: "Waiting on legal copy edits.",
            },
          ],
        },
        {
          id: "task-2",
          name: "Archive old assets",
          completed: true,
          priority: 4,
          dueDate: null,
          assignedToName: null,
          descriptionPlainText: "Cleanup follow-up.",
          sections: [],
          comments: [],
        },
      ],
    } as any,
    linkedTaskIds: ["task-1"],
  });

  assert.equal((snapshot.project as any).name, "Client Launch");
  assert.equal((snapshot.activeTasks as any[]).length, 1);
  assert.equal((snapshot.activeTasks as any[])[0]?.isLinkedToThread, true);
  assert.match(
    String((snapshot.recentProjectComments as any[])[0]?.content || ""),
    /signoff/i,
  );
});

test("buildHeuristicReplyDraft uses project context when available", () => {
  const draft = buildHeuristicReplyDraft({
    mailboxEmail: "ops@example.com",
    subject: "Need an update",
    conversation: [
      {
        direction: "inbound",
        authorName: "Jordan",
        authorEmail: "jordan@example.com",
        content: "Can you share where the redesign stands?",
      },
    ],
    projectContext: {
      project: {
        name: "Client Launch",
      },
    },
    threadAnalysis: {
      summaryText: "the redesign timeline",
    },
  });

  assert.match(draft.subject, /^Re:/);
  assert.match(draft.contentText, /Client Launch/);
  assert.match(draft.rationale, /project context/i);
});
