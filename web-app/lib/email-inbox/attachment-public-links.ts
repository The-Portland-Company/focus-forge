import { getAdminClient } from "@/lib/supabase/admin";
import { generateShareToken } from "@/lib/project-share";
import { getAttachmentMetaForUser } from "@/lib/email-inbox/server";

const TABLE = "email_attachment_public_links";

export type AttachmentPublicLink = {
  token: string;
  filename: string | null;
  contentType: string | null;
};

/**
 * Mint (or reuse) a public share link for one email attachment.
 *
 * Verifies the user can access the (message, attachment) first. If an active
 * (non-revoked, non-expired) link the user already created exists for this
 * exact attachment, its token is reused so repeated clicks don't spawn a pile
 * of links; otherwise a fresh unguessable token is minted. Returns the token —
 * the caller builds the absolute URL from the request host.
 */
export async function createOrGetAttachmentPublicLink(
  userId: string,
  messageId: string,
  attachmentIndex: number,
): Promise<AttachmentPublicLink> {
  // Access check + filename/content-type + mailbox scope (throws if not visible).
  const meta = await getAttachmentMetaForUser(userId, messageId, attachmentIndex);
  const admin = getAdminClient();

  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from(TABLE)
    .select("token,filename,content_type,expires_at,revoked_at")
    .eq("message_id", messageId)
    .eq("attachment_index", attachmentIndex)
    .eq("created_by", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existing?.token &&
    (!existing.expires_at || existing.expires_at > nowIso)
  ) {
    return {
      token: existing.token,
      filename: existing.filename ?? meta.filename,
      contentType: existing.content_type ?? meta.contentType,
    };
  }

  const token = generateShareToken();
  const { error } = await admin.from(TABLE).insert({
    token,
    message_id: messageId,
    attachment_index: attachmentIndex,
    filename: meta.filename,
    content_type: meta.contentType,
    mailbox_id: meta.mailboxId,
    created_by: userId,
  });
  if (error) {
    throw new Error(error.message);
  }

  return { token, filename: meta.filename, contentType: meta.contentType };
}

/**
 * Does the user currently have an active (non-revoked, non-expired) public link
 * for this exact (message, attachment)? Cheap existence check used by the UI to
 * decide whether to show the "Revoke public link" affordance. Verifies access
 * first so a caller can't probe attachments they can't see.
 */
export async function hasActiveAttachmentPublicLink(
  userId: string,
  messageId: string,
  attachmentIndex: number,
): Promise<boolean> {
  // Access check (throws if not visible) — same gate as create.
  await getAttachmentMetaForUser(userId, messageId, attachmentIndex);
  const admin = getAdminClient();

  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from(TABLE)
    .select("token,expires_at")
    .eq("message_id", messageId)
    .eq("attachment_index", attachmentIndex)
    .eq("created_by", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Boolean(data?.token && (!data.expires_at || data.expires_at > nowIso));
}

/**
 * Revoke the user's active public link(s) for one attachment by stamping
 * `revoked_at = now()`. Scoped to `created_by = user`, so a user can only revoke
 * links they minted. Verifies the user can still access the attachment first
 * (same gate as create). Returns how many links were revoked (0 when none were
 * active). Once revoked, the public download route 404s.
 */
export async function revokeAttachmentPublicLink(
  userId: string,
  messageId: string,
  attachmentIndex: number,
): Promise<{ revoked: number }> {
  // Access check + mailbox scope (throws if not visible) — same gate as create.
  await getAttachmentMetaForUser(userId, messageId, attachmentIndex);
  const admin = getAdminClient();

  const { data, error } = await admin
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("message_id", messageId)
    .eq("attachment_index", attachmentIndex)
    .eq("created_by", userId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return { revoked: data?.length ?? 0 };
}

export type ResolvedAttachmentLink = {
  messageId: string;
  attachmentIndex: number;
  filename: string | null;
  contentType: string | null;
};

/**
 * Resolve an active public-link token to its (message, attachment). Returns
 * null when the token is unknown, revoked, or expired. Best-effort bumps the
 * access counter. The caller (public route) then streams the file with the
 * admin path — the token is the only authorization.
 */
export async function resolveActiveAttachmentPublicLink(
  token: string,
): Promise<ResolvedAttachmentLink | null> {
  if (!token || token.length < 16) return null;
  const admin = getAdminClient();

  const { data: row } = await admin
    .from(TABLE)
    .select(
      "id,message_id,attachment_index,filename,content_type,expires_at,revoked_at,access_count",
    )
    .eq("token", token)
    .maybeSingle();

  if (!row?.message_id) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  // Best-effort audit — never block the download on it.
  void admin
    .from(TABLE)
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (Number(row.access_count) || 0) + 1,
    })
    .eq("id", row.id);

  return {
    messageId: String(row.message_id),
    attachmentIndex: Number(row.attachment_index),
    filename: row.filename ?? null,
    contentType: row.content_type ?? null,
  };
}
