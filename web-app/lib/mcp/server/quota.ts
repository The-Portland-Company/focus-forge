// Rate limiting, agent daily caps, and lockdown enforcement for the MCP
// surface — the only PAT/Bearer/agent-callable API this app exposes today
// (see app/api/mcp/route.ts). Backed by the TPC Auth SDK
// (src/vendor/tpc-auth/rate-limit.ts, lockdown.ts) and a real Postgres
// counter store (public.agent_quota_counters / incr_quota_counter, from
// supabase/migrations/20260929050000_agent_quota_counters.sql — NOT applied
// by this branch, see that file's header).
import { getAdminClient } from "@/lib/supabase/admin";
import {
  rateLimit,
  dailyCap,
  postgresCounterStore,
  isLockedDown,
  type CounterStore,
} from "@/src/vendor/tpc-auth";
import type { AuthContext } from "@/src/vendor/tpc-auth/types";

// `postgresCounterStore` wants `(sql, params) => rows`; the only statement
// it ever issues is `select incr_quota_counter($1, $2) as count`, which maps
// 1:1 onto the RPC the migration exposes to `service_role`.
const counterStore: CounterStore = postgresCounterStore(async (_sql, params) => {
  const [key, ttlSec] = params as [string, number];
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("incr_quota_counter", {
    p_key: key,
    p_ttl_sec: ttlSec,
  });
  if (error) throw error;
  return [{ count: typeof data === "number" ? data : Number(data) }];
});

/** 60 req/min per credential (PAT/token id + actor, per the SDK's callerKey). */
export async function checkMcpRateLimit(ctx: AuthContext) {
  return rateLimit(ctx, "mcp", { store: counterStore, limit: 60, periodSec: 60 });
}

/**
 * UTC-day write cap for agent callers only (`ctx.actor` set — an agent PAT
 * exchange or MCP dynamic client). No-op for human callers, per dailyCap's
 * own contract. "forge.write" isn't one of the SDK's DEFAULT_AGENT_CAPS, so
 * the max is explicit here.
 */
export async function checkMcpWriteDailyCap(ctx: AuthContext) {
  return dailyCap(ctx, "forge.write", counterStore, { max: 500 });
}

const LOCKDOWN_BYPASS_SUB = "16650f26-d6d6-4cec-9476-504f1fdb971e";

/**
 * True if writes should be rejected (503) under an IdP-wide lockdown. Fails
 * OPEN: if the lockdown check itself errors (network, missing credential),
 * writes are allowed rather than the app going dark on an IdP blip — the
 * same trade-off packages/auth/src/lockdown.ts documents for its caller.
 * The one bypass is this specific person's `sub`; org roles never bypass.
 */
export async function isWriteLockedDown(ctx: AuthContext): Promise<boolean> {
  if (ctx.sub === LOCKDOWN_BYPASS_SUB) return false;
  const credential = process.env.TPC_LOCKDOWN_CREDENTIAL;
  if (!credential) return false;
  try {
    return await isLockedDown(undefined, credential);
  } catch {
    return false;
  }
}
