# Plan: Move Focus Forge to focusforge.dev, retire focusforge.theportlandcompany.com

Owner: Claude (autonomous, no HITL). Date: 2026-09-30.

## Decisions (made without HITL)

1. **App lives at the apex `https://focusforge.dev`.** `www.focusforge.dev` 308 → apex.
2. **Old host is retired for people, kept as a silent API alias.** Browser page loads (GET, non-`/api`, non-`/.well-known`, non-`/auth`) on
   `focusforge.theportlandcompany.com` 308 → same path on `focusforge.dev`. `/api/*`, `/.well-known/*`, `/auth/*` keep serving on the old host
   so installed iOS/macOS builds, PATs, MCP connectors, cron jobs and old magic links keep working.
3. **OAuth audience (`TPC_RESOURCE`) stays `https://focusforge.theportlandcompany.com`.** It is an identifier, not a URL we serve users from.
   TPC Auth binds every token/PAT to it; changing it invalidates every issued token. Follow-up: multi-audience support in TPC Auth.
4. **Marketing site** (`getfocusforge.theportlandcompany.com`) is out of scope for the cut-over (its CF account token is invalid); follow-up task.
5. **Outbound email sender** stays on the verified Resend domain until `focusforge.dev` is verified in Resend (follow-up).

## Phases and verification gates

| # | Work | Model | Verify (gate must pass before next phase) |
|---|------|-------|-------------------------------------------|
| 1 | DNS: CNAME `@` and `www` → Railway target (proxied) on zone `f591a2aa…` | Haiku | `dig`, CF API record list |
| 2 | Railway: add custom domains `focusforge.dev`, `www.focusforge.dev` | Haiku | Railway `domains` status + cert VALID; `curl -I https://focusforge.dev` 200/307 |
| 3 | TPC Auth: add `https://focusforge.dev/auth/callback` + post-logout URI; `apps.home_url` → new | Haiku | SQL read-back |
| 4 | Web code: canonical-host middleware, fallback URLs, OpenAPI servers, docs, smoke script, tests | Sonnet | `npm test` (middleware + auth-url tests), typecheck, build |
| 5 | Railway env: `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` → `https://focusforge.dev` | Haiku | GraphQL variables read-back |
| 6 | Deploy (push `production`) | Haiku | Railway deployment SUCCESS + build logs |
| 7 | Live verification | Sonnet | see matrix below |
| 8 | Electron shell: default URL → new, rebuild, relaunch | Haiku | process running, window loads focusforge.dev |
| 9 | iOS + native macOS: default base URL → new, release | Sonnet | builds pass; iOS tag → TestFlight run green + ASC build VALID |
| 10 | Notify Spencer (email; SMS blocked per memory) | Haiku | send receipt |

## Live verification matrix (phase 7)

- `https://focusforge.dev/` → login redirect to TPC Auth with `redirect_uri=https://focusforge.dev/auth/callback`
- `https://www.focusforge.dev/x?y=1` → 308 `https://focusforge.dev/x?y=1`
- `https://focusforge.theportlandcompany.com/today` → 308 `https://focusforge.dev/today`
- `https://focusforge.theportlandcompany.com/api/health` → 200 (not redirected)
- `https://focusforge.dev/api/health?strict=1` → 200, deps ok
- `/.well-known/oauth-protected-resource/mcp` on both hosts → resource unchanged
- PAT call `GET /api/mobile/tasks` on both hosts → 200
- Full browser login on focusforge.dev (minted session) → `/today` renders, no console errors
- TLS cert valid for apex + www
- Sentry: no new error spike 15 min post-deploy

## Rollback

Revert the middleware commit and push `production`; DNS/Railway domain additions are additive and harmless. Old host never stops serving.
