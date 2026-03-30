import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKeyMaterial() {
  const secret =
    process.env.EMAIL_INBOX_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "Missing EMAIL_INBOX_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptMailboxCredentials(payload: Record<string, unknown>) {
  const iv = crypto.randomBytes(12);
  const key = getKeyMaterial();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptMailboxCredentials(ciphertext: string) {
  const [ivRaw, authTagRaw, encryptedRaw] = ciphertext.split(".");
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted mailbox credentials");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKeyMaterial(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
}
