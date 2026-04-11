/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getConversationEntriesExcludingPrimary,
  getDisplayableThreadAttachments,
  getEmailActorGradient,
  getEmailActorInitials,
  getEmailActorName,
  getPrimaryThreadRenderEntry,
  isPreviewableThreadAttachment,
} from "../email-thread-ui";

test("getEmailActorName prefers a display name before email", () => {
  assert.equal(
    getEmailActorName("Rebecca Green", "rgreenpol@outlook.com"),
    "Rebecca Green",
  );
  assert.equal(
    getEmailActorName("", "rgreenpol@outlook.com"),
    "rgreenpol@outlook.com",
  );
});

test("getEmailActorInitials builds stable initials for names and emails", () => {
  assert.equal(getEmailActorInitials("Rebecca Green", null), "RG");
  assert.equal(getEmailActorInitials(null, "no-reply@politogyrm.com"), "NR");
  assert.equal(getEmailActorInitials(null, null), "U");
});

test("getEmailActorGradient is deterministic for the same sender", () => {
  const first = getEmailActorGradient("Rebecca Green", "rgreenpol@outlook.com");
  const second = getEmailActorGradient(
    "Rebecca Green",
    "rgreenpol@outlook.com",
  );

  assert.equal(first, second);
  assert.match(first, /^linear-gradient/);
});

test("getPrimaryThreadRenderEntry prefers the latest email body", () => {
  const entry = getPrimaryThreadRenderEntry([
    {
      id: "1",
      type: "email",
      direction: "inbound",
      content: "First email",
      contentHtml: null,
      createdAt: "2026-04-09T20:00:00.000Z",
    },
    {
      id: "2",
      type: "internal_note",
      direction: "internal",
      content: "Internal note",
      contentHtml: null,
      createdAt: "2026-04-09T20:01:00.000Z",
    },
    {
      id: "3",
      type: "email",
      direction: "outbound",
      content: "Latest reply",
      contentHtml: "<p>Latest reply</p>",
      createdAt: "2026-04-09T20:02:00.000Z",
    },
  ]);

  assert.equal(entry?.id, "3");
});

test("getConversationEntriesExcludingPrimary removes the primary email from the thread list", () => {
  const entries = getConversationEntriesExcludingPrimary([
    {
      id: "1",
      type: "email",
      direction: "inbound",
      content: "First email",
      contentHtml: null,
      createdAt: "2026-04-09T20:00:00.000Z",
    },
    {
      id: "2",
      type: "internal_note",
      direction: "internal",
      content: "Internal note",
      contentHtml: null,
      createdAt: "2026-04-09T20:01:00.000Z",
    },
    {
      id: "3",
      type: "email",
      direction: "outbound",
      content: "Latest reply",
      contentHtml: "<p>Latest reply</p>",
      createdAt: "2026-04-09T20:02:00.000Z",
    },
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["1", "2"],
  );
});

test("getDisplayableThreadAttachments excludes inline related assets", () => {
  const attachments = getDisplayableThreadAttachments({
    id: "3",
    type: "email",
    direction: "outbound",
    content: "Latest reply",
    contentHtml: "<p>Latest reply</p>",
    createdAt: "2026-04-09T20:02:00.000Z",
    attachments: [
      {
        filename: "image001.png",
        contentType: "image/png",
        contentDisposition: "inline",
        cid: "cid-1",
        size: 100,
        related: true,
      },
      {
        filename: "Footer Issue.png",
        contentType: "image/png",
        contentDisposition: "attachment",
        size: 332732,
        related: false,
      },
    ],
  });

  assert.deepEqual(
    attachments.map((attachment) => attachment.filename),
    ["Footer Issue.png"],
  );
});

test("isPreviewableThreadAttachment only allows routed image attachments", () => {
  assert.equal(
    isPreviewableThreadAttachment({
      contentType: "image/png",
      url: "/api/email/messages/message-1/attachments/0",
    }),
    true,
  );
  assert.equal(
    isPreviewableThreadAttachment({
      contentType: "application/pdf",
      url: "/api/email/messages/message-1/attachments/1",
    }),
    false,
  );
});
