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

export type MailboxFormValues = {
  provider: MailboxProvider;
  name: string;
  displayName: string;
  emailAddress: string;
  loginUsername: string;
  password: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  syncFolder: string;
  isShared: boolean;
  organizationId: string;
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

export function createEmptyMailboxForm(): MailboxFormValues {
  return applyMailboxProviderPreset(
    {
      provider: "gmail",
      name: "",
      displayName: "",
      emailAddress: "",
      loginUsername: "",
      password: "",
      imapHost: "",
      imapPort: "993",
      smtpHost: "",
      smtpPort: "465",
      syncFolder: "INBOX",
      isShared: false,
      organizationId: "none",
    },
    "gmail",
  );
}

export function createMailboxFormFromMailbox(
  mailbox: Mailbox,
): MailboxFormValues {
  const preset = MAILBOX_PROVIDER_PRESETS[mailbox.provider];

  return {
    provider: mailbox.provider,
    name: mailbox.name,
    displayName: mailbox.displayName ?? "",
    emailAddress: mailbox.emailAddress,
    loginUsername: mailbox.loginUsername || mailbox.emailAddress,
    password: "",
    imapHost: mailbox.imapHost || preset.imapHost,
    imapPort: String(mailbox.imapPort ?? preset.imapPort),
    smtpHost: mailbox.smtpHost || preset.smtpHost,
    smtpPort: String(mailbox.smtpPort ?? preset.smtpPort),
    syncFolder: mailbox.syncFolder || preset.syncFolder,
    isShared: mailbox.isShared,
    organizationId: mailbox.organizationId ?? "none",
  };
}
