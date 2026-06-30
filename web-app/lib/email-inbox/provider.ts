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
    previousCursor.lastSeenAt ??
    normalizeDate(params.fallbackLastSeenAt) ??
    null;

  for (const message of params.messages || []) {
    const candidate = normalizeDate(
      message.receivedAt || message.sentAt || null,
    );
    if (candidate && (!lastSeenAt || candidate > lastSeenAt)) {
      lastSeenAt = candidate;
    }
  }

  const highestUid =
    Number.isFinite(params.highestUid) && Number(params.highestUid) > 0
      ? Math.max(
          previousCursor.highestUid || 0,
          Math.floor(Number(params.highestUid)),
        )
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

    for await (const message of client.fetch(
      fetchTarget as any,
      {
        uid: true,
        source: true,
        flags: true,
        internalDate: true,
      },
      fetchSequence ? { uid: true } : undefined,
    )) {
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

/**
 * Fetch recently-sent messages from the mailbox's Sent folder so replies the
 * user sends OUTSIDE the app (e.g. directly in Gmail / Apple Mail) still appear
 * in the threaded conversation view. The main `fetchMailboxMessages` sync only
 * reads INBOX, so without this every outbound message composed elsewhere is
 * invisible. Sent volume is low, so we re-fetch a bounded recent window each
 * sync and rely on dedup (by Message-ID) downstream — no separate cursor.
 *
 * Provider message IDs are namespaced `sent:<uid>` because IMAP UIDs are folder
 * scoped and would otherwise collide with INBOX UIDs under the
 * UNIQUE (mailbox_id, provider_message_id) constraint.
 */
export async function fetchMailboxSentMessages(
  mailbox: MailboxTransportRow,
  options?: { limit?: number },
): Promise<NormalizedMailboxMessage[]> {
  const limit = options?.limit && options.limit > 0 ? options.limit : 50;
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

  try {
    const folders = await client.list();
    const sentFolder =
      (folders || []).find((folder) => folder.specialUse === "\\Sent") ??
      (folders || []).find((folder) =>
        /(^|[\/.])sent( mail)?$/i.test(folder.path),
      ) ??
      (folders || []).find((folder) => /sent/i.test(folder.path));

    if (!sentFolder?.path) {
      return [];
    }

    const lock = await client.getMailboxLock(sentFolder.path);
    try {
      const uids = await client.search({ all: true }, { uid: true });
      const target = [...(Array.isArray(uids) ? uids : [])]
        .sort((a, b) => a - b)
        .slice(-limit);

      if (target.length === 0) {
        return [];
      }

      const messagePromises: Array<Promise<NormalizedMailboxMessage>> = [];
      for await (const message of client.fetch(
        target,
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
        messagePromises.push(
          normalizeParsedMailboxMessage({
            uid: message.uid,
            source: message.source,
            flags: message.flags || null,
            internalDate: message.internalDate || null,
          }).then((normalized) => ({
            ...normalized,
            providerMessageId: `sent:${normalized.providerMessageId}`,
          })),
        );
      }

      return await Promise.all(messagePromises);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

export type MailboxStorageQuota = {
  used: number;
  total: number;
};

/**
 * Fetch storage usage for a mailbox via the IMAP QUOTA extension (RFC 2087).
 * Returns null when the server does not advertise QUOTA or reports no storage
 * limit (common for Gmail, which does not expose per-account quota over IMAP).
 */
export async function fetchMailboxStorageQuota(
  mailbox: MailboxTransportRow,
): Promise<MailboxStorageQuota | null> {
  return await withImapClient(mailbox, async (client) => {
    try {
      const quota = await client.getQuota(mailbox.sync_folder || "INBOX");
      if (!quota || typeof quota === "boolean") return null;
      const storage = (quota as any).storage;
      const used = Number(storage?.used);
      const total = Number(storage?.limit);
      if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
        return null;
      }
      return { used, total };
    } catch {
      return null;
    }
  });
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

// Lists every UID currently present in the synced folder (e.g. Gmail INBOX).
// Used to mirror provider-side archiving: stored messages whose UID is no
// longer present have left the folder.
export async function fetchMailboxFolderUids(mailbox: MailboxTransportRow) {
  return await withImapClient(mailbox, async (client) => {
    const uids = await client.search({ all: true }, { uid: true });
    return (Array.isArray(uids) ? uids : [])
      .map((uid) => String(uid))
      .filter((uid) => uid && uid !== "0");
  });
}

export type MailboxFolderInfo = {
  /** Full IMAP path, e.g. "INBOX.Work.Clients" or "[Gmail]/All Mail". */
  path: string;
  /** Last path segment (display name), e.g. "Clients". */
  name: string;
  /** Hierarchy delimiter reported by the server ("." or "/"). */
  delimiter: string;
  /** Special-use flag if any: "\\Inbox", "\\Sent", "\\Trash", "\\Junk", … */
  specialUse: string | null;
  /** Total message count (STATUS MESSAGES). */
  total: number;
  /** Unread message count (STATUS UNSEEN). */
  unseen: number;
  /** Read messages = total - unseen (never negative). */
  read: number;
};

/**
 * Lists every selectable IMAP folder for a mailbox together with message and
 * unseen counts. Uses a single `LIST … RETURN (STATUS …)` round-trip when the
 * server advertises LIST-STATUS; imapflow transparently falls back to a per
 * folder STATUS otherwise. `\Noselect` / `\NonExistent` folders cannot hold
 * messages and are skipped. Folders whose STATUS lookup errored are still
 * returned, with zeroed counts, rather than dropped.
 *
 * Works for any mailbox that exposes IMAP (imap_smtp + Gmail/Workspace with an
 * app password). Providers without an IMAP host should be filtered out by the
 * caller before reaching this function.
 */
export async function listMailboxFolders(
  mailbox: MailboxTransportRow,
): Promise<MailboxFolderInfo[]> {
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

  try {
    const folders = await client.list({
      statusQuery: { messages: true, unseen: true },
    });

    const result: MailboxFolderInfo[] = [];

    for (const folder of folders || []) {
      const flags =
        folder.flags instanceof Set ? folder.flags : new Set<string>();
      if (flags.has("\\Noselect") || flags.has("\\NonExistent")) {
        continue;
      }

      const status = (folder as { status?: { messages?: number; unseen?: number } })
        .status;
      const totalValue = Number(status?.messages);
      const unseenValue = Number(status?.unseen);
      const total = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : 0;
      const unseen =
        Number.isFinite(unseenValue) && unseenValue > 0 ? unseenValue : 0;

      result.push({
        path: folder.path,
        name: folder.name || folder.path,
        delimiter: folder.delimiter || "/",
        specialUse: folder.specialUse || null,
        total,
        unseen,
        read: Math.max(0, total - unseen),
      });
    }

    // INBOX first, then remaining folders alphabetically by display path.
    return result.sort((a, b) => {
      const aInbox = a.specialUse === "\\Inbox" || a.path.toUpperCase() === "INBOX";
      const bInbox = b.specialUse === "\\Inbox" || b.path.toUpperCase() === "INBOX";
      if (aInbox !== bInbox) return aInbox ? -1 : 1;
      return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
    });
  } finally {
    await client.logout();
  }
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

/**
 * Batched variant of fetchMailboxMessageByProviderMessageId: fetches many
 * messages over a SINGLE IMAP connection (one connect/login/SELECT) instead of
 * one connection per message. Returns a map keyed by provider message id (UID
 * string). Non-numeric / invalid ids are skipped. Used by the attachment
 * metadata backfill so opening a thread with N attachment-bearing messages does
 * not trigger N sequential IMAP handshakes.
 */
export async function fetchMailboxMessagesByProviderMessageIds(
  mailbox: MailboxTransportRow,
  providerMessageIds: string[],
): Promise<Map<string, NormalizedMailboxMessage>> {
  const result = new Map<string, NormalizedMailboxMessage>();
  const uids = Array.from(
    new Set(
      providerMessageIds
        .map((id) => Number(id))
        .filter((uid) => Number.isFinite(uid) && uid > 0),
    ),
  );
  if (uids.length === 0) {
    return result;
  }

  await withImapClient(mailbox, async (client) => {
    for await (const message of client.fetch(
      uids,
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
      const normalized = await normalizeParsedMailboxMessage({
        uid: message.uid,
        source: message.source,
        flags: message.flags || null,
        internalDate: message.internalDate || null,
      });
      result.set(String(message.uid), normalized);
    }
  });

  return result;
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
        filename: attachment.filename
          ? String(attachment.filename)
          : "attachment",
        contentType: attachment.contentType
          ? String(attachment.contentType)
          : null,
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

/**
 * Translate raw SMTP failures into a clear, actionable message. Gmail/Workspace
 * rejects an invalid or revoked app password with code 534/535 and a
 * "WebLoginRequired"/"BadCredentials" body; surface that as a re-auth prompt
 * instead of the cryptic multi-line SMTP blob.
 */
function translateSmtpSendError(error: unknown, mailboxEmail: string): Error {
  const code = (error as { responseCode?: number; code?: string })
    ?.responseCode;
  const raw =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  const isAuthFailure =
    code === 534 ||
    code === 535 ||
    /WebLoginRequired|BadCredentials|Username and Password not accepted|Invalid login|5\.7\.\d/i.test(
      raw,
    );

  if (isAuthFailure) {
    return new Error(
      `Email provider rejected the login for ${mailboxEmail}. The mailbox app password is no longer valid — reconnect the mailbox with a fresh Google app password (or re-authorize the account) in Settings, then resend.`,
    );
  }

  return error instanceof Error ? error : new Error(raw);
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

  let info;
  try {
    info = await transport.sendMail({
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
  } catch (error) {
    throw translateSmtpSendError(error, params.mailbox.email_address);
  }

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

async function resolveTrashMailboxPath(client: ImapFlow) {
  const listedMailboxes = await client.list().catch(() => []);

  for (const mailbox of listedMailboxes) {
    if (mailbox.specialUse === "\\Trash") {
      return mailbox.path;
    }
  }

  const candidateNames = new Set([
    "trash",
    "deleted items",
    "deleted messages",
    "deleted",
    "[gmail]/trash",
  ]);

  for (const mailbox of listedMailboxes) {
    const normalizedPath = mailbox.path.trim().toLowerCase();
    const normalizedName = mailbox.name.trim().toLowerCase();
    if (
      candidateNames.has(normalizedPath) ||
      candidateNames.has(normalizedName)
    ) {
      return mailbox.path;
    }
  }

  return null;
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

export async function emptyMailboxTrash(mailbox: MailboxTransportRow) {
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

  try {
    const trashPath = await resolveTrashMailboxPath(client);
    if (!trashPath) {
      return { emptied: false, deletedMessageCount: 0 };
    }

    const lock = await client.getMailboxLock(trashPath);

    try {
      const openedMailbox = client.mailbox;
      const deletedMessageCount = Number(
        openedMailbox ? openedMailbox.exists : 0,
      );
      if (deletedMessageCount > 0) {
        await client.messageDelete("1:*");
      }

      return { emptied: true, deletedMessageCount };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
