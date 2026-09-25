// Regression test for the resource-mismatch bug: TPC Auth matches
// apps.resource_uri EXACTLY ("https://focusforge.theportlandcompany.com"),
// so anything that appends "/mcp" to it makes every PAT exchange and JWT
// audience check fail (this hit Ads Control the same way). Covers both the
// MCP auth adapter and the RFC 9728 discovery route.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

const WEB_APP_ROOT = path.resolve(__dirname, "..", "..");
const noMcpSuffix = (relPath: string) => {
  const src = readFileSync(path.join(WEB_APP_ROOT, relPath), "utf8");
  assert.ok(
    !/TPC_RESOURCE\s*}\s*\/mcp/.test(src) && !src.includes("TPC_RESOURCE}/mcp"),
    `${relPath} must pass TPC_RESOURCE unmodified — a "/mcp" suffix makes ` +
      `PAT exchange and JWT audience checks fail against apps.resource_uri`,
  );
};

describe("TPC resource must not carry a /mcp suffix", () => {
  it("TPC_RESOURCE itself has no path suffix", () => {
    assert.equal(TPC_RESOURCE, "https://focusforge.theportlandcompany.com");
    assert.ok(!TPC_RESOURCE.endsWith("/mcp"));
  });

  it("no source file appends /mcp onto TPC_RESOURCE", () => {
    noMcpSuffix("lib/mcp/server/tpc-adapter.ts");
    noMcpSuffix("app/api/mcp/route.ts");
    noMcpSuffix("app/.well-known/oauth-protected-resource/mcp/route.ts");
  });

  it("the protected-resource metadata route advertises the bare resource", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/mcp/route");
    const res = await GET();
    const body = (await res.json()) as { resource: string; scopes_supported: string[] };
    assert.equal(body.resource, TPC_RESOURCE);
    assert.deepEqual(body.scopes_supported, ["forge:read", "forge:write"]);
  });
});
