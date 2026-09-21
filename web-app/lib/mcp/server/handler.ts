import type { ApiKeyScope } from "@/lib/api/keys/types";
import { verifyMobileAccessTokenOrPat } from "@/lib/mobile/api";
import {
  JSON_RPC_ERRORS,
  jsonRpcError,
  jsonRpcResult,
  type JsonRpcId,
  type JsonRpcRequest,
} from "./protocol";
import { findMcpTool, MCP_TOOLS } from "./registry";
import type { McpToolResult } from "./types";

export const MCP_PROTOCOL_VERSION = "2026-07-28";

const SERVER_INFO = {
  name: "focus-forge",
  version: "1.0.0",
};

// Any authenticated caller may negotiate capabilities / list tools; the
// per-tool scope check happens at dispatch time in handleToolsCall.
const ANY_SCOPE: ApiKeyScope[] = ["read", "write", "admin"];

export type McpHandlerResult = {
  status: number;
  body: unknown;
};

const errorResult = (
  status: number,
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): McpHandlerResult => ({ status, body: jsonRpcError(id, code, message, data) });

const okResult = (id: JsonRpcId, result: unknown): McpHandlerResult => ({
  status: 200,
  body: jsonRpcResult(id, result),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateEnvelope = (
  body: unknown,
): { ok: true; request: JsonRpcRequest } | { ok: false; result: McpHandlerResult } => {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      result: errorResult(
        400,
        null,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        "Request body must be a JSON-RPC 2.0 object",
      ),
    };
  }

  const id = (body.id as JsonRpcId) ?? null;

  if (body.jsonrpc !== "2.0") {
    return {
      ok: false,
      result: errorResult(
        400,
        id,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Request must set "jsonrpc": "2.0"',
      ),
    };
  }

  if (typeof body.method !== "string" || body.method.length === 0) {
    return {
      ok: false,
      result: errorResult(
        400,
        id,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        '"method" must be a non-empty string',
      ),
    };
  }

  return { ok: true, request: body as JsonRpcRequest };
};

const authenticate = async (
  authHeader: string | null,
  requiredScopes: ApiKeyScope[],
  id: JsonRpcId,
): Promise<
  { ok: true; userId: string } | { ok: false; result: McpHandlerResult }
> => {
  const auth = await verifyMobileAccessTokenOrPat(authHeader, requiredScopes);
  if (!auth.ok) {
    const code =
      auth.status === 403
        ? JSON_RPC_ERRORS.FORBIDDEN
        : JSON_RPC_ERRORS.UNAUTHORIZED;
    const message = auth.error.error?.message || "Authentication failed";
    return {
      ok: false,
      result: errorResult(auth.status, id, code, message, auth.error),
    };
  }
  return { ok: true, userId: auth.user.id };
};

const handleInitialize = (id: JsonRpcId): McpHandlerResult =>
  okResult(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  });

const handleToolsList = (id: JsonRpcId): McpHandlerResult =>
  okResult(id, {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      ...(tool.title ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  });

const handleToolsCall = async (
  id: JsonRpcId,
  params: unknown,
  authHeader: string | null,
): Promise<McpHandlerResult> => {
  if (!isPlainObject(params) || typeof params.name !== "string") {
    return errorResult(
      400,
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      '"params.name" must be a string',
    );
  }

  const tool = findMcpTool(params.name);
  if (!tool) {
    return errorResult(
      400,
      id,
      JSON_RPC_ERRORS.INVALID_PARAMS,
      `Unknown tool: ${params.name}`,
    );
  }

  const args = isPlainObject(params.arguments) ? params.arguments : {};

  // Least-privilege: authenticate against exactly this tool's required
  // scopes, fail closed if the token lacks them.
  const auth = await authenticate(authHeader, tool.requiredScopes, id);
  if (!auth.ok) return auth.result;

  try {
    const toolResult: McpToolResult = await tool.handler(args, {
      userId: auth.userId,
    });
    return okResult(id, toolResult);
  } catch (error) {
    return errorResult(
      200,
      id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Tool execution failed",
    );
  }
};

export const handleMcpRequest = async (
  body: unknown,
  authHeader: string | null,
): Promise<McpHandlerResult> => {
  const envelope = validateEnvelope(body);
  if (!envelope.ok) return envelope.result;

  const { request } = envelope;
  const id = (request.id as JsonRpcId) ?? null;
  const method = request.method as string;

  switch (method) {
    case "initialize": {
      const auth = await authenticate(authHeader, ANY_SCOPE, id);
      if (!auth.ok) return auth.result;
      return handleInitialize(id);
    }
    case "tools/list": {
      const auth = await authenticate(authHeader, ANY_SCOPE, id);
      if (!auth.ok) return auth.result;
      return handleToolsList(id);
    }
    case "tools/call":
      return handleToolsCall(id, request.params, authHeader);
    default:
      return errorResult(
        400,
        id,
        JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        `Unknown method: ${method}`,
      );
  }
};
