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

// --- IMAP connection concurrency control -----------------------------------
//
// Providers cap simultaneous IMAP connections per account (Gmail: ~15). Forge
// opens a fresh short-lived connection per operation, and several callers can
// run at once — overlapping syncs (the sync lock is check-then-act, and web +
// iOS + macOS all poll), plus per-thread attachment backfills fired on every
// thread open. Unbounded, these bursts trip "Too many simultaneous
// connections" and the mailbox stops syncing.
//
// Every connection is therefore acquired through a per-account semaphore, so
// Forge never holds more than IMAP_MAX_CONCURRENCY_PER_ACCOUNT sockets open to
// one account at a time; excess callers queue. Connections are always closed in
// a finally, so a thrown operation can't leak a slot.
const IMAP_MAX_CONCURRENCY_PER_ACCOUNT = 2;

export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];
  constructor(max: number) {
    this.available = max;
  }
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.available += 1;
    }
  }
}

const imapSemaphores = new Map<string, Semaphore>();

function getImapSemaphore(mailbox: MailboxTransportRow): Semaphore {
  const key = `${mailbox.login_username}@${mailbox.imap_host}:${mailbox.imap_port || 993}`;
  let semaphore = imapSemaphores.get(key);
  if (!semaphore) {
    semaphore = new Semaphore(IMAP_MAX_CONCURRENCY_PER_ACCOUNT);
    imapSemaphores.set(key, semaphore);
  }
  return semaphore;
}

function buildImapClient(mailbox: MailboxTransportRow): ImapFlow {
  return new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port || 993),
    secure: Boolean(mailbox.imap_secure),
    auth: {
      user: mailbox.login_username,
      pass: getMailboxPassword(mailbox),
    },
    logger: false,
    // Bound every phase so a hung socket can't pin a semaphore slot forever.
    greetingTimeout: 15_000,
    connectionTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

// Acquire a per-account connection slot and open a connected IMAP client. The
// caller MUST invoke the returned `release()` in a finally to close the socket
// and free the slot. Prefer withImapConnection() where the callback shape fits;
// this lower-level form exists for sites that manage their own folder locks.
async function acquireImapClient(
  mailbox: MailboxTransportRow,
): Promise<{ client: ImapFlow; release: () => Promise<void> }> {
  const semaphore = getImapSemaphore(mailbox);
  await semaphore.acquire();
  const client = buildImapClient(mailbox);
  try {
    await client.connect();
  } catch (error) {
    semaphore.release();
    throw error;
  }
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await client.logout();
    } catch {
      // Best-effort close; never mask the caller's result or leak the slot.
    }
    semaphore.release();
  };
  return { client, release };
}

