import { cookies } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  canWriteShare,
  isValidShareCookie,
  shareCookieName,
} from "@/lib/project-share";

/**
 * Authorization gate for the *unauthenticated* share-write endpoints.
 *
 * These routes are reachable by anyone holding a link, and they run under the
 * service-role client (which bypasses RLS), so this is the only thing standing
 * between a token and the database. Every check fails closed, and callers MUST
 * scope their writes to the returned `projectId` — never to a project id taken
 * from the request body.
 */

export type ShareWriteGrant =
  | { ok: true; shareId: string; projectId: string }
  | { ok: false; status: number; error: string };

export async function authorizeShareWrite(
  token: string,
): Promise<ShareWriteGrant> {
  if (!token) return { ok: false, status: 404, error: "Not found" };

  let share: {
    id: string;
    project_id: string;
    passcode_hash: string | null;
    revoked_at: string | null;
    expires_at: string | null;
    allow_public: boolean | null;
    permission: string | null;
  } | null = null;

  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("project_shares")
      .select(
        "id,project_id,passcode_hash,revoked_at,expires_at,allow_public,permission",
      )
      .eq("token", token)
      .maybeSingle();
    if (error) {
      console.error("Share write lookup failed:", error);
      return { ok: false, status: 500, error: "Lookup failed" };
    }
    share = data;
  } catch (error) {
    console.error("Share write lookup threw:", error);
    return { ok: false, status: 500, error: "Lookup failed" };
  }

  // Unknown, revoked, expired, non-public and read-only links are all reported
  // as 404 so a link that exists but cannot write is indistinguishable from one
  // that was never issued.
  if (!share || !canWriteShare(share)) {
    return { ok: false, status: 404, error: "Not found" };
  }

  // A passcode-protected link must have cleared the gate in this browser.
  if (share.passcode_hash) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(shareCookieName(token))?.value;
    if (!isValidShareCookie(token, cookieVal)) {
      return { ok: false, status: 401, error: "Passcode required" };
    }
  }

  return { ok: true, shareId: share.id, projectId: share.project_id };
}
