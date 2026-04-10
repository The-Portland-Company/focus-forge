/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getEmailActorGradient,
  getEmailActorInitials,
  getEmailActorName,
  getPrimaryThreadRenderEntry,
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
