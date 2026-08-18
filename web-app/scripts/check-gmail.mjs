#!/usr/bin/env node
// Durable, agent-runnable Gmail check — NO human re-auth, ever.
//
// Reads the mailbox row + its AES-256-GCM-encrypted credentials straight from
// Supabase (service-role) and connects to Gmail over IMAP with the app password
// Focus Forge already stores. This deliberately does NOT use the claude.ai Gmail
// MCP (which expires and needs interactive re-auth) — the only secrets it needs
// are already in the project .env and never expire until the user revokes the
// Gmail app password.
//
// Usage (run from web-app/, which has the .env + node_modules):
//   node scripts/check-gmail.mjs [--folder INBOX] [--limit 20] [--search "text"]
//     [--mailbox <email-or-uuid>] [--json]
//
// Env required (already in web-app/.env):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROJECT_REF,
//   SUPABASE_DB_PASSWORD   (SUPABASE_SERVICE_ROLE_KEY also decrypts the creds,
//                           matching lib/email-inbox/crypto.ts getKeyMaterial)
//
// Examples:
//   node scripts/check-gmail.mjs --limit 10
//   node scripts/check-gmail.mjs --search "loy moore" --folder "[Gmail]/All Mail"
//   node scripts/check-gmail.mjs --json --limit 25   (machine-readable output)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- tiny .env loader (no dep) -------------------------------------------------
function loadEnv() {
  // .env may live in web-app/ or the repo root (focus-forge-web/).
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

// --- args ---------------------------------------------------------------------
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const FOLDER = arg("folder", "INBOX");
const LIMIT = Number(arg("limit", 20));
const SEARCH = arg("search", null);
const MAILBOX = arg("mailbox", null); // email or uuid; default = first gmail mailbox
const AS_JSON = Boolean(arg("json", false));

// --- crypto (mirrors lib/email-inbox/crypto.ts) -------------------------------
function keyMaterial() {
  const secret =
    process.env.EMAIL_INBOX_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing EMAIL_INBOX_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY");
  return crypto.createHash("sha256").update(secret).digest();
}
function decryptCredentials(ciphertext) {
  const [iv, tag, enc] = String(ciphertext).split(".");
  if (!iv || !tag || !enc) throw new Error("Invalid encrypted credentials");
  const d = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8"),
  );
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let q = supabase
    .from("mailboxes")
    .select(
      "id,email_address,login_username,provider,imap_host,imap_port,imap_secure,sync_folder,credentials_encrypted,last_synced_at",
    );
  if (MAILBOX) {
    q = MAILBOX.includes("@") ? q.eq("email_address", MAILBOX) : q.eq("id", MAILBOX);
  } else {
    q = q.eq("provider", "gmail");
  }
  const { data: rows, error } = await q.limit(1);
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  const mb = rows?.[0];
  if (!mb) throw new Error("No matching mailbox found");

  const creds = decryptCredentials(mb.credentials_encrypted);
  const auth = creds.password
    ? { user: mb.login_username || mb.email_address, pass: String(creds.password) }
    : creds.accessToken
      ? { user: mb.login_username || mb.email_address, accessToken: String(creds.accessToken) }
      : null;
  if (!auth) throw new Error("Mailbox has no usable IMAP password/token");

  const client = new ImapFlow({
    host: mb.imap_host || "imap.gmail.com",
    port: Number(mb.imap_port) || 993,
    secure: mb.imap_secure !== false,
    auth,
    logger: false,
  });

  await client.connect();
  const result = { mailbox: mb.email_address, folder: FOLDER, lastSyncedAt: mb.last_synced_at, messages: [] };
  try {
    const lock = await client.getMailboxLock(FOLDER);
    try {
      const status = await client.status(FOLDER, { messages: true, unseen: true });
      result.totalInFolder = status.messages;
      result.unseenInFolder = status.unseen;

      // Which UIDs to render: search matches, else the newest `LIMIT`.
      let uids;
      if (SEARCH) {
        uids = await client.search({ or: [{ subject: SEARCH }, { from: SEARCH }, { body: SEARCH }] }, { uid: true });
      } else {
        uids = await client.search({ all: true }, { uid: true });
      }
      uids = (Array.isArray(uids) ? uids : []).sort((a, b) => a - b).slice(-LIMIT);
      result.matched = uids.length;

      for await (const msg of client.fetch(
        uids.length ? uids : "1:1",
        { uid: true, envelope: true, flags: true, internalDate: true },
        { uid: true },
      )) {
        if (!uids.length) break;
        const from = msg.envelope?.from?.[0];
        result.messages.push({
          uid: msg.uid,
          date: (msg.internalDate || msg.envelope?.date || null),
          from: from ? `${from.name || ""} <${from.address || ""}>`.trim() : "(unknown)",
          subject: msg.envelope?.subject || "(no subject)",
          unread: !(msg.flags && (msg.flags.has ? msg.flags.has("\\Seen") : [...msg.flags].includes("\\Seen"))),
        });
      }
      result.messages.sort((a, b) => new Date(b.date) - new Date(a.date));
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  if (AS_JSON) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Mailbox: ${result.mailbox}  |  folder: ${result.folder}`);
  console.log(`Folder total: ${result.totalInFolder}  unseen: ${result.unseenInFolder}  |  FF last synced: ${result.lastSyncedAt}`);
  if (SEARCH) console.log(`Search "${SEARCH}" → ${result.matched} match(es)`);
  console.log(`Newest ${result.messages.length}:`);
  for (const m of result.messages) {
    const d = m.date ? new Date(m.date).toISOString().replace("T", " ").slice(0, 16) : "?";
    console.log(`  ${d}  ${m.unread ? "●" : " "} ${m.from}  —  ${m.subject}`);
  }
}

main().catch((e) => {
  console.error("check-gmail failed:", e.message);
  process.exit(1);
});
