import { EMAIL_MCP_TOOLS } from "@/lib/mcp/tools/email";
import { PLANNING_MCP_TOOLS } from "@/lib/mcp/tools/planning";
import { BILLING_MCP_TOOLS } from "@/lib/mcp/tools/billing";
import type { McpTool } from "./types";

/**
 * Every write tool requires an active Focus Forge Pro subscription or trial
 * (paid: true) — the entitlement gate in handler.ts blocks it with a
 * trial-checkout link when the token claim shows no entitlement. Reads and the
 * billing tools stay free/always-available. Marked here (not on each tool) so
 * the free/paid split is one legible policy, not scattered flags.
 */
const withPaidGate = (tools: McpTool[]): McpTool[] =>
  tools.map((t) =>
    t.requiredScopes.includes("write") || t.requiredScopes.includes("admin") ? { ...t, paid: true } : t,
  );

export const MCP_TOOLS: McpTool[] = [
  ...withPaidGate(EMAIL_MCP_TOOLS),
  ...withPaidGate(PLANNING_MCP_TOOLS),
  ...BILLING_MCP_TOOLS, // always free
];

export const findMcpTool = (name: string): McpTool | undefined =>
  MCP_TOOLS.find((tool) => tool.name === name);
