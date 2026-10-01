/**
 * Shared release identifier for Sentry, reusing the same source of truth as
 * /api/health's `build.git_commit` (see app/api/health/route.ts): Railway's
 * injected commit SHA, with a Vercel fallback for parity if ever deployed
 * there, falling back to undefined (Sentry omits `release` entirely rather
 * than tagging events with a bogus value).
 */
export function resolveSentryRelease(): string | undefined {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  )
}
