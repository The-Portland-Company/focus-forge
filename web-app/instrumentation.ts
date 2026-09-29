// Next.js instrumentation hook — runs once per server instance on boot.
// Starts the TPC Auth SDK's revocation poll so a revoked PAT/access token
// used against /api/mcp dies faster than its own JWT expiry, per
// src/vendor/tpc-auth/revocation-poll.ts. Skipped with no credential to
// spare (logged, not thrown) — see that module's own fallback.
export async function register() {
  const { startRevocationPoll } = await import("@/src/vendor/tpc-auth");
  const credential = process.env.TPC_LOCKDOWN_CREDENTIAL;
  startRevocationPoll({
    credential,
    onError: (err) => {
      console.error("[tpc-auth] revocation poll failed", err);
    },
  });
}
