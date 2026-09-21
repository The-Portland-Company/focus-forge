/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_MCP_TOOLS } from "@/lib/mcp/tools/email";

test("every tool has a unique name", () => {
  const names = EMAIL_MCP_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

test("every tool has a non-empty schema and scopes", () => {
  for (const tool of EMAIL_MCP_TOOLS) {
    assert.ok(tool.name, "name");
    assert.ok(tool.title, "title");
    assert.ok(tool.description, "description");
    assert.ok(tool.inputSchema && typeof tool.inputSchema === "object", "inputSchema");
    assert.ok(Object.keys(tool.inputSchema).length > 0, "inputSchema keys");
    assert.ok(Array.isArray(tool.requiredScopes) && tool.requiredScopes.length > 0, "requiredScopes");
    for (const scope of tool.requiredScopes) {
      assert.ok(["read", "write", "admin"].includes(scope), `scope ${scope}`);
    }
    assert.equal(typeof tool.handler, "function");
  }
});

test("never exposes a send/reply/draft tool", () => {
  const forbidden = /send|reply|draft/i;
  for (const tool of EMAIL_MCP_TOOLS) {
    assert.equal(forbidden.test(tool.name), false, tool.name);
  }
});

test("read-only tools declare 'read' only; mutating tools declare 'write'", () => {
  const readOnly = new Set([
    "list_mailboxes",
    "list_threads",
    "search_threads",
    "get_thread",
  ]);
  for (const tool of EMAIL_MCP_TOOLS) {
    if (readOnly.has(tool.name)) {
      assert.deepEqual(tool.requiredScopes, ["read"]);
    } else {
      assert.ok(tool.requiredScopes.includes("write"));
    }
  }
});
