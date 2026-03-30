import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { decryptMailboxCredentials } from "@/lib/email-inbox/crypto";

export type MailboxTransportRow = {
  id: string;
  email_address: string;
  display_name?: string | null;
  login_username: string;
  credentials_encrypted: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  sync_folder?: string | null;
};

export type NormalizedMailboxAddress = {
  email: string;
  name?: string | null;
};

export type NormalizedMailboxMessage = {
  providerMessageId: string;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  references: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  receivedAt?: string | null;
  sentAt?: string | null;
  from: NormalizedMailboxAddress[];
  to: NormalizedMailboxAddress[];
  cc: NormalizedMailboxAddress[];
  bcc: NormalizedMailboxAddress[];
  replyTo: NormalizedMailboxAddress[];
  rawHeaders: Record<string, string>;
};

function getMailboxPassword(mailbox: MailboxTransportRow) {
  const credentials = decryptMailboxCredentials(mailbox.credentials_encrypted);
  const password = credentials.password;
  if (!password || typeof password !== "string") {
    throw new Error("Mailbox credentials do not contain a password");
  }
  return password;
}

function normalizeAddressList(values: any[] = []): NormalizedMailboxAddress[] {
  return values
    .map((value) => ({
      email: String(value.address || "")
        .trim()
        .toLowerCase(),
      name: value.name ? String(value.name) : null,
    }))
    .filter((value) => value.email);
}

function normalizeHeaders(headers: Map<string, any>) {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (typeof value === "string") {
      result[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.join(", ");
      continue;
    }

    if (value != null) {
      result[key] = String(value);
    }
  }
  return result;
}

function normalizeReferences(value: string[] | string | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((entry) => entry.trim());
  }
  return value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDate(value: string | Date | undefined | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export async function fetchMailboxMessages(
  mailbox: MailboxTransportRow,
  lastSeenAt?: string | null,
) {
  const password = getMailboxPassword(mailbox);
  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port || 993),
    secure: Boolean(mailbox.imap_secure),
    auth: {
      user: mailbox.login_username,
      pass: password,
    },
  });

  await client.connect();
  const lock = await client.getMailboxLock(mailbox.sync_folder || "INBOX");

  try {
    const searchCriteria = lastSeenAt
      ? { since: new Date(lastSeenAt) }
      : { all: true };
    const searchResult = await client.search(searchCriteria as any);
    const uids = Array.isArray(searchResult) ? searchResult : [];
    const recentUids = [...uids].sort((a, b) => a - b).slice(-50);
    const messages: NormalizedMailboxMessage[] = [];

    if (recentUids.length === 0) {
      return messages;
    }

    for await (const message of client.fetch(recentUids, {
      uid: true,
      source: true,
      flags: true,
      internalDate: true,
    })) {
      if (!message.source) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      messages.push({
        providerMessageId: String(message.uid),
        internetMessageId: parsed.messageId || null,
        inReplyTo: parsed.inReplyTo || null,
        references: normalizeReferences(parsed.references as any),
        subject: parsed.subject || "",
        bodyText: parsed.text || "",
        bodyHtml: parsed.html ? String(parsed.html) : null,
        receivedAt: normalizeDate(message.internalDate),
        sentAt: normalizeDate(parsed.date),
        from: normalizeAddressList(parsed.from?.value || []),
        to: normalizeAddressList(parsed.to?.value || []),
        cc: normalizeAddressList(parsed.cc?.value || []),
        bcc: normalizeAddressList(parsed.bcc?.value || []),
        replyTo: normalizeAddressList(parsed.replyTo?.value || []),
        rawHeaders: normalizeHeaders(parsed.headers),
      });
    }

    return messages;
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function sendMailboxReply(params: {
  mailbox: MailboxTransportRow;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  inReplyTo?: string | null;
  references?: string[];
}) {
  const password = getMailboxPassword(params.mailbox);
  const transport = nodemailer.createTransport({
    host: params.mailbox.smtp_host,
    port: Number(params.mailbox.smtp_port || 465),
    secure: Boolean(params.mailbox.smtp_secure),
    auth: {
      user: params.mailbox.login_username,
      pass: password,
    },
  });

  const info = await transport.sendMail({
    from: params.mailbox.display_name
      ? `"${params.mailbox.display_name}" <${params.mailbox.email_address}>`
      : params.mailbox.email_address,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    text: params.text,
    ...(params.html ? { html: params.html } : {}),
    ...(params.inReplyTo ? { inReplyTo: params.inReplyTo } : {}),
    ...(params.references && params.references.length > 0
      ? { references: params.references }
      : {}),
  });

  return info;
}

async function withImapClient<T>(
  mailbox: MailboxTransportRow,
  fn: (client: ImapFlow) => Promise<T>,
) {
  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port || 993),
    secure: Boolean(mailbox.imap_secure),
    auth: {
      user: mailbox.login_username,
      pass: getMailboxPassword(mailbox),
    },
  });

  await client.connect();
  const lock = await client.getMailboxLock(mailbox.sync_folder || "INBOX");
  try {
    return await fn(client);
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function applyMailboxThreadAction(params: {
  mailbox: MailboxTransportRow;
  providerMessageIds: string[];
  action: "mark_read" | "archive" | "spam" | "delete";
}) {
  if (params.providerMessageIds.length === 0) {
    return;
  }

  const uids = params.providerMessageIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (uids.length === 0) {
    return;
  }

  await withImapClient(params.mailbox, async (client) => {
    const uidRange = uids.join(",");

    if (params.action === "mark_read") {
      await client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });
      return;
    }

    if (params.action === "archive") {
      await client.messageMove(uidRange, "Archive", { uid: true });
      return;
    }

    if (params.action === "spam") {
      try {
        await client.messageMove(uidRange, "Junk", { uid: true });
      } catch {
        await client.messageMove(uidRange, "Spam", { uid: true });
      }
      return;
    }

    try {
      await client.messageMove(uidRange, "Trash", { uid: true });
    } catch {
      await client.messageDelete(uidRange, { uid: true });
    }
  });
}
