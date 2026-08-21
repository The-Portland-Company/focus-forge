# Mobile Auth & SSO (`/api/mobile/auth/**`)

The iOS app's login screen talks only to these endpoints. Supabase GoTrue is the
identity provider behind all of them, so provider configuration lives in Supabase
Auth — not in this codebase.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/mobile/auth/login` | Email + password sign-in. |
| `POST` | `/api/mobile/auth/register` | Email + password registration. |
| `POST` | `/api/mobile/auth/password/reset` | Email a recovery link that deep-links into the app. |
| `POST` | `/api/mobile/auth/password/update` | Set a new password using the recovery session (bearer token). |
| `GET` | `/api/mobile/auth/providers` | Which SSO providers are configured, in display order. |
| `GET` | `/api/mobile/auth/oauth/{provider}/url` | Authorize URL for a web SSO provider. |
| `POST` | `/api/mobile/auth/apple` | Exchange a native Sign in with Apple identity token. |
| `POST` | `/api/mobile/auth/refresh` | Trade a refresh token for a full session (tokens + user). |
| `POST` | `/api/mobile/auth/logout` | Revoke the session and unregister the push device. |

Every response uses the standard mobile envelope: `{ data, meta?, error }`.

### `POST /api/mobile/auth/register`

```jsonc
// request
{ "email": "a@b.com", "password": "at-least-8-chars", "first_name": "Ada", "last_name": "Lovelace" }

// 201 — project has email confirmation disabled
{ "data": { "status": "signed_in", "access_token": "…", "refresh_token": "…", "user": { … } }, "error": null }

// 202 — confirmation email sent, no session yet
{ "data": { "status": "confirmation_required", "email": "a@b.com" }, "error": null }

// 409 — address already has an account
{ "data": null, "error": { "code": "email_taken", "message": "…" } }
```

Supabase answers a signup for an existing address with a user that has **no
identities** rather than an error; that case is mapped to `email_taken` so the
app doesn't sit waiting for an email that never arrives.

### `GET /api/mobile/auth/providers`

Reads GoTrue's public `/auth/v1/settings` (cached 5 minutes) and returns only the
providers that are actually switched on:

```jsonc
{ "data": { "providers": [ { "id": "apple", "name": "Apple", "kind": "native" },
                            { "id": "google", "name": "Google", "kind": "web" } ] },
  "meta": { "degraded": false }, "error": null }
```

`kind: "native"` means the app has a first-party flow (Sign in with Apple);
everything else is `web`. If the settings call fails, the list comes back empty
with `meta.degraded: true` — the app falls back to email + password rather than
showing buttons that cannot complete.

The catalog of supported providers lives in `lib/mobile/auth-providers.ts`:
Apple, Google, Microsoft (`azure`), GitHub, GitLab, Bitbucket, Slack, Notion,
LinkedIn, Figma, Discord, Facebook. Adding another provider that GoTrue supports
is one entry in that array.

### `GET /api/mobile/auth/oauth/{provider}/url`

Returns `{ provider, url, redirect_to }`. `redirect_to` defaults to
`focusforge://auth-callback` and **must** use the `focusforge://` scheme — any
other target is rejected with `invalid_redirect`, because the redirect receives a
real session.

The URL points at GoTrue's `/auth/v1/authorize`, which runs the implicit flow:
the provider redirects back to `focusforge://auth-callback#access_token=…&refresh_token=…`.
The app reads the fragment and calls `/api/mobile/auth/refresh` with the refresh
token to get a normalized session including the user record. Nothing PKCE-shaped
is stored server-side, so the endpoint stays stateless.

### Password recovery

1. App → `POST /api/mobile/auth/password/reset` with the email.
   Always answers `200` regardless of whether the account exists.
2. Supabase emails a link that redirects to `focusforge://password-reset#access_token=…&type=recovery`.
3. App opens its "choose a new password" sheet and calls
   `POST /api/mobile/auth/password/update` with that access token as the bearer
   and the new password. Only the token holder's own password can change.

## Supabase configuration runbook

For each provider you want on the login screen:

1. **Supabase → Authentication → Providers** → enable the provider and paste its
   client id/secret. The callback URL to register with the provider is
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → URL Configuration → Redirect URLs** → add:
   - `focusforge://auth-callback`
   - `focusforge://password-reset`
   Without these, GoTrue refuses to redirect back into the app.
3. Provider-specific notes:
   - **Apple** — the Supabase Apple provider's authorized client IDs must include
     the app bundle id `com.theportlandcompany.focusforge` (native token exchange)
     as well as the Services ID used for the web flow.
   - **Microsoft (`azure`)** — register the app in Entra ID, allow the
     `offline_access` scope, and use the "common" tenant unless the org is
     single-tenant.
   - **GitHub** — the OAuth app needs `read:user` and `user:email`, otherwise the
     account arrives without an email address.
4. Nothing needs to ship in this repo: `/api/mobile/auth/providers` picks the
   change up within 5 minutes (or on next cold start), and the login screen
   renders the new button with a neutral badge even for ids the app has no
   artwork for.

## Testing

`lib/__tests__/mobile-auth-providers.test.ts` covers the redirect allowlist, the
authorize-URL shape, alias handling (`slack` vs `slack_oidc`), and the degraded
fallback. Run with `npm test`.
