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

export type NormalizedMailboxAttachment = {
  filename?: string | null;
  contentType?: string | null;
  contentDisposition?: "attachment" | "inline" | null;
  cid?: string | null;
  size: number;
  related: boolean;
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
  isUnread: boolean;
  attachments: NormalizedMailboxAttachment[];
};

export type MailboxSyncCursor = {
  highestUid: number | null;
  lastSeenAt: string | null;
};

export type FetchMailboxMessagesResult = {
  messages: NormalizedMailboxMessage[];
  syncCursor: MailboxSyncCursor;
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

export function normalizeMailboxSyncCursor(value: unknown): MailboxSyncCursor {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const highestUidValue = Number(raw.highestUid);
  const highestUid =
    Number.isFinite(highestUidValue) && highestUidValue > 0
      ? Math.floor(highestUidValue)
      : null;

  const lastSeenAt =
    typeof raw.lastSeenAt === "string" && normalizeDate(raw.lastSeenAt)
      ? normalizeDate(raw.lastSeenAt)
      : null;

  return {
    highestUid,
    lastSeenAt,
  };
}

export function buildMailboxSyncCursor(params: {
  previousCursor?: unknown;
  fallbackLastSeenAt?: string | null;
  messages?: Array<Pick<NormalizedMailboxMessage, "receivedAt" | "sentAt">>;
  highestUid?: number | null;
}): MailboxSyncCursor {
  const previousCursor = normalizeMailboxSyncCursor(params.previousCursor);
  let lastSeenAt =
    previousCursor.lastSeenAt ?? normalizeDate(params.fallbackLastSeenAt) ?? null;

  for (const message of params.messages || []) {
    const candidate = normalizeDate(message.receivedAt || message.sentAt || null);
    if (candidate && (!lastSeenAt || candidate > lastSeenAt)) {
      lastSeenAt = candidate;
    }
  }

  const highestUid =
    Number.isFinite(params.highestUid) && Number(params.highestUid) > 0
      ? Math.max(previousCursor.highestUid || 0, Math.floor(Number(params.highestUid)))
      : previousCursor.highestUid;

  return {
    highestUid: highestUid || null,
    lastSeenAt,
  };
}

function normalizeAttachments(
  attachments: Array<{
    filename?: string | null;
    contentType?: string | null;
    contentDisposition?: string | null;
    cid?: string | null;
    size?: number | null;
    related?: boolean | null;
  }> = [],
): NormalizedMailboxAttachment[] {
  return attachments.map((attachment) => ({
    filename: attachment.filename ? String(attachment.filename) : null,
    contentType: attachment.contentType ? String(attachment.contentType) : null,
    contentDisposition:
      attachment.contentDisposition === "inline" ? "inline" : "attachment",
    cid: attachment.cid ? String(attachment.cid) : null,
    size: Number(attachment.size || 0),
    related: Boolean(attachment.related),
  }));
}

function normalizeParsedMailboxMessage(params: {
  uid: number;
  source: Buffer;
  flags?: Set<string> | null;
  internalDate?: string | Date | null;
}) {
  return simpleParser(params.source).then((parsed) => {
    const flags = Array.from(params.flags || []).map((flag) => String(flag));
    return {
      providerMessageId: String(params.uid),
      internetMessageId: parsed.messageId || null,
      inReplyTo: parsed.inReplyTo || null,
      references: normalizeReferences(parsed.references as any),
      subject: parsed.subject || "",
      bodyText: parsed.text || "",
      bodyHtml: parsed.html ? String(parsed.html) : null,
      receivedAt: normalizeDate(params.internalDate),
      sentAt: normalizeDate(parsed.date),
      from: normalizeAddressList(parsed.from?.value || []),
      to: normalizeAddressList(parsed.to?.value || []),
      cc: normalizeAddressList(parsed.cc?.value || []),
      bcc: normalizeAddressList(parsed.bcc?.value || []),
      replyTo: normalizeAddressList(parsed.replyTo?.value || []),
      rawHeaders: normalizeHeaders(parsed.headers),
      isUnread: !flags.includes("\\Seen"),
      attachments: normalizeAttachments(parsed.attachments as any[]),
    } satisfies NormalizedMailboxMessage;
  });
}

export async function fetchMailboxMessages(
  mailbox: MailboxTransportRow,
  options?: {
    lastSeenAt?: string | null;
    syncCursor?: unknown;
  },
): Promise<FetchMailboxMessagesResult> {
  const password = getMailboxPassword(mailbox);
  const previousCursor = normalizeMailboxSyncCursor(options?.syncCursor);
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
    let highestUid = previousCursor.highestUid;
    const messagePromises: Array<Promise<NormalizedMailboxMessage>> = [];
    const rangeStart =
      previousCursor.highestUid && previousCursor.highestUid > 0
        ? previousCursor.highestUid + 1
        : null;

    const fetchSequence =
      rangeStart && Number.isFinite(rangeStart) ? `${rangeStart}:*` : null;

    const fallbackSearchCriteria = options?.lastSeenAt
      ? { since: new Date(options.lastSeenAt) }
      : { all: true };
    const fallbackUids = fetchSequence
      ? null
      : await client.search(fallbackSearchCriteria as any);
    const fetchTarget = fetchSequence
      ? fetchSequence
      : [...(Array.isArray(fallbackUids) ? fallbackUids : [])]
          .sort((a, b) => a - b)
          .slice(-50);

    if (Array.isArray(fetchTarget) && fetchTarget.length === 0) {
      return {
        messages: [],
        syncCursor: buildMailboxSyncCursor({
          previousCursor,
          fallbackLastSeenAt: options?.lastSeenAt ?? null,
        }),
      };
    }

    for await (const message of client.fetch(fetchTarget as any, {
      uid: true,
      source: true,
      flags: true,
      internalDate: true,
    }, fetchSequence ? { uid: true } : undefined)) {
      if (!message.source) {
        continue;
      }

      highestUid = Math.max(highestUid || 0, Number(message.uid || 0));
      messagePromises.push(
        normalizeParsedMailboxMessage({
          uid: message.uid,
          source: message.source,
          flags: message.flags || null,
          internalDate: message.internalDate || null,
        }),
      );
    }

    const messages = await Promise.all(messagePromises);

    return {
      messages,
      syncCursor: buildMailboxSyncCursor({
        previousCursor,
        fallbackLastSeenAt: options?.lastSeenAt ?? null,
        messages,
        highestUid,
      }),
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function fetchMailboxMessageReadStates(
  mailbox: MailboxTransportRow,
  providerMessageIds: string[],
) {
  const uids = providerMessageIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (uids.length === 0) {
    return [] as Array<{
      providerMessageId: string;
      isUnread: boolean;
    }>;
  }

  return await withImapClient(mailbox, async (client) => {
    const states: Array<{
      providerMessageId: string;
      isUnread: boolean;
    }> = [];

    for (let index = 0; index < uids.length; index += 200) {
      const batch = uids.slice(index, index + 200);

      for await (const message of client.fetch(
        batch,
        {
          uid: true,
          flags: true,
        },
        { uid: true },
      )) {
        const flags = Array.from(message.flags || []).map((flag) =>
          String(flag),
        );

        states.push({
          providerMessageId: String(message.uid),
          isUnread: !flags.includes("\\Seen"),
        });
      }
    }

    return states;
  });
}

export async function fetchMailboxMessageByProviderMessageId(
  mailbox: MailboxTransportRow,
  providerMessageId: string,
) {
  const uid = Number(providerMessageId);
  if (!Number.isFinite(uid) || uid <= 0) {
    return null;
  }

  return await withImapClient(mailbox, async (client) => {
    for await (const message of client.fetch(
      [uid],
      {
        uid: true,
        source: true,
        flags: true,
        internalDate: true,
      },
      { uid: true },
    )) {
      if (!message.source) {
        continue;
      }

      return await normalizeParsedMailboxMessage({
        uid: message.uid,
        source: message.source,
        flags: message.flags || null,
        internalDate: message.internalDate || null,
      });
    }

    return null;
  });
}

export async function fetchMailboxAttachmentByProviderMessageId(
  mailbox: MailboxTransportRow,
  providerMessageId: string,
  attachmentIndex: number,
) {
  const uid = Number(providerMessageId);
  if (!Number.isFinite(uid) || uid <= 0 || attachmentIndex < 0) {
    return null;
  }

  return await withImapClient(mailbox, async (client) => {
    for await (const message of client.fetch(
      [uid],
      {
        uid: true,
        source: true,
      },
      { uid: true },
    )) {
      if (!message.source) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const attachment = parsed.attachments?.[attachmentIndex];

      if (!attachment?.content) {
        return null;
      }

      return {
        filename: attachment.filename ? String(attachment.filename) : "attachment",
        contentType: attachment.contentType ? String(attachment.contentType) : null,
        contentDisposition:
          attachment.contentDisposition === "inline" ? "inline" : "attachment",
        content: Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content),
      };
    }

    return null;
  });
}

export async function sendMailboxReply(params: {
  mailbox: MailboxTransportRow;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string | null;
    contentDisposition?: "attachment" | "inline";
  }>;
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
    ...(params.attachments && params.attachments.length > 0
      ? { attachments: params.attachments }
      : {}),
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
