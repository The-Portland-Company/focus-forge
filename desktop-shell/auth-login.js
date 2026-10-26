// System-browser OIDC Authorization Code + PKCE login for the Focus: Forge
// shell. The embedded browser cannot pass the Cloudflare Turnstile on TPC Auth,
// so login runs in the user's default browser and the resulting tokens are
// written into the app session as the same two cookies the web app uses.
const crypto = require("crypto");
const { shell, session } = require("electron");

const AUTH_BASE = "https://auth.theportlandcompany.com";
const AUTH_HOST = new URL(AUTH_BASE).host;
const CLIENT_ID = "focus-forge-desktop";
const REDIRECT_URI = "focusforge://auth-callback";
const SCOPE = "openid profile email offline_access";
const RESOURCE = "https://app.focusforge.dev";
const COOKIE_URL = "https://app.focusforge.dev";
const ACCESS_COOKIE = "ff_at";
const REFRESH_COOKIE = "ff_rt";
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
// Ignore a second startLogin() inside this window so a burst of redirects
// cannot open a pile of browser tabs.
const START_DEBOUNCE_MS = 3000;

const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let pending = null; // { verifier, state, startedAt }

function startLogin() {
  if (pending && Date.now() - pending.startedAt < START_DEBOUNCE_MS) return;
  const verifier = b64url(crypto.randomBytes(32)); // 43 chars
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  pending = { verifier, state, startedAt: Date.now() };

  const url = new URL(AUTH_BASE + "/oauth/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  }).toString();
  shell.openExternal(url.toString());
}

async function setSessionCookies(tokens) {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    url: COOKIE_URL,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  };
  const cookies = session.defaultSession.cookies;
  await cookies.set({
    ...base,
    name: ACCESS_COOKIE,
    value: tokens.access_token,
    expirationDate: now + (Number(tokens.expires_in) || 900),
  });
  if (tokens.refresh_token) {
    await cookies.set({
      ...base,
      name: REFRESH_COOKIE,
      value: tokens.refresh_token,
      expirationDate: now + REFRESH_TTL_SECONDS,
    });
  }
}

// Returns true if the URL was a login callback (handled or rejected).
async function handleCallback(rawUrl, onSignedIn) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "focusforge:" || u.host !== "auth-callback") return false;

  const flow = pending;
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const error = u.searchParams.get("error");
  if (error) {
    console.error("Login failed:", error, u.searchParams.get("error_description"));
    pending = null;
    return true;
  }
  if (!flow || !code || !state || state !== flow.state) {
    console.error("Login callback rejected: no pending flow or state mismatch");
    return true;
  }
  pending = null; // one-shot: a replayed callback finds nothing pending

  try {
    const res = await fetch(AUTH_BASE + "/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: flow.verifier,
        resource: RESOURCE,
      }).toString(),
    });
    if (!res.ok) {
      console.error("Token exchange failed:", res.status, await res.text());
      return true;
    }
    const tokens = await res.json();
    if (!tokens.access_token) {
      console.error("Token response had no access_token");
      return true;
    }
    await setSessionCookies(tokens);
    onSignedIn();
  } catch (err) {
    console.error("Token exchange error:", err);
  }
  return true;
}

module.exports = { startLogin, handleCallback, AUTH_HOST };
