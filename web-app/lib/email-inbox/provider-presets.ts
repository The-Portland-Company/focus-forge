import type { Mailbox } from "@/lib/types";

export type MailboxProvider = Mailbox["provider"];

export type MailboxProviderPreset = {
  label: string;
  description: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  syncFolder: string;
};

export const MAILBOX_PROVIDER_PRESETS: Record<
  MailboxProvider,
  MailboxProviderPreset
> = {
  imap_smtp: {
    label: "Custom IMAP / SMTP",
    description: "Enter your own mail server settings.",
    imapHost: "",
    imapPort: "993",
    smtpHost: "",
    smtpPort: "465",
    syncFolder: "INBOX",
  },
  gmail: {
    label: "Gmail",
    description:
      "Uses Gmail's IMAP/SMTP servers. Use your Gmail address and a Google App Password.",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    syncFolder: "INBOX",
  },
  microsoft: {
    label: "Microsoft 365 / Outlook",
    description:
      "Uses Outlook's IMAP/SMTP servers. Use your Microsoft account mailbox credentials.",
    imapHost: "outlook.office365.com",
    imapPort: "993",
    smtpHost: "smtp.office365.com",
    smtpPort: "587",
    syncFolder: "INBOX",
  },
};

export function applyMailboxProviderPreset<
  T extends {
    provider: MailboxProvider;
    emailAddress: string;
    loginUsername: string;
    imapHost: string;
    imapPort: string;
    smtpHost: string;
    smtpPort: string;
    syncFolder: string;
  },
>(form: T, provider: MailboxProvider): T {
  if (provider === "imap_smtp") {
    return {
      ...form,
      provider,
    };
  }

  const preset = MAILBOX_PROVIDER_PRESETS[provider];
  return {
    ...form,
    provider,
    loginUsername: form.loginUsername || form.emailAddress,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    syncFolder: preset.syncFolder,
  };
}
