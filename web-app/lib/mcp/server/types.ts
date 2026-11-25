import type { ApiKeyScope } from "@/lib/api/keys/types";

// MCP content-block result shapes (spec 2026-07-28, `tools/call` results).
export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | {
      type: "resource";
      resource: { uri: string; mimeType?: string; text?: string };
    };

export type McpToolResult = {
  content: McpContentBlock[];
  isError?: boolean;
  structuredContent?: unknown;
};

export type McpToolContext = {
  userId: string;
  /** The caller's TPC Auth `sub` (for billing idempotency / debit keys). */
  sub?: string;
  /** The raw bearer the server received — forwarded to TPC Auth billing endpoints. */
  tpcToken?: string;
};

// Shape every MCP tool module (e.g. lib/mcp/tools/email.ts) must export an
// array of. Kept here so tool modules have no dependency on the server.
export type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScopes: ApiKeyScope[];
  /**
   * Requires an active Focus Forge Pro subscription or trial. The entitlement
   * gate (handler.ts) blocks these with a trial-checkout link when the token
   * claim shows no active entitlement. Free/billing/read tools omit it.
   */
  paid?: boolean;
  /**
   * Draws from the prepaid AI-credit balance. Before running, the credit gate
   * checks the balance; after running, it debits actual usage. (No Forge MCP
   * tool is AI-flagged today — the hook is wired and unused.)
   */
  ai?: boolean;
  handler: (
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ) => Promise<McpToolResult>;
};
