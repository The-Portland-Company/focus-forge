// Client for TPC Auth's billing endpoints (the single source of entitlements).
//
// The MCP server forwards the caller's own access token (the one it received)
// as the bearer; TPC Auth verifies it and reads `sub` + `app` from the token,
// so there is no service credential to manage here. Entitlement for GATING is
// read from the token claim (no network call); these endpoints are used for the
// billing TOOLS (checkout/top-up/portal), for a fresh entitlement read, and for
// debiting AI credits.
import { resolveIssuer } from "@/src/vendor/tpc-auth/types";

const BILLING_BASE = () => resolveIssuer();

async function post<T>(path: string, token: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BILLING_BASE()}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

async function get<T>(path: string, token: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BILLING_BASE()}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

export interface EntitlementResponse {
  app: string;
  plan: string;
  status: string;
  entitled: boolean;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ai_credits_cents: number;
}

export const getEntitlement = (token: string) => get<EntitlementResponse>("/api/billing/entitlement", token);
export const startCheckout = (token: string, planKey?: string) =>
  post<{ url?: string; error?: string }>("/api/billing/checkout", token, { plan_key: planKey });
export const buyCredits = (token: string, amountCents: number) =>
  post<{ url?: string; amount_cents?: number; error?: string }>("/api/billing/credit-topup", token, { amount_cents: amountCents });
export const managePortal = (token: string) =>
  post<{ url?: string; error?: string }>("/api/billing/portal", token, {});
export const debitCredits = (
  token: string,
  amountCents: number,
  idempotencyKey: string,
  reason = "usage",
  meta?: Record<string, unknown>,
) => post<{ ok?: boolean; balance_cents?: number; error?: string }>("/api/billing/debit", token, {
  amount_cents: amountCents,
  idempotency_key: idempotencyKey,
  reason,
  meta,
});
