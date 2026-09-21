import { EMAIL_MCP_TOOLS } from "@/lib/mcp/tools/email";
import type { McpTool } from "./types";

// Every tool module's exported array gets concatenated here. Add new tool
// modules by importing + spreading them into this list — the transport layer
// (route.ts, handler.ts) never needs to change.
export const MCP_TOOLS: McpTool[] = [...EMAIL_MCP_TOOLS];

export const findMcpTool = (name: string): McpTool | undefined =>
  MCP_TOOLS.find((tool) => tool.name === name);
