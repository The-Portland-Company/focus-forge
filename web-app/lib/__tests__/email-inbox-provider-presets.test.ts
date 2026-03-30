import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMailboxProviderPreset,
  MAILBOX_PROVIDER_PRESETS,
} from "@/lib/email-inbox/provider-presets";

test("applyMailboxProviderPreset fills Gmail transport defaults", () => {
  const next = applyMailboxProviderPreset(
    {
      provider: "imap_smtp" as const,
      emailAddress: "owner@gmail.com",
      loginUsername: "",
      imapHost: "",
      imapPort: "",
      smtpHost: "",
      smtpPort: "",
      syncFolder: "",
    },
    "gmail",
  );

  assert.equal(next.provider, "gmail");
  assert.equal(next.loginUsername, "owner@gmail.com");
  assert.equal(next.imapHost, MAILBOX_PROVIDER_PRESETS.gmail.imapHost);
  assert.equal(next.imapPort, MAILBOX_PROVIDER_PRESETS.gmail.imapPort);
  assert.equal(next.smtpHost, MAILBOX_PROVIDER_PRESETS.gmail.smtpHost);
  assert.equal(next.smtpPort, MAILBOX_PROVIDER_PRESETS.gmail.smtpPort);
  assert.equal(next.syncFolder, "INBOX");
});

test("applyMailboxProviderPreset keeps custom server values for manual setup", () => {
  const next = applyMailboxProviderPreset(
    {
      provider: "gmail" as const,
      emailAddress: "owner@gmail.com",
      loginUsername: "owner@gmail.com",
      imapHost: "imap.gmail.com",
      imapPort: "993",
      smtpHost: "smtp.gmail.com",
      smtpPort: "465",
      syncFolder: "INBOX",
    },
    "imap_smtp",
  );

  assert.equal(next.provider, "imap_smtp");
  assert.equal(next.imapHost, "imap.gmail.com");
  assert.equal(next.smtpHost, "smtp.gmail.com");
});
