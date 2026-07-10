import { getAdminClient } from "@/lib/supabase/admin";
import {
  encryptMailboxCredentials,
  decryptMailboxCredentials,
} from "./crypto";
import type { ContactInput } from "./contacts";

// Google People API contact import via OAuth 2.0. Uses REST (fetch) so no extra deps.
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars and a redirect URI registered
// in the Google Cloud OAuth client. The People API must be enabled on the project.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PEOPLE_URL =
  "https://people.googleapis.com/v1/people/me/connections";
const SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleRedirectUri(): string {
  const base =
    process.env.GOOGLE_OAUTH_REDIRECT_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3244";
  return `${base.replace(/\/$/, "")}/api/email/contacts/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email || null;
  } catch {
    return null;
  }
}

/** Persist tokens for a user's Google account (encrypted at rest). */
export async function storeGoogleAccount(params: {
  userId: string;
  tokens: GoogleTokenResponse;
}): Promise<{ googleEmail: string | null }> {
  const admin = getAdminClient();
  const googleEmail = await fetchGoogleEmail(params.tokens.access_token);
  const expiresAt = new Date(
    Date.now() + (params.tokens.expires_in || 3600) * 1000,
  ).toISOString();

  const row: Record<string, unknown> = {
    user_id: params.userId,
    google_email: googleEmail || "unknown",
    access_token_encrypted: encryptMailboxCredentials({
      token: params.tokens.access_token,
    }),
    token_expires_at: expiresAt,
    scope: params.tokens.scope || SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  };
  if (params.tokens.refresh_token) {
    row.refresh_token_encrypted = encryptMailboxCredentials({
      token: params.tokens.refresh_token,
    });
  }

  await admin
    .from("contact_google_accounts")
    .upsert(row, { onConflict: "user_id,google_email" });
  return { googleEmail };
}

async function getValidAccessToken(userId: string): Promise<string> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("contact_google_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No connected Google account. Connect Google first.");

  const notExpired =
    data.token_expires_at && new Date(data.token_expires_at).getTime() > Date.now() + 60_000;
  if (notExpired && data.access_token_encrypted) {
    return (decryptMailboxCredentials(data.access_token_encrypted) as { token: string }).token;
  }

  if (!data.refresh_token_encrypted) {
    throw new Error("Google session expired and no refresh token is available. Reconnect Google.");
  }
  const refreshToken = (
    decryptMailboxCredentials(data.refresh_token_encrypted) as { token: string }
  ).token;
  const refreshed = await refreshAccessToken(refreshToken);
  await admin
    .from("contact_google_accounts")
    .update({
      access_token_encrypted: encryptMailboxCredentials({ token: refreshed.access_token }),
      token_expires_at: new Date(
        Date.now() + (refreshed.expires_in || 3600) * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);
  return refreshed.access_token;
}

/** Fetch all of the user's Google connections and map to ContactInput[]. */
export async function fetchGoogleContacts(userId: string): Promise<ContactInput[]> {
  const accessToken = await getValidAccessToken(userId);
  const contacts: ContactInput[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${GOOGLE_PEOPLE_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google People API error: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      connections?: any[];
      nextPageToken?: string;
    };
    for (const person of json.connections || []) {
      const name = person.names?.[0];
      const phone = person.phoneNumbers?.[0]?.value || null;
      for (const emailEntry of person.emailAddresses || []) {
        const email = String(emailEntry.value || "").trim().toLowerCase();
        if (!email || !email.includes("@")) continue;
        contacts.push({
          email,
          displayName: name?.displayName || null,
          firstName: name?.givenName || null,
          lastName: name?.familyName || null,
          phone,
          source: "google",
        });
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return contacts;
}

export async function markGoogleSynced(userId: string): Promise<void> {
  const admin = getAdminClient();
  await admin
    .from("contact_google_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);
}
