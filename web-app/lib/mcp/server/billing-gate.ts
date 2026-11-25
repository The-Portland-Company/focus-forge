// Entitlement + AI-credit gating, read from the verified token claim (no
// network call on the hot path). TPC Auth stamps `entitlements` and
// `ai_credits` onto the access token; these helpers interpret them for app
// "forge". The checkout / top-up URLs that unblock a caller are fetched from
// TPC Auth only WHEN a call is actually blocked.
import type { AuthContext } from "@/src/vendor/tpc-auth/types";
import { TPC_APP_ID } from "@/src/vendor/tpc-auth/config";

export interface EntitlementClaim {
  app: string;
  plan: string;
  status: string;
  trial_end?: string | null;
}
export interface CreditClaim {
  app: string;
  balance_cents: number;
}

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];

/** Is the caller entitled (trialing or active) to this app's paid tier? */
export function isEntitled(ctx: AuthContext): boolean {
  const ents = asArray(ctx.claims?.entitlements);
  const mine = ents.find((e) => e.app === TPC_APP_ID);
  const status = mine?.status;
  return status === "trialing" || status === "active";
}

/** Prepaid AI credit balance (cents) for this app, from the token claim. */
export function creditBalanceCents(ctx: AuthContext): number {
  const credits = asArray(ctx.claims?.ai_credits);
  const mine = credits.find((c) => c.app === TPC_APP_ID);
  return typeof mine?.balance_cents === "number" ? (mine.balance_cents as number) : 0;
}
