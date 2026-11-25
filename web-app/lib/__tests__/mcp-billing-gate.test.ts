/**
 * Focus Forge MCP billing gate — pure token-claim logic.
 * Verifies: trial/active unlock, expired/canceled/none block, cross-app
 * isolation, credit balance reads, and the free vs paid tool split.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isEntitled, creditBalanceCents } from "../mcp/server/billing-gate";
import { MCP_TOOLS } from "../mcp/server/registry";
import type { AuthContext } from "@/src/vendor/tpc-auth/types";

const ctxWith = (claims: Record<string, unknown>): AuthContext =>
  ({ sub: "u1", scopes: [], orgs: [], app: "forge", via: "jwt", claims } as unknown as AuthContext);

describe("isEntitled", () => {
  test("trial unlocks (first month free)", () => {
    assert.equal(isEntitled(ctxWith({ entitlements: [{ app: "forge", status: "trialing" }] })), true);
  });
  test("active unlocks", () => {
    assert.equal(isEntitled(ctxWith({ entitlements: [{ app: "forge", status: "active" }] })), true);
  });
  test("canceled / past_due / none block", () => {
    assert.equal(isEntitled(ctxWith({ entitlements: [{ app: "forge", status: "canceled" }] })), false);
    assert.equal(isEntitled(ctxWith({ entitlements: [{ app: "forge", status: "past_due" }] })), false);
    assert.equal(isEntitled(ctxWith({ entitlements: [] })), false);
    assert.equal(isEntitled(ctxWith({})), false);
  });
  test("another app's active sub does not unlock Forge", () => {
    assert.equal(isEntitled(ctxWith({ entitlements: [{ app: "focusfi", status: "active" }] })), false);
  });
});

describe("creditBalanceCents", () => {
  test("reads this app's balance, defaults to 0", () => {
    assert.equal(
      creditBalanceCents(ctxWith({ ai_credits: [{ app: "forge", balance_cents: 500 }, { app: "focusfi", balance_cents: 9 }] })),
      500,
    );
    assert.equal(creditBalanceCents(ctxWith({})), 0);
  });
});

describe("tool catalog: free vs paid split", () => {
  const byName = new Map(MCP_TOOLS.map((t) => [t.name, t]));
  test("billing + read tools are free (not paid)", () => {
    for (const name of ["get_subscription_status", "start_checkout", "buy_ai_credits", "manage_billing", "list_tree", "get_project"]) {
      assert.ok(byName.has(name), `${name} missing`);
      assert.notEqual(byName.get(name)!.paid, true);
    }
  });
  test("write tools are paid", () => {
    for (const name of ["create_task", "update_task", "delete_task", "create_goal", "archive_thread"]) {
      assert.equal(byName.get(name)!.paid, true);
    }
  });
});
