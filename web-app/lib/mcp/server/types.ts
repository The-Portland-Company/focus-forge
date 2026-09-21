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
};

// Shape every MCP tool module (e.g. lib/mcp/tools/email.ts) must export an
// array of. Kept here so tool modules have no dependency on the server.
export type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScopes: ApiKeyScope[];
  handler: (
    args: Record<string, unknown>,
    ctx: McpToolContext,
  ) => Promise<McpToolResult>;
};
