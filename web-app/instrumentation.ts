// Next.js instrumentation hook — runs once per server instance on boot.
// Starts the TPC Auth SDK's revocation poll so a revoked PAT/access token
// used against /api/mcp dies faster than its own JWT expiry, per
// src/vendor/tpc-auth/revocation-poll.ts. Skipped with no credential to
// spare (logged, not thrown) — see that module's own fallback.
//
// Also registers Sentry's server/edge instrumentation (no-op when SENTRY_DSN
// is unset — see sentry.server.config.ts / sentry.edge.config.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRevocationPoll } = await import("@/src/vendor/tpc-auth");
    const credential = process.env.TPC_LOCKDOWN_CREDENTIAL;
    startRevocationPoll({
      credential,
      onError: (err) => {
        console.error("[tpc-auth] revocation poll failed", err);
      },
    });

    await import("./sentry.server.config")
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError = async (
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRequestError
  >
) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(...args)
}
