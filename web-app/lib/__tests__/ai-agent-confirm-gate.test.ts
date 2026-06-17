import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveConfirmToken,
  evaluateConfirmGate,
} from "../ai-agent/confirm-gate";
import { executeTool, type AgentToolContext } from "../ai-agent/tools";

// ---- Pure gate unit ----

test("deriveConfirmToken is deterministic and target-specific", () => {
  const a = deriveConfirmToken("delete_project", "proj-1");
  assert.equal(a, deriveConfirmToken("delete_project", "proj-1"));
  assert.notEqual(a, deriveConfirmToken("delete_project", "proj-2"));
  assert.notEqual(a, deriveConfirmToken("delete_organization", "proj-1"));
});

test("gate denies without confirm:true", () => {
  const token = deriveConfirmToken("delete_project", "p");
  assert.equal(evaluateConfirmGate({ action: "delete_project", entityId: "p", confirmToken: token }).allowed, false);
  assert.equal(
    evaluateConfirmGate({ action: "delete_project", entityId: "p", confirm: false, confirmToken: token }).allowed,
    false,
  );
});

test("gate denies with confirm:true but wrong/missing token", () => {
  assert.equal(evaluateConfirmGate({ action: "delete_project", entityId: "p", confirm: true }).allowed, false);
  assert.equal(
    evaluateConfirmGate({ action: "delete_project", entityId: "p", confirm: true, confirmToken: "nope" }).allowed,
    false,
  );
  // A token derived for a DIFFERENT target must not unlock this one.
  const otherToken = deriveConfirmToken("delete_project", "other");
  assert.equal(
    evaluateConfirmGate({ action: "delete_project", entityId: "p", confirm: true, confirmToken: otherToken }).allowed,
    false,
  );
});

test("gate allows only with confirm:true AND the matching token", () => {
  const token = deriveConfirmToken("delete_project", "p");
  const r = evaluateConfirmGate({ action: "delete_project", entityId: "p", confirm: true, confirmToken: token });
  assert.equal(r.allowed, true);
  assert.equal(r.expectedToken, token);
});

// ---- Executor-level gating: a single call cannot delete ----

/**
 * Minimal fake Supabase client that answers the queries the delete executors
 * make. `softDeleteCalls` records every soft_delete_entity RPC so a test can
 * prove the delete fn was (not) invoked.
 */
function makeFakeCtx() {
  const softDeleteCalls: any[] = [];
  const PROJECT = { id: "proj-1", name: "Alpha", organization_id: "org-1", color: null, archived: false };

  const builder = (table: string) => {
    const state: any = { table, filters: {} };
    const chain: any = {
      insert: async () => ({ error: null }),
      select: () => chain,
      eq: (col: string, val: any) => {
        state.filters[col] = val;
        return chain;
      },
      in: () => chain,
      is: () => chain,
      ilike: () => chain,
      maybeSingle: async () => {
        if (table === "projects") return { data: PROJECT };
        return { data: null };
      },
      // count head queries (tasks/sections impact) resolve when awaited
      then: (resolve: any) => resolve({ count: 3, data: [] }),
    };
    return chain;
  };

  const admin: any = {
    from: (table: string) => builder(table),
    rpc: async (fn: string, params: any) => {
      if (fn === "soft_delete_entity") {
        softDeleteCalls.push(params);
        return { data: "batch-xyz" };
      }
      return { data: null };
    },
  };

  const ctx: AgentToolContext = {
    admin,
    userId: "user-1",
    accessibleProjectIds: new Set(["proj-1"]),
  };
  return { ctx, softDeleteCalls };
}

test("delete_project WITHOUT confirm returns needsConfirmation + token and deletes nothing", async () => {
  const { ctx, softDeleteCalls } = makeFakeCtx();
  const res = await executeTool(ctx, "delete_project", { id: "proj-1" });
  assert.equal(res.ok, true);
  const data = res.data as any;
  assert.equal(data.needsConfirmation, true);
  assert.equal(data.target.id, "proj-1");
  assert.equal(data.confirmToken, deriveConfirmToken("delete_project", "proj-1"));
  assert.equal(softDeleteCalls.length, 0, "soft_delete_entity must NOT be called on the first (unconfirmed) call");
});

test("delete_project with confirm:true but WRONG token does not delete", async () => {
  const { ctx, softDeleteCalls } = makeFakeCtx();
  const res = await executeTool(ctx, "delete_project", { id: "proj-1", confirm: true, confirmToken: "bogus" });
  // wrong token => falls back to the needsConfirmation branch, no delete
  assert.equal((res.data as any).needsConfirmation, true);
  assert.equal(softDeleteCalls.length, 0);
});

test("delete_project with confirm:true AND correct token executes the cascade", async () => {
  const { ctx, softDeleteCalls } = makeFakeCtx();
  const token = deriveConfirmToken("delete_project", "proj-1");
  const res = await executeTool(ctx, "delete_project", { id: "proj-1", confirm: true, confirmToken: token });
  assert.equal(res.ok, true);
  assert.equal((res.data as any).deleted, true);
  assert.equal((res.data as any).batchId, "batch-xyz");
  assert.equal(softDeleteCalls.length, 1, "soft_delete_entity must be called exactly once on a valid confirm");
  assert.deepEqual(softDeleteCalls[0], { p_entity_type: "project", p_entity_id: "proj-1" });
});
