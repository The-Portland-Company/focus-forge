#!/usr/bin/env node

const { ImapFlow } = require("imapflow");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("node:crypto");
const { buildLiveSyncToken } = require("./lib/email-inbox/live-sync-auth.js");

const PORT = Number(process.env.PORT || 3244);
const SYNC_ENDPOINT_BASE = `http://127.0.0.1:${PORT}`;
const REFRESH_INTERVAL_MS = 60 * 1000;
const MIN_RECONNECT_DELAY_MS = 5 * 1000;
const MAX_RECONNECT_DELAY_MS = 60 * 1000;

let stopping = false;
const watchers = new Map();

function getMailboxKey() {
  const secret =
    process.env.EMAIL_INBOX_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "Missing EMAIL_INBOX_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for mailbox live sync worker",
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function decryptMailboxCredentials(ciphertext) {
  const [ivRaw, authTagRaw, encryptedRaw] = String(ciphertext || "").split(".");
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted mailbox credentials");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getMailboxKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase admin credentials for live sync worker");
  }

  return createClient(url.trim(), key.trim(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createImapClient(mailbox) {
  const credentials = decryptMailboxCredentials(mailbox.credentials_encrypted);

  return new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port || 993),
    secure: Boolean(mailbox.imap_secure),
    auth: {
      user: mailbox.login_username,
      pass: String(credentials.password || ""),
    },
    logger: false,
    emitLogs: false,
    maxIdleTime: 29 * 60 * 1000,
  });
}

async function triggerMailboxSync(mailboxId, reason) {
  const response = await fetch(
    `${SYNC_ENDPOINT_BASE}/api/internal/email/mailboxes/${mailboxId}/sync`,
    {
      method: "POST",
      headers: {
        "x-email-live-sync-token": buildLiveSyncToken(mailboxId),
      },
    },
  );

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(
      `Live sync trigger failed for ${mailboxId} (${reason}): ${response.status} ${payload}`,
    );
  }

  return response.json().catch(() => ({}));
}

async function connectWatcher(mailbox) {
  const existing = watchers.get(mailbox.id);
  if (existing?.active) {
    return;
  }

  const state = existing || {
    mailboxId: mailbox.id,
    reconnectDelayMs: MIN_RECONNECT_DELAY_MS,
    client: null,
    active: false,
    syncing: false,
    version: mailbox.updated_at,
  };

  state.version = mailbox.updated_at;
  state.active = true;
  watchers.set(mailbox.id, state);

  const client = createImapClient(mailbox);
  state.client = client;

  const queueSync = async (reason) => {
    if (state.syncing || stopping) {
      return;
    }

    state.syncing = true;
    try {
      await triggerMailboxSync(mailbox.id, reason);
    } catch (error) {
      console.error("[EmailLiveSync] sync trigger failed", {
        mailboxId: mailbox.id,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      state.syncing = false;
    }
  };

  client.on("exists", (event) => {
    if (event.count > event.prevCount) {
      void queueSync("exists");
    }
  });

  client.on("error", (error) => {
    console.error("[EmailLiveSync] IMAP watcher error", {
      mailboxId: mailbox.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  client.on("close", () => {
    if (stopping) {
      return;
    }

    state.active = false;
    state.client = null;
    const delay = Math.min(state.reconnectDelayMs, MAX_RECONNECT_DELAY_MS);
    state.reconnectDelayMs = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);

    setTimeout(() => {
      if (stopping) {
        return;
      }
      void connectWatcher(mailbox);
    }, delay);
  });

  try {
    await client.connect();
    await client.mailboxOpen(mailbox.sync_folder || "INBOX");
    state.reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
    console.log("[EmailLiveSync] watching mailbox", {
      mailboxId: mailbox.id,
      email: mailbox.email_address,
      folder: mailbox.sync_folder || "INBOX",
    });
    await queueSync("startup");
  } catch (error) {
    state.active = false;
    state.client = null;
    console.error("[EmailLiveSync] failed to start watcher", {
      mailboxId: mailbox.id,
      error: error instanceof Error ? error.message : String(error),
    });

    const delay = Math.min(state.reconnectDelayMs, MAX_RECONNECT_DELAY_MS);
    state.reconnectDelayMs = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);

    setTimeout(() => {
      if (stopping) {
        return;
      }
      void connectWatcher(mailbox);
    }, delay);
  }
}

async function stopWatcher(mailboxId) {
  const state = watchers.get(mailboxId);
  if (!state) {
    return;
  }

  watchers.delete(mailboxId);
  state.active = false;

  if (state.client) {
    try {
      await state.client.logout();
    } catch {
      // ignore shutdown errors
    }
  }
}

async function refreshWatchers() {
  const supabase = createAdminClient();
  const { data: mailboxes, error } = await supabase
    .from("mailboxes")
    .select(
      "id,email_address,login_username,credentials_encrypted,imap_host,imap_port,imap_secure,sync_folder,auto_sync_enabled,updated_at",
    )
    .eq("auto_sync_enabled", true)
    .not("imap_host", "is", null)
    .not("login_username", "is", null)
    .not("credentials_encrypted", "is", null);

  if (error) {
    throw error;
  }

  const nextMailboxIds = new Set((mailboxes || []).map((mailbox) => mailbox.id));

  for (const [mailboxId] of watchers) {
    if (!nextMailboxIds.has(mailboxId)) {
      await stopWatcher(mailboxId);
    }
  }

  for (const mailbox of mailboxes || []) {
    const current = watchers.get(mailbox.id);
    if (current?.version && current.version !== mailbox.updated_at) {
      await stopWatcher(mailbox.id);
    }

    if (!watchers.get(mailbox.id)) {
      void connectWatcher(mailbox);
    }
  }
}

async function run(options = {}) {
  const exitOnShutdown = options.exitOnShutdown !== false;
  const registerSignalHandlers = options.registerSignalHandlers !== false;

  console.log("[EmailLiveSync] worker starting");
  await refreshWatchers();

  const timer = setInterval(() => {
    void refreshWatchers().catch((error) => {
      console.error("[EmailLiveSync] watcher refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, REFRESH_INTERVAL_MS);

  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    clearInterval(timer);
    await Promise.all(Array.from(watchers.keys()).map((mailboxId) => stopWatcher(mailboxId)));
    if (exitOnShutdown) {
      process.exit(0);
    }
  };

  if (registerSignalHandlers) {
    process.on("SIGTERM", () => void shutdown());
    process.on("SIGINT", () => void shutdown());
  }

  return shutdown;
}

module.exports = {
  startEmailLiveSyncWorker: run,
};

if (require.main === module) {
  run({ exitOnShutdown: true, registerSignalHandlers: true }).catch((error) => {
    console.error("[EmailLiveSync] worker crashed", error);
    process.exit(1);
  });
}
