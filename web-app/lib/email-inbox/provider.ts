import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
// eslint-disable-next-line @typescript-eslint/no-var-requires -- nodemailer
// doesn't export MailComposer from its public entrypoint/types.
const MailComposer = require("nodemailer/lib/mail-composer");
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
  // IMAP UIDVALIDITY for the synced folder (RFC 9051 §7.4.1). A UID is only
  // stable to reuse as a resume point while this value is unchanged; when the
  // server reassigns UIDVALIDITY, every previously-remembered UID is
  // meaningless and the folder must be fully re-synced.
  uidValidity: number | null;
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

function buildImapClient(
  mailbox: MailboxTransportRow,
  options?: { maxIdleTime?: number },
): ImapFlow {
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
    // Short-lived connections (the default) have no use for ImapFlow's
    // auto-IDLE — every call here does its own fetch/search/append and hangs
    // up immediately after, so idling would just add chatter. The long-lived
    // watcher (watchMailboxForChanges) opts back in via maxIdleTime.
    disableAutoIdle: options?.maxIdleTime ? false : true,
    ...(options?.maxIdleTime ? { maxIdleTime: options.maxIdleTime } : {}),
  });
}

// Acquire a per-account connection slot and open a connected IMAP client. The
// caller MUST invoke the returned `release()` in a finally to close the socket
// and free the slot. Prefer withImapConnection() where the callback shape fits;
// this lower-level form exists for sites that manage their own folder locks.
async function acquireImapClient(
  mailbox: MailboxTransportRow,
  options?: { maxIdleTime?: number },
): Promise<{ client: ImapFlow; release: () => Promise<void> }> {
  const semaphore = getImapSemaphore(mailbox);
  await semaphore.acquire();
  const client = buildImapClient(mailbox, options);
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

// --- IMAP IDLE (RFC 9051 §6.3.13) -------------------------------------------
//
// A live mailbox should learn about new mail the moment the server pushes it,
// not wait for the next poll. watchMailboxForChanges() holds one long-lived
// connection open (from the same per-account semaphore as every other call
// here, so it still respects the connection cap) and lets ImapFlow's built-in
// IDLE support push 'exists'/'expunge' events as they arrive.
//
// Servers cap how long a single IDLE command may stay open before the client
// must re-issue it — RFC 9051 recommends clients re-issue at least every 29
// minutes. ImapFlow's `maxIdleTime` option does this automatically (it breaks
// and restarts IDLE on that interval), so no manual timer is needed here.
//
// If the server never advertises IDLE, there is nothing to watch — the caller
// is told via onUnsupported() so it can fall back to the existing poll loop.
// On an unexpected connection drop, this reconnects with a short backoff
// until stop() is called or a non-transient (e.g. auth) error occurs.
const IMAP_IDLE_REISSUE_MS = 28 * 60 * 1000; // under RFC 9051's ~29-minute limit
const IMAP_IDLE_RECONNECT_DELAY_MS = 5_000;

export type MailboxWatchHandle = {
  stop: () => Promise<void>;
};

export async function watchMailboxForChanges(
  mailbox: MailboxTransportRow,
  options: {
    // Called (debounced by the caller if desired) whenever the watched folder
    // reports new or removed messages while idling.
    onChange: () => void | Promise<void>;
    // Called once, synchronously with returning, if the server doesn't
    // advertise IDLE at all — the caller should keep polling.
    onUnsupported?: () => void | Promise<void>;
    // Called on any error while idling (including a dropped connection before
    // it's reconnected). Non-fatal — watching keeps retrying unless the error
    // is not transient (e.g. bad credentials), in which case it's rethrown
    // from the returned handle's background loop and surfaces via this hook.
    onError?: (error: unknown) => void;
    folder?: string;
  },
): Promise<MailboxWatchHandle> {
  let stopped = false;
  let stopCurrentSession: (() => void) | null = null;

  const runSession = async (): Promise<"unsupported" | "stopped"> => {
    const { client, release } = await acquireImapClient(mailbox, {
      maxIdleTime: IMAP_IDLE_REISSUE_MS,
    });

    try {
      if (!client.capabilities || !client.capabilities.has("IDLE")) {
        return "unsupported";
      }

      const lock = await client.getMailboxLock(options.folder || mailbox.sync_folder || "INBOX");
      try {
        return await new Promise<"stopped">((resolve, reject) => {
          const onUpdate = () => {
            Promise.resolve(options.onChange()).catch((error) =>
              options.onError?.(error),
            );
          };
          const onError = (error: unknown) => {
            cleanup();
            reject(error);
          };
          const onClose = () => {
            cleanup();
            reject(new Error("IMAP IDLE connection closed unexpectedly"));
          };
          const cleanup = () => {
            client.off("exists", onUpdate);
            client.off("expunge", onUpdate);
            client.off("error", onError);
            client.off("close", onClose);
          };

          client.on("exists", onUpdate);
          client.on("expunge", onUpdate);
          client.on("error", onError);
          client.on("close", onClose);

          stopCurrentSession = () => {
            cleanup();
            resolve("stopped");
          };
        });
      } finally {
        try {
          lock.release();
        } catch {
          // Connection may already be closed; nothing more to release.
        }
      }
    } finally {
      stopCurrentSession = null;
      await release();
    }
  };

  const loop = (async () => {
    while (!stopped) {
      let outcome: "unsupported" | "stopped";
      try {
        outcome = await runSession();
      } catch (error) {
        options.onError?.(error);
        if (!isTransientImapError(error) && stopped === false) {
          // Auth/protocol errors won't clear on retry — surface and stop.
          throw error;
        }
        if (stopped) break;
        await sleep(IMAP_IDLE_RECONNECT_DELAY_MS);
        continue;
      }

      if (outcome === "unsupported") {
        await options.onUnsupported?.();
        return;
      }
      if (outcome === "stopped") {
        return;
      }
    }
  })().catch((error) => {
    if (!stopped) {
      options.onError?.(error);
    }
  });

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      stopCurrentSession?.();
      await loop;
    },
  };
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

