import {
  encryptMailboxCredentials,
  decryptMailboxCredentials,
} from "@/lib/email-inbox/crypto";

/**
 * Per-organization media storage account (organizations.media_storage JSONB).
 *
 * Proof capture stores media in the Snap Shoot Share R2 Worker using each org's
 * OWN account token, so one org's uploads never land in another org's account.
 * The token lives only as AES-256-GCM ciphertext; it is never returned to the
 * browser. Today the only provider is Snap Shoot Share; the shape leaves room
 * for BYO R2 / other providers later.
 */

export type MediaStorageProvider = "snap-shoot-share";

/** Default TPC-hosted Snap Shoot Share storage Worker (ManagedHostingService). */
export const DEFAULT_SSS_ENDPOINT =
  "https://snap-shoot-share-api.the-portland-company.workers.dev";

/** Full document persisted in organizations.media_storage. Secret-bearing. */
export interface OrgMediaStorageStored {
  provider?: MediaStorageProvider;
  endpoint?: string;
  label?: string;
  /** encryptMailboxCredentials({ token }) — the Snap Shoot Share tpc_live_ token. */
  tokenCipher?: string;
  updatedAt?: string;
}

/** Safe view returned by GET — carries no secret material. */
export interface OrgMediaStorageStatus {
  provider: MediaStorageProvider;
  endpoint: string;
  label: string;
  /** True once a token has been stored for this org. */
  configured: boolean;
  updatedAt: string | null;
}

function asDoc(raw: unknown): OrgMediaStorageStored {
  return raw && typeof raw === "object"
    ? (raw as OrgMediaStorageStored)
    : {};
}

/** Project the stored document down to a token-free status for the client. */
export function toStatus(raw: unknown): OrgMediaStorageStatus {
  const doc = asDoc(raw);
  return {
    provider: "snap-shoot-share",
    endpoint:
      typeof doc.endpoint === "string" && doc.endpoint.trim()
        ? doc.endpoint.trim()
        : DEFAULT_SSS_ENDPOINT,
    label: typeof doc.label === "string" ? doc.label : "",
    configured: typeof doc.tokenCipher === "string" && doc.tokenCipher.length > 0,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : null,
  };
}

/**
 * Merge an incoming PUT body onto the previous document. A blank/absent `token`
 * preserves the existing ciphertext (so editing the label doesn't require
 * re-entering the token); a non-blank `token` replaces it.
 */
export function buildStoredDoc(
  body: { endpoint?: unknown; label?: unknown; token?: unknown },
  previousRaw: unknown,
): OrgMediaStorageStored {
  const previous = asDoc(previousRaw);
  const endpoint =
    typeof body.endpoint === "string" && body.endpoint.trim()
      ? body.endpoint.trim()
      : previous.endpoint || DEFAULT_SSS_ENDPOINT;
  const label =
    typeof body.label === "string" ? body.label.trim() : previous.label || "";
  let tokenCipher = previous.tokenCipher;
  if (typeof body.token === "string" && body.token.trim()) {
    tokenCipher = encryptMailboxCredentials({ token: body.token.trim() });
  }
  return {
    provider: "snap-shoot-share",
    endpoint,
    label,
    ...(tokenCipher ? { tokenCipher } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Server-only: decrypt the org's storage token for an upload. Returns null when
 * no account is configured or the ciphertext can't be read, so callers fall
 * back to the default Forge attachment bucket.
 */
export function resolveStorageAccount(
  raw: unknown,
): { token: string; endpoint: string } | null {
  const doc = asDoc(raw);
  if (!doc.tokenCipher) return null;
  try {
    const payload = decryptMailboxCredentials(doc.tokenCipher);
    const token = typeof payload.token === "string" ? payload.token : "";
    if (!token) return null;
    return { token, endpoint: doc.endpoint || DEFAULT_SSS_ENDPOINT };
  } catch {
    return null;
  }
}