// Transient IMAP failures are almost always connection-level: the provider is
// momentarily at its simultaneous-connection cap (Gmail: "Too many simultaneous
// connections"), the socket was reset, or a connect/greeting phase timed out.
// These are safe to retry — unlike auth or "no such message" errors, which are
// deterministic and must surface immediately.
function isTransientImapError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  const code = (error as { code?: string } | null)?.code || "";
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  return (
    message.includes("too many simultaneous") ||
    message.includes("maximum number of connections") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket") ||
    message.includes("connection closed") ||
    message.includes("connection ended") ||
    message.includes("econnreset") ||
    message.includes("temporarily")
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retry a provider-side operation across transient connection failures. Each
// attempt opens a fresh connection (via the caller's own withImapConnection),
// so a retry both waits out a momentary connection-cap spike and gets a clean
// socket. Non-transient errors (auth, invalid state) are re-thrown immediately.
async function withImapRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientImapError(error)) {
        throw error;
      }
      // 400ms, 1200ms backoff — long enough for a transient connection-cap
      // spike or another caller's short-lived operation to clear.
      const delayMs = 400 * attempt * attempt;
      console.warn(
        `[email] transient IMAP error on ${label} (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// Acquire a per-account connection slot, open a fresh IMAP client, run `fn`, and
// always log out + release the slot. All IMAP access in this module funnels
// through here so the per-account connection cap is honored.
async function withImapConnection<T>(
  mailbox: MailboxTransportRow,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const { client, release } = await acquireImapClient(mailbox);
  try {
    return await fn(client);
  } finally {
    await release();
  }
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
  const previousCursor = normalizeMailboxSyncCursor(options?.syncCursor);
  const { client, release } = await acquireImapClient(mailbox);
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
    await release();
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
  const { client, release } = await acquireImapClient(mailbox);

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
    await release();
  }
}

/**
 * Fetch the mailbox's Drafts folder so drafts composed OUTSIDE the app (e.g.
 * directly in Gmail) show up on the Drafts page. Mirrors fetchMailboxSentMessages:
 * the main sync only reads INBOX, so without this a Gmail-composed draft is
 * invisible in Focus.
 *
 * providerMessageId is namespaced `draft:<uid>` (folder-scoped UIDs would
 * otherwise collide with INBOX/Sent), and each message carries the resolved
 * folder path so the caller can reconcile and, later, delete the provider copy.
 */
export async function fetchMailboxDraftMessages(
  mailbox: MailboxTransportRow,
  options?: { limit?: number },
): Promise<Array<NormalizedMailboxMessage & { folderPath: string }>> {
  const limit = options?.limit && options.limit > 0 ? options.limit : 50;
  const { client, release } = await acquireImapClient(mailbox);

  try {
    const folders = await client.list();
    const draftsFolder =
      (folders || []).find((folder) => folder.specialUse === "\\Drafts") ??
      (folders || []).find((folder) =>
        /(^|[\/.])drafts?$/i.test(folder.path),
      ) ??
      (folders || []).find((folder) => /draft/i.test(folder.path));

    if (!draftsFolder?.path) {
      return [];
    }

    const lock = await client.getMailboxLock(draftsFolder.path);
    try {
      const uids = await client.search({ all: true }, { uid: true });
      const target = [...(Array.isArray(uids) ? uids : [])]
        .sort((a, b) => a - b)
        .slice(-limit);

      if (target.length === 0) {
        return [];
      }

      const messagePromises: Array<
        Promise<NormalizedMailboxMessage & { folderPath: string }>
      > = [];
      for await (const message of client.fetch(
        target,
        { uid: true, source: true, flags: true, internalDate: true },
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
            providerMessageId: `draft:${normalized.providerMessageId}`,
            folderPath: draftsFolder.path,
          })),
        );
      }

      return await Promise.all(messagePromises);
    } finally {
      lock.release();
    }
  } finally {
    await release();
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
  const { client, release } = await acquireImapClient(mailbox);

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
    await release();
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
  return withImapConnection(mailbox, async (client) => {
    const lock = await client.getMailboxLock(mailbox.sync_folder || "INBOX");
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}

// Resolve a destination mailbox path by its IMAP \Special-Use attribute first
// (the reliable, provider-agnostic signal — e.g. Gmail exposes [Gmail]/Trash as
// \Trash, [Gmail]/Spam as \Junk, [Gmail]/All Mail as \All), then fall back to a
// set of well-known folder names/paths. Returns null when nothing matches.
type ListedMailboxLike = { path: string; name: string; specialUse?: string };
type MailboxLister = {
  list: () => Promise<ListedMailboxLike[]>;
};

export async function resolveSpecialMailboxPath(
  client: MailboxLister,
  specialUse: string,
  candidateNames: Iterable<string>,
) {
  const listedMailboxes = await client.list().catch(() => []);

  for (const mailbox of listedMailboxes) {
    if (mailbox.specialUse === specialUse) {
      return mailbox.path;
    }
  }

  const candidates = new Set(
    Array.from(candidateNames, (name) => name.trim().toLowerCase()),
  );

  for (const mailbox of listedMailboxes) {
    const normalizedPath = mailbox.path.trim().toLowerCase();
    const normalizedName = mailbox.name.trim().toLowerCase();
    if (candidates.has(normalizedPath) || candidates.has(normalizedName)) {
      return mailbox.path;
    }
  }

  return null;
}

function resolveTrashMailboxPath(client: ImapFlow) {
  return resolveSpecialMailboxPath(client, "\\Trash", [
    "trash",
    "deleted items",
    "deleted messages",
    "deleted",
    "[gmail]/trash",
  ]);
}

function resolveJunkMailboxPath(client: ImapFlow) {
  return resolveSpecialMailboxPath(client, "\\Junk", [
    "junk",
    "junk email",
    "spam",
    "bulk mail",
    "[gmail]/spam",
  ]);
}

// The folder an "archive" should move a message into. Providers with a dedicated
// Archive folder (\Archive special-use) use it; Gmail has none — archiving there
// means removing the \Inbox label, which over IMAP is a move into [Gmail]/All
// Mail (\All). Returns null when neither exists (caller then no-ops the move).
function resolveArchiveMailboxPath(client: ImapFlow) {
  return resolveSpecialMailboxPath(client, "\\Archive", ["archive"]).then(
    (archivePath) =>
      archivePath ??
      resolveSpecialMailboxPath(client, "\\All", [
        "all mail",
        "[gmail]/all mail",
        "archive",
      ]),
  );
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
    // No numeric provider UID to act on (e.g. a thread whose only messages are
    // locally-composed outbound "sent:*" rows not yet echoed back by the
    // server). There is nothing to push provider-side; log so a genuinely
    // missing mapping is visible rather than silently swallowed.
    console.warn(
      `[email] applyMailboxThreadAction(${params.action}): no numeric provider UID among`,
      params.providerMessageIds,
      "— skipping provider-side flag change",
    );
    return;
  }

  // Retry across transient connection failures so a momentary Gmail
  // "too many simultaneous connections" spike doesn't silently drop the
  // read/archive/etc. from ever reaching the provider. Each attempt opens a
  // fresh connection via withImapClient.
  await withImapRetry(`thread-action:${params.action}`, () =>
    withImapClient(params.mailbox, async (client) => {
    const uidRange = uids.join(",");

    if (params.action === "mark_read") {
      await client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });
      return;
    }

    if (params.action === "archive") {
      // Resolve the real archive destination by special-use. On Gmail this is
      // [Gmail]/All Mail (moving there removes the \Inbox label = archive). If
      // no archive/all folder exists, there is nothing to move to — leave the
      // message where it is rather than throwing.
      const archivePath = await resolveArchiveMailboxPath(client);
      if (archivePath && archivePath !== (params.mailbox.sync_folder || "INBOX")) {
        await client.messageMove(uidRange, archivePath, { uid: true });
      }
      return;
    }

    if (params.action === "spam") {
      const junkPath = await resolveJunkMailboxPath(client);
      if (junkPath) {
        await client.messageMove(uidRange, junkPath, { uid: true });
      }
      return;
    }

    // delete → move to the Trash special-use folder; only if the account has no
    // trash folder do we hard-delete (\Deleted + expunge).
    const trashPath = await resolveTrashMailboxPath(client);
    if (trashPath && trashPath !== (params.mailbox.sync_folder || "INBOX")) {
      await client.messageMove(uidRange, trashPath, { uid: true });
    } else {
      await client.messageDelete(uidRange, { uid: true });
    }
    }),
  );
}

/**
 * Find the IMAP folder that backs a category label, creating it when missing.
 *
 * On Gmail an IMAP folder IS a label, so creating "Receipts" creates the
 * "Receipts" label and moving a message into it applies that label AND drops
 * `\Inbox` — exactly the "label it, then take it out of the Inbox" behavior we
 * want, in one operation. On plain IMAP servers there are no labels, so the
 * same move files the message into a folder of that name, which is the closest
 * faithful equivalent.
 *
 * Matching is case-insensitive against both the leaf name and the full path so
 * we reuse a label the user already made (including one nested under a parent)
 * instead of creating a near-duplicate beside it.
 */
type MailboxLabelCreator = MailboxLister & {
  mailboxCreate: (path: string) => Promise<{ path?: string }>;
};

export async function resolveOrCreateLabelMailboxPath(
  client: MailboxLabelCreator,
  labelName: string,
) {
  const wanted = labelName.trim();
  if (!wanted) return null;
  const normalized = wanted.toLowerCase();

  const listed = await client.list().catch(() => []);
  for (const mailbox of listed) {
    if (
      mailbox.name.trim().toLowerCase() === normalized ||
      mailbox.path.trim().toLowerCase() === normalized
    ) {
      return mailbox.path;
    }
  }

  try {
    const created = await client.mailboxCreate(wanted);
    return created?.path || wanted;
  } catch (error) {
    // A racing sync (or another client) may have just created it; treat an
    // already-exists as success and re-resolve rather than losing the move.
    const listedAfter = await client.list().catch(() => []);
    for (const mailbox of listedAfter) {
      if (
        mailbox.name.trim().toLowerCase() === normalized ||
        mailbox.path.trim().toLowerCase() === normalized
      ) {
        return mailbox.path;
      }
    }
    throw error;
  }
}

/**
 * Apply a category label to a thread's messages provider-side and take them out
 * of the Inbox.
 *
 * This is the provider half of Focus's inbox tabs: once Forge decides an email
 * is a Receipt / Newsletter / OTP / etc., the same decision is mirrored into
 * Gmail (and any other IMAP client reading the same account) so the user's
 * actual mailbox matches what they see here.
 *
 * Best-effort by design — the caller keeps the in-app categorization even if
 * the provider move fails, so a flaky IMAP connection can never lose a filing.
 */
export async function applyMailboxThreadLabel(params: {
  mailbox: MailboxTransportRow;
  providerMessageIds: string[];
  labelName: string;
}): Promise<{
  moved: boolean;
  labelPath?: string;
  uidMap: Map<string, string>;
}> {
  if (params.providerMessageIds.length === 0) {
    return { moved: false, uidMap: new Map<string, string>() };
  }

  const uids = params.providerMessageIds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (uids.length === 0) {
    // Locally-composed messages the server has never echoed back have no UID to
    // act on. Log rather than swallow so a genuinely broken mapping is visible.
    console.warn(
      `[email] applyMailboxThreadLabel(${params.labelName}): no numeric provider UID among`,
      params.providerMessageIds,
      "— skipping provider-side label",
    );
    return { moved: false, uidMap: new Map<string, string>() };
  }

  return withImapRetry(`thread-label:${params.labelName}`, () =>
    withImapClient(params.mailbox, async (client) => {
      const labelPath = await resolveOrCreateLabelMailboxPath(
        client,
        params.labelName,
      );
      const sourcePath = params.mailbox.sync_folder || "INBOX";
      if (!labelPath || labelPath === sourcePath) {
        return { moved: false, uidMap: new Map<string, string>() };
      }
      const result = await client.messageMove(uids.join(","), labelPath, {
        uid: true,
      });

      // A UID only means anything inside one folder: the message gets a fresh
      // uid in the label folder and its INBOX uid dies with the move. Servers
      // with UIDPLUS (Gmail included) hand back the source→destination mapping,
      // which the caller persists so attachments/read/delete keep working. When
      // a server omits it we still report the move; the caller then knows only
      // the folder changed and re-resolves by Message-ID on next need.
      const uidMap = new Map<string, string>();
      const rawMap = (result as { uidMap?: Map<number, number> })?.uidMap;
      if (rawMap && typeof rawMap.forEach === "function") {
        rawMap.forEach((destinationUid, sourceUid) => {
          uidMap.set(String(sourceUid), String(destinationUid));
        });
      }

      return { moved: true, labelPath, uidMap };
    }),
  );
}

export async function emptyMailboxTrash(mailbox: MailboxTransportRow) {
  const { client, release } = await acquireImapClient(mailbox);

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
    await release();
  }
}
