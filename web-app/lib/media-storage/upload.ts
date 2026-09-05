import { resolveStorageAccount } from "./config";

/**
 * Server-side upload of a captured proof file to an organization's own Snap
 * Shoot Share storage account. The SSS Worker's multi-tenant mode accepts a
 * per-account `tpc_live_` bearer token and files the object under that account's
 * tenant prefix, returning a signed share URL — so no Worker change is needed.
 */

export interface ProofUploadResult {
  url: string;
  key?: string;
  provider: "snap-shoot-share";
}

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

/**
 * Upload to the org's configured storage account. Returns null when the org has
 * no account configured, so callers can fall back to the default Supabase
 * task-attachments bucket. Throws only on a real upload failure.
 */
export async function uploadToOrgStorage(
  mediaStorageRaw: unknown,
  file: { bytes: Buffer | Uint8Array; name: string; mime: string },
): Promise<ProofUploadResult | null> {
  const account = resolveStorageAccount(mediaStorageRaw);
  if (!account) return null;

  const ext = extFromName(file.name);
  const endpoint = account.endpoint.replace(/\/$/, "");
  const res = await fetch(`${endpoint}/upload?ext=${encodeURIComponent(ext)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.token}`,
      "Content-Type": file.mime || "application/octet-stream",
    },
    body: file.bytes,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Snap Shoot Share upload failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    url?: string;
    key?: string;
  };
  if (!json.url) {
    throw new Error("Snap Shoot Share upload returned no url");
  }
  return { url: json.url, key: json.key, provider: "snap-shoot-share" };
}
