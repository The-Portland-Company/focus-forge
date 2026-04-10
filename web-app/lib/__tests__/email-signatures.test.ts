/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyEmailSignature,
  deleteEmailSignature,
  getApplicableEmailSignatures,
  getDefaultEmailSignature,
  upsertEmailSignature,
} from "../email-signatures";

test("getApplicableEmailSignatures includes all-mailbox signatures", () => {
  const allSignature = createEmptyEmailSignature("user-1", {
    id: "sig-1",
    name: "All",
    mailboxScope: "all",
  });
  const mailboxSignature = createEmptyEmailSignature("user-1", {
    id: "sig-2",
    name: "Specific",
    mailboxScope: "selected",
    mailboxIds: ["mailbox-1"],
  });

  assert.deepEqual(
    getApplicableEmailSignatures([allSignature, mailboxSignature], "mailbox-1")
      .map((signature) => signature.id),
    ["sig-1", "sig-2"],
  );
});

test("getDefaultEmailSignature prefers the default applicable signature", () => {
  const defaultSignature = createEmptyEmailSignature("user-1", {
    id: "sig-1",
    isDefault: true,
    mailboxScope: "selected",
    mailboxIds: ["mailbox-1"],
  });
  const fallbackSignature = createEmptyEmailSignature("user-1", {
    id: "sig-2",
    mailboxScope: "all",
  });

  assert.equal(
    getDefaultEmailSignature([fallbackSignature, defaultSignature], "mailbox-1")
      ?.id,
    "sig-1",
  );
});

test("upsertEmailSignature clears previous defaults when a new default is saved", () => {
  const existing = createEmptyEmailSignature("user-1", {
    id: "sig-1",
    isDefault: true,
  });
  const next = createEmptyEmailSignature("user-1", {
    id: "sig-2",
    isDefault: true,
  });

  const updated = upsertEmailSignature([existing], next);
  assert.equal(updated.find((signature) => signature.id === "sig-1")?.isDefault, false);
  assert.equal(updated.find((signature) => signature.id === "sig-2")?.isDefault, true);
});

test("deleteEmailSignature promotes the next signature to default when needed", () => {
  const first = createEmptyEmailSignature("user-1", {
    id: "sig-1",
    isDefault: true,
  });
  const second = createEmptyEmailSignature("user-1", {
    id: "sig-2",
    isDefault: false,
  });

  const updated = deleteEmailSignature([first, second], "sig-1");
  assert.equal(updated[0]?.id, "sig-2");
  assert.equal(updated[0]?.isDefault, true);
});
