import { createHash } from "crypto";

/**
 * Double-confirm gate for destructive assistant actions (delete organization /
 * delete project). The gate makes a SINGLE tool call incapable of deleting:
 *
 *  1. First call (no/invalid confirm): the executor resolves the target and
 *     impact, then returns `needsConfirmation: true` with a stable `confirmToken`
 *     derived from the exact action + target id. NOTHING is deleted.
 *  2. The assistant relays the impact to the user and waits for an explicit
 *     "yes".
 *  3. Second call: only when `confirm === true` AND `confirmToken` matches the
 *     token for that exact (action, target) does the gate allow execution.
 *
 * Token derivation is deterministic (sha256 of action + entityId + a static
 * secret-ish salt), so the assistant cannot fabricate a valid token — it must
 * echo back the one the gate handed it for that specific target, which only
 * exists after a real "needs confirmation" round-trip.
 */

const CONFIRM_SALT = "focus-forge:ai-agent:destructive-confirm:v1";

export type DestructiveAction = "delete_project" | "delete_organization";

/**
 * Shared token derivation for every agent gate (this double-confirm gate and
 * the high-impact send approval in lib/ai-agent/approval.ts). Salt + ordered
 * parts are joined with "|" and hashed, so a token is only reproducible by
 * code that knows the salt AND the exact parts — change any part and the
 * token changes.
 */
export function deriveGateToken(
  salt: string,
  parts: string[],
  options: { length?: number } = {},
): string {
  const digest = createHash("sha256").update([salt, ...parts].join("|")).digest("hex");
  return digest.slice(0, options.length ?? 32);
}

/** Deterministic, target-specific confirmation token. */
export function deriveConfirmToken(action: DestructiveAction, entityId: string): string {
  return deriveGateToken(CONFIRM_SALT, [action, entityId]);
}

export type ConfirmGateInput = {
  action: DestructiveAction;
  entityId: string;
  confirm?: unknown;
  confirmToken?: unknown;
};

/**
 * Decide whether a destructive call is allowed to execute. Pure + side-effect
 * free so it is fully unit-testable. Returns `allowed: false` for any call that
 * is missing `confirm:true` or whose token does not match the target — meaning
 * one call alone can never delete.
 */
export function evaluateConfirmGate(input: ConfirmGateInput): {
  allowed: boolean;
  expectedToken: string;
} {
  const expectedToken = deriveConfirmToken(input.action, input.entityId);
  const confirmed = input.confirm === true;
  const tokenMatches =
    typeof input.confirmToken === "string" && input.confirmToken === expectedToken;
  return { allowed: confirmed && tokenMatches, expectedToken };
}