// UIDVALIDITY is a 32-bit unsigned integer per RFC 9051, so Number is always
// safe (well under Number.MAX_SAFE_INTEGER); ImapFlow reports it as a bigint.
export function normalizeUidValidity(
  value: number | string | bigint | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
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

  const uidValidity = normalizeUidValidity(
    raw.uidValidity as number | string | bigint | null | undefined,
  );

  return {
    highestUid,
    lastSeenAt,
    uidValidity,
  };
}

// Whether a previously-persisted cursor is still safe to resume from. A
// cursor with no remembered UIDVALIDITY (e.g. persisted before this field
// existed) is treated as still valid — it will pick up UIDVALIDITY tracking
// from this point on rather than forcing an immediate resync. Only an actual
// mismatch between two known values forces a discard.
export function isMailboxSyncCursorValidForUidValidity(
  previousUidValidity: number | null,
  currentUidValidity: number | null,
): boolean {
  if (previousUidValidity == null || currentUidValidity == null) return true;
  return previousUidValidity === currentUidValidity;
}

export function buildMailboxSyncCursor(params: {
  previousCursor?: unknown;
  fallbackLastSeenAt?: string | null;
  messages?: Array<Pick<NormalizedMailboxMessage, "receivedAt" | "sentAt">>;
  highestUid?: number | null;
  uidValidity?: number | string | bigint | null;
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

  const uidValidity =
    normalizeUidValidity(params.uidValidity) ?? previousCursor.uidValidity;

  return {
    highestUid: highestUid || null,
    lastSeenAt,
    uidValidity,
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
  const persistedCursor = normalizeMailboxSyncCursor(options?.syncCursor);
  const { client, release } = await acquireImapClient(mailbox);
  const lock = await client.getMailboxLock(mailbox.sync_folder || "INBOX");

  try {
    const currentUidValidity = normalizeUidValidity(
      (client.mailbox && client.mailbox.uidValidity) || undefined,
    );
    const cursorValid = isMailboxSyncCursorValidForUidValidity(
      persistedCursor.uidValidity,
      currentUidValidity,
    );

    if (!cursorValid) {
      console.warn(
        `[email] UIDVALIDITY changed for mailbox ${mailbox.id} folder ${mailbox.sync_folder || "INBOX"} (was ${persistedCursor.uidValidity}, now ${currentUidValidity}); discarding cursor and forcing a full resync`,
      );
    }

    // When UIDVALIDITY changed, the remembered UID and lastSeenAt are both
    // unsafe to resume from (every UID may now refer to a different message,
    // or none at all) — drop both so the fetch below falls through to a full
    // folder search instead of an incremental UID range or date filter.
    const previousCursor: MailboxSyncCursor = cursorValid
      ? persistedCursor
      : { highestUid: null, lastSeenAt: null, uidValidity: currentUidValidity };
    const effectiveLastSeenAt = cursorValid
      ? options?.lastSeenAt ?? null
      : null;

    let highestUid = previousCursor.highestUid;
    const messagePromises: Array<Promise<NormalizedMailboxMessage>> = [];
    const rangeStart =
      previousCursor.highestUid && previousCursor.highestUid > 0
        ? previousCursor.highestUid + 1
        : null;

    const fetchSequence =
      rangeStart && Number.isFinite(rangeStart) ? `${rangeStart}:*` : null;

    const fallbackSearchCriteria = effectiveLastSeenAt
      ? { since: new Date(effectiveLastSeenAt) }
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
          fallbackLastSeenAt: effectiveLastSeenAt,
          uidValidity: currentUidValidity,
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
        fallbackLastSeenAt: effectiveLastSeenAt,
        messages,
        highestUid,
        uidValidity: currentUidValidity,
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

/**
 * Permanently delete one draft from the provider's Drafts folder, by the uid
 * carried in its `draft:<uid>` provider id. Used when the user deletes a
 * provider-synced draft in Focus, so it doesn't reappear on the next sync.
 * Best-effort: returns false if the id isn't a provider draft or the folder is
 * unknown.
 */
export async function deleteMailboxDraftMessage(
  mailbox: MailboxTransportRow,
  providerMessageId: string,
  folderPath: string,
): Promise<boolean> {
  const match = /^draft:(\d+)$/.exec(providerMessageId || "");
  if (!match || !folderPath) return false;
  const uid = Number(match[1]);
  if (!Number.isFinite(uid) || uid <= 0) return false;

  return withImapRetry("draft-delete", () =>
    withImapConnection(mailbox, async (client) => {
      const lock = await client.getMailboxLock(folderPath);
      try {
        await client.messageDelete(String(uid), { uid: true });
        return true;
      } finally {
        lock.release();
      }
    }),
  );
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

// The AUTHORITATIVE set of unread UIDs in the synced folder — a single IMAP
// `SEARCH UNSEEN` over the whole folder (`{ seen: false }`), so the provider
// itself tells us exactly which messages lack `\Seen`. This is what makes the
// read-state reconcile match Gmail regardless of how many messages exist: no
// row-window sampling, no per-UID FETCH. Returns UID strings. A null/failed
// search returns null so the caller can distinguish "nothing unread" (empty
// set) from "couldn't ask" (null) and avoid clearing unread on a transient
// error.
export async function fetchMailboxUnseenUids(
  mailbox: MailboxTransportRow,
): Promise<Set<string> | null> {
  try {
    return await withImapClient(mailbox, async (client) => {
      const uids = await client.search({ seen: false }, { uid: true });
      const set = new Set<string>();
      for (const uid of Array.isArray(uids) ? uids : []) {
        const value = String(uid);
        if (value && value !== "0") set.add(value);
      }
      return set;
    });
  } catch (error) {
    // Surface WHY the unseen search failed rather than silently no-opping the
    // read-state reconcile (a null here skips the reconcile entirely).
    console.error(
      "[email-inbox] fetchMailboxUnseenUids failed",
      (error as Error)?.message || error,
    );
    return null;
  }
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

export type LiveMailboxMessage = {
  uid: number;
  date: string | null;
  from: string;
  fromEmail: string | null;
  subject: string;
  unread: boolean;
};

export type ReadMailboxFolderLiveResult = {
  folder: string;
  total: number;
  unseen: number;
  matched: number;
  messages: LiveMailboxMessage[];
};

/**
 * Reads a folder's message envelopes STRAIGHT FROM the provider over IMAP —
 * the live server-side state, NOT Focus Forge's synced/classified copy. This is
 * the durable, agent-runnable "check my email" primitive: it shows exactly what
 * the provider's INBOX / All Mail / Spam / Trash holds right now, bypassing
 * Forge's auto-archiving. Mirrors scripts/check-gmail.mjs but funnels through
 * the shared per-account connection cap.
 *
 * With `search`, returns envelopes matching subject OR from OR body; otherwise
 * the newest `limit`. Results are newest-first.
 */
export async function readMailboxFolderLive(
  mailbox: MailboxTransportRow,
  opts: { folder?: string; limit?: number; search?: string | null } = {},
): Promise<ReadMailboxFolderLiveResult> {
  const folder = opts.folder || mailbox.sync_folder || "INBOX";
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 200);
  const search = opts.search ? String(opts.search).trim() : "";

  return withImapConnection(mailbox, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const status = await client.status(folder, {
        messages: true,
        unseen: true,
      });

      let uids: number[];
      if (search) {
        uids = (await client.search(
          { or: [{ subject: search }, { from: search }, { body: search }] },
          { uid: true },
        )) as number[];
      } else {
        uids = (await client.search({ all: true }, { uid: true })) as number[];
      }
      uids = (Array.isArray(uids) ? uids : [])
        .sort((a, b) => a - b)
        .slice(-limit);

      const messages: LiveMailboxMessage[] = [];
      if (uids.length) {
        for await (const msg of client.fetch(
          uids,
          { uid: true, envelope: true, flags: true, internalDate: true },
          { uid: true },
        )) {
          const from = msg.envelope?.from?.[0];
          const flags =
            msg.flags instanceof Set ? msg.flags : new Set<string>();
          messages.push({
            uid: Number(msg.uid),
            date: (msg.internalDate || msg.envelope?.date || null)
              ? new Date(
                  (msg.internalDate || msg.envelope?.date) as Date,
                ).toISOString()
              : null,
            from: from
              ? `${from.name || ""} <${from.address || ""}>`.trim()
              : "(unknown)",
            fromEmail: from?.address ? String(from.address) : null,
            subject: msg.envelope?.subject || "(no subject)",
            unread: !flags.has("\\Seen"),
          });
        }
        messages.sort(
          (a, b) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
        );
      }

      return {
        folder,
        total: Number(status.messages) || 0,
        unseen: Number(status.unseen) || 0,
        matched: uids.length,
        messages,
      };
    } finally {
      lock.release();
    }
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

// Best-effort copy of a just-sent message into the mailbox's Sent folder for
// servers that don't do this themselves on SMTP submission (see
// shouldAppendSentCopy). Never throws — the message has already been sent
// successfully by the time this runs, so a Sent-folder mirroring failure is
// logged and swallowed rather than surfaced as a send failure.
async function appendSentCopyIfNeeded(params: {
  mailbox: MailboxTransportRow;
  raw: Buffer;
  messageId: string;
}): Promise<void> {
  try {
    await withImapConnection(params.mailbox, async (client) => {
      const sentPath = await resolveSentMailboxPath(client);
      if (!sentPath) {
        return;
      }

      const lock = await client.getMailboxLock(sentPath);
      try {
        const existing = await client
          .search({ header: { "message-id": params.messageId } } as any, {
            uid: true,
          })
          .catch(() => null);

        if (!shouldAppendSentCopy(existing as number[] | null)) {
          return;
        }

        await client.append(sentPath, params.raw, ["\\Seen"]);
      } finally {
        lock.release();
      }
    });
  } catch (error) {
    console.error(
      "[email] failed to append sent copy to Sent folder",
      error instanceof Error ? error.message : error,
    );
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

  const mailOptions = {
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
  };

  // Compose the raw RFC 5322 message ourselves so the exact bytes handed to
  // SMTP are also what we APPEND into Sent (when needed) — building it twice
  // (once for SMTP, once for IMAP) risks the two copies drifting, e.g. a
  // different Message-ID each time, which would break the dedup search below.
  const composed = new MailComposer(mailOptions).compile();
  const messageId = composed.messageId();
  const raw: Buffer = await new Promise((resolve, reject) => {
    composed.build((error: Error | null, message: Buffer) => {
      if (error) reject(error);
      else resolve(message);
    });
  });

  let info;
  try {
    info = await transport.sendMail({ ...mailOptions, raw, messageId });
  } catch (error) {
    throw translateSmtpSendError(error, params.mailbox.email_address);
  }

  await appendSentCopyIfNeeded({ mailbox: params.mailbox, raw, messageId });

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

function resolveSentMailboxPath(client: ImapFlow) {
  return resolveSpecialMailboxPath(client, "\\Sent", [
    "sent",
    "sent mail",
    "sent items",
    "sent messages",
    "[gmail]/sent mail",
  ]);
}

// Whether we need to APPEND our own copy of a just-sent message into Sent.
// Many providers (Gmail's SMTP submission, some hosted IMAP) copy a sent
// message into Sent automatically; others (plenty of generic/self-hosted IMAP
// servers) never do, and the sender would otherwise be missing their own
// outgoing mail. A Message-ID search of the Sent folder after sending tells us
// which case we're in: any hit means the server already copied it in, so
// appending again would create a duplicate.
export function shouldAppendSentCopy(
  existingSentSearchUids: number[] | null | undefined,
): boolean {
  return !Array.isArray(existingSentSearchUids) || existingSentSearchUids.length === 0;
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
      // Mark the message read on the server before filing it into Junk, so the
      // mailbox matches Focus (which treats spam as read) and the junk folder
      // isn't left showing an unread count. Flags travel with the message on a
      // server-side MOVE, so setting \Seen first keeps it read in Junk.
      await client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });
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
