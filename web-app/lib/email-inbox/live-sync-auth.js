const crypto = require("node:crypto");

function getLiveSyncSecret() {
  const secret =
    process.env.EMAIL_INBOX_LIVE_SYNC_SECRET ||
    process.env.EMAIL_INBOX_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "Missing EMAIL_INBOX_LIVE_SYNC_SECRET, EMAIL_INBOX_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return secret;
}

function buildLiveSyncToken(mailboxId) {
  return crypto
    .createHmac("sha256", getLiveSyncSecret())
    .update(String(mailboxId))
    .digest("hex");
}

function isValidLiveSyncToken(mailboxId, token) {
  if (!token) {
    return false;
  }

  const expected = buildLiveSyncToken(mailboxId);
  const provided = String(token).trim();

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(provided, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

module.exports = {
  buildLiveSyncToken,
  isValidLiveSyncToken,
};
