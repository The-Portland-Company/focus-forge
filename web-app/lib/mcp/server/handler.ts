import type { ApiKeyScope } from "@/lib/api/keys/types";
import { authenticateFromHeader } from "./tpc-adapter";
import {
  JSON_RPC_ERRORS,
  jsonRpcError,
  jsonRpcResult,
  type JsonRpcId,
  type JsonRpcRequest,
} from "./protocol";
import { findMcpTool, MCP_TOOLS } from "./registry";
import type { McpToolResult } from "./types";
import type { AuthContext } from "@/src/vendor/tpc-auth/types";
import { checkMcpRateLimit, checkMcpWriteDailyCap, isWriteLockedDown } from "./quota";

// Our ceiling. Real MCP clients (incl. Claude Code) send the protocolVersion
// they support in `initialize` params and refuse to proceed if we echo back
// something they don't recognize — so we must echo the client's requested
// version when we support it, not just always reply with our newest. See
// handleInitialize below.
export const MCP_PROTOCOL_VERSION = "2026-07-28";

// Older spec dates we still speak (the JSON-RPC envelope and tools/call
// shape are unchanged across these), so an older/pinned client isn't
// rejected just for asking for last year's date.
const SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

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
  | { ok: true; userId: string; ctx: AuthContext }
  | { ok: false; result: McpHandlerResult }
> => {
  const auth = await authenticateFromHeader(authHeader, requiredScopes);
  if (!auth.ok) {
    const code =
      auth.status === 403
        ? JSON_RPC_ERRORS.FORBIDDEN
        : JSON_RPC_ERRORS.UNAUTHORIZED;
    return {
      ok: false,
      result: errorResult(auth.status, id, code, auth.message),
    };
  }
  return { ok: true, userId: auth.userId, ctx: auth.ctx };
};

const handleInitialize = (
  id: JsonRpcId,
  params: unknown,
): McpHandlerResult => {
  const requested =
    typeof params === "object" && params !== null && "protocolVersion" in params
      ? (params as { protocolVersion?: unknown }).protocolVersion
      : undefined;
  const protocolVersion =
    typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : MCP_PROTOCOL_VERSION;
  return okResult(id, {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  });
};

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

  // 60 req/min per credential (PAT/token id + actor), backed by Postgres —
  // fails the request rather than the whole route on a limiter error, same
  // as rateLimit()'s own fail-open-on-no-backend contract inverted here to
  // fail closed on a thrown error from the store.
  const rl = await checkMcpRateLimit(auth.ctx);
  if (!rl.ok) {
    return errorResult(429, id, JSON_RPC_ERRORS.INTERNAL_ERROR, "Too many requests. Please slow down.", {
      retryAfterSec: rl.retryAfter,
    });
  }

  const isWrite = tool.requiredScopes.includes("write") || tool.requiredScopes.includes("admin");

  if (isWrite) {
    // Lockdown: reject writes (fail OPEN if the check itself can't run) for
    // every caller except the one bypass sub. Org roles never bypass.
    if (await isWriteLockedDown(auth.ctx)) {
      return errorResult(503, id, JSON_RPC_ERRORS.INTERNAL_ERROR, "Writes are temporarily locked down.");
    }

    // Agent callers (ctx.actor set) get a UTC-day write cap; humans are a
    // no-op per dailyCap's own contract.
    const cap = await checkMcpWriteDailyCap(auth.ctx);
    if (!cap.ok) {
      return errorResult(429, id, JSON_RPC_ERRORS.INTERNAL_ERROR, "Daily write cap exceeded for this agent.", {
        retryAfterSec: cap.retryAfter,
      });
    }

    // Log the actor (RFC 8693 `act` claim) on every write, so "agent X on
    // behalf of Y" is reconstructable from logs alone.
    console.log("[mcp] write", {
      tool: tool.name,
      sub: auth.ctx.sub,
      actor: auth.ctx.actor?.sub ?? null,
    });
  }

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

  // JSON-RPC notifications (e.g. notifications/initialized) carry no id and
  // expect no response body; MCP's Streamable HTTP transport answers 202.
  if (method.startsWith("notifications/")) {
    return { status: 202, body: null };
  }

  switch (method) {
    case "ping":
      return okResult(id, {});
    case "initialize": {
      const auth = await authenticate(authHeader, ANY_SCOPE, id);
      if (!auth.ok) return auth.result;
      return handleInitialize(id, request.params);
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
