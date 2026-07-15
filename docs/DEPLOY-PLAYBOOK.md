# Focus: Forge — Deploy Playbook

Durable rules for agents and humans shipping the web app (`web-app/`) to production.

**Production:** https://focusforge.theportlandcompany.com  
**Path:** push to `production` → GitHub Actions → Railway (service `app`).  
**Health:** `GET /api/health` (expect 200; inspect payload for `build.git_commit` when debugging).

---

## 1. Batch deploys

- Ship **one production push per work slice** (or end of session), not after every small UI tweak.
- Local commits are fine mid-slice. Production push is the expensive gate.
- Prefer finishing the feature/fix + targeted verification, then one push.

---

## 2. Local vs CI gates

| When | What runs | Notes |
| --- | --- | --- |
| **Every commit** | gitleaks (if available), RLS pre-commit hook on `*.sql`, cheap lint/typecheck if needed | Keep hooks fast. Do not block typing on full builds. |
| **Before production push** | Targeted tests for touched areas | Unit/integration for the files you changed. Fix failures before push. |
| **CI / Railway** | Full Next.js build + deploy + smoke | Source of truth for “it builds in prod.” |
| **Release gate only** | Full `npm run check:precommit` (tests + full build + gitleaks) | **Never** treat this as a per-keystroke or every-commit hook. Use before a deliberate release push when you want a full local dry-run. |

Do **not** run a full `next build` after every edit unless the change is build-sensitive (config, middleware, env, import graph). Prefer targeted tests and typecheck on touched paths.

---

## 3. Failure classification (before another push)

When deploy or smoke fails:

1. **Read health + container/deploy logs first** (GitHub Actions run, Railway deploy/build logs). Do not guess.
2. Classify, then act:

| Signal | Treat as | Action |
| --- | --- | --- |
| `PGRST002`, schema cache stale, DB timeout, Supabase/PostgREST errors | **Infra / DB** | Fix Supabase/PostgREST (reload schema, migration, connectivity). **Do not** push app commits to “retry.” |
| Build error, TypeScript error, missing module, Next compile failure | **App** | Fix code locally → **one** push. |
| Health green but middleware still gates a public route / wrong behavior | **Deploy identity / config** | Compare health `build.git_commit` to the SHA you expected. Only then consider cache-bust or config fixes—not blind redeploys. |

**Max one automatic/redeploy attempt after a real fix.** Do not thrash the pipeline.

---

## 4. Watch one run only

- After push, watch **one** GitHub Actions deploy run to completion.
- Concurrency already cancels in-progress deploys for the same workflow; stacking watchers and re-pushes wastes queue time and obscures the failing SHA.
- Do not open parallel “just in case” redeploys while the first is still running.

---

## 5. Smoke once after green

When the deploy run is green:

1. `GET /api/health` → **200**
2. Spot-check critical **public** paths that must not require auth (and any route you just changed)
3. Stop. Do not re-smoke in a loop unless a subsequent fix ships.

---

## 6. Security non-negotiables

- **Never** `git push --no-verify` (or equivalent) to skip secrets scan / RLS hooks.
- Keep **auth middleware** intact; do not disable it to “make deploy green.”
- **Allowlist public routes carefully** in middleware—only paths that must be anonymous (health, auth entry, legal, share tokens as designed). Prefer deny-by-default.
- Never change user passwords without explicit permission.
- Never claim the product is “fully functional” or “ready to use” after deploy—say **please test**.

---

## Quick checklist (production push)

1. Work batched; one intentional push  
2. Targeted tests green for touched areas  
3. Hooks allowed to run (no `--no-verify`)  
4. Watch **one** Actions deploy run  
5. On failure: classify (infra vs app) before any second push  
6. On green: health 200 + critical public paths once  
7. Report: what shipped + **please test**  

Canonical path: `docs/DEPLOY-PLAYBOOK.md` (this file). App-local pointer: `web-app/docs/DEPLOY-PLAYBOOK.md`.
