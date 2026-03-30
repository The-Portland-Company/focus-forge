import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMailboxProviderPreset,
  createMailboxFormFromMailbox,
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

test("createMailboxFormFromMailbox prefills editable mailbox details", () => {
  const next = createMailboxFormFromMailbox({
    id: "mailbox-1",
    ownerUserId: "user-1",
    name: "The Portland Company",
    displayName: "Spencer Hill",
    emailAddress: "spencerhill@theportlandcompany.com",
    provider: "gmail",
    loginUsername: "spencerhill@theportlandcompany.com",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    isShared: false,
    autoSyncEnabled: true,
    syncFrequencyMinutes: 5,
    syncFolder: "INBOX",
    organizationId: null,
    createdAt: "2026-03-30T00:00:00.000Z",
    updatedAt: "2026-03-30T00:00:00.000Z",
  });

  assert.equal(next.provider, "gmail");
  assert.equal(next.name, "The Portland Company");
  assert.equal(next.loginUsername, "spencerhill@theportlandcompany.com");
  assert.equal(next.password, "");
  assert.equal(next.imapHost, "imap.gmail.com");
  assert.equal(next.smtpPort, "465");
  assert.equal(next.organizationId, "none");
});
