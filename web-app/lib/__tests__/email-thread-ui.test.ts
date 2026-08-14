/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attachContactsToRecipients,
  getConversationEntriesExcludingPrimary,
  getDisplayableThreadAttachments,
  getEmailActorGradient,
  getEmailActorInitials,
  getEmailActorName,
  getPrimaryThreadRenderEntry,
  getRecipientBadge,
  getThreadHeaderBccActors,
  getThreadHeaderCcActors,
  getThreadHeaderToActors,
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

test("getPrimaryThreadRenderEntry anchors on the FIRST email so replies don't replace the body", () => {
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

  // Original email anchors the body; the outbound reply (id=3) appears in the
  // Conversation list via getConversationEntriesExcludingPrimary instead.
  assert.equal(entry?.id, "1");
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

  // Primary is now the first email (id=1); the internal note and the outbound
  // reply remain in the conversation list, in order.
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["2", "3"],
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

test("getThreadHeaderCcActors lists Cc recipients and de-duplicates addresses", () => {
  const actors = getThreadHeaderCcActors({
    id: "1",
    type: "email",
    direction: "inbound",
    content: "Hello",
    contentHtml: null,
    createdAt: "2026-04-09T20:00:00.000Z",
    cc: [
      { email: "rebecca@politogyvrm.com", name: "Rebecca Green" },
      { email: "REBECCA@politogyvrm.com", name: "Rebecca Green" },
      { email: "ops@theportlandcompany.com", name: null },
    ],
  });

  assert.deepEqual(
    actors.map((actor) => actor.email),
    ["rebecca@politogyvrm.com", "ops@theportlandcompany.com"],
  );
});

test("getThreadHeaderCcActors returns nothing when the email had no Cc", () => {
  // An empty list is what hides the header's Cc row entirely.
  assert.deepEqual(
    getThreadHeaderCcActors({
      id: "1",
      type: "email",
      direction: "inbound",
      content: "Hello",
      contentHtml: null,
      createdAt: "2026-04-09T20:00:00.000Z",
      cc: [],
    }),
    [],
  );
  assert.deepEqual(getThreadHeaderCcActors(null), []);
  assert.deepEqual(
    getThreadHeaderCcActors({
      id: "1",
      type: "email",
      direction: "inbound",
      content: "Hello",
      contentHtml: null,
      createdAt: "2026-04-09T20:00:00.000Z",
    }),
    [],
  );
});

test("getThreadHeaderBccActors reads Bcc, which normally only exists on sent mail", () => {
  const entry = {
    id: "1",
    type: "email" as const,
    direction: "outbound" as const,
    content: "Hello",
    contentHtml: null,
    createdAt: "2026-04-09T20:00:00.000Z",
    bcc: [{ email: "silent@theportlandcompany.com", name: null }],
  };

  assert.deepEqual(
    getThreadHeaderBccActors(entry).map((actor) => actor.email),
    ["silent@theportlandcompany.com"],
  );
  // Received mail carries no Bcc header, so the row stays hidden.
  assert.deepEqual(getThreadHeaderBccActors({ ...entry, bcc: [] }), []);
});

test("getThreadHeaderToActors de-duplicates the To list", () => {
  assert.deepEqual(
    getThreadHeaderToActors({
      id: "1",
      type: "email",
      direction: "inbound",
      content: "Hello",
      contentHtml: null,
      createdAt: "2026-04-09T20:00:00.000Z",
      to: [
        { email: "inbox@theportlandcompany.com", name: "Inbox" },
        { email: "Inbox@theportlandcompany.com", name: "Inbox" },
      ],
    }).length,
    1,
  );
});

test("getRecipientBadge prefers the contact's name, then display name, then the address", () => {
  assert.deepEqual(
    getRecipientBadge({
      email: "john@nueraheat.com",
      name: "j.smith",
      contact: {
        firstName: "John",
        lastName: "Smith",
        displayName: "Johnny",
        company: "NueraHeat",
      },
    }),
    { label: "John Smith", company: "NueraHeat", email: "john@nueraheat.com" },
  );

  // No first/last on the contact: fall back to its display name, and a contact
  // without a company shows no secondary bit.
  assert.deepEqual(
    getRecipientBadge({
      email: "john@nueraheat.com",
      contact: {
        firstName: null,
        lastName: null,
        displayName: "Johnny",
        company: null,
      },
    }),
    { label: "Johnny", company: null, email: "john@nueraheat.com" },
  );

  // Unmatched address: the envelope display name, then the address itself.
  assert.equal(
    getRecipientBadge({ email: "john@nueraheat.com", name: "J. Smith" }).label,
    "J. Smith",
  );
  assert.deepEqual(getRecipientBadge({ email: "john@nueraheat.com" }), {
    label: "john@nueraheat.com",
    company: null,
    email: "john@nueraheat.com",
  });
});

test("attachContactsToRecipients matches contacts case-insensitively and nulls the rest", () => {
  const contactsByEmail = new Map([
    [
      "john@nueraheat.com",
      {
        firstName: "John",
        lastName: "Smith",
        displayName: "John Smith",
        company: "NueraHeat",
      },
    ],
  ]);

  const resolved = attachContactsToRecipients(
    [
      { email: "John@NueraHeat.com", name: null },
      { email: "stranger@example.com", name: "Stranger" },
    ],
    contactsByEmail,
  );

  assert.equal(resolved[0].contact?.company, "NueraHeat");
  // Unmatched recipients keep their envelope name and carry a null contact.
  assert.equal(resolved[1].contact, null);
  assert.equal(resolved[1].name, "Stranger");
  assert.deepEqual(attachContactsToRecipients(null, contactsByEmail), []);
});
