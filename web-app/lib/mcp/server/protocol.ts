// Minimal JSON-RPC 2.0 envelope + error codes used by the MCP server.
// Reference: https://www.jsonrpc.org/specification

export const JSON_RPC_VERSION = "2.0" as const;

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

export type JsonRpcSuccess<T = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
};

export type JsonRpcErrorBody = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcErrorBody;
};

export type JsonRpcResponse<T = unknown> =
  | JsonRpcSuccess<T>
  | JsonRpcErrorResponse;

// Standard JSON-RPC codes, plus a server-defined range (-32000..-32099) for
// auth failures that MCP HTTP transports still want to see as valid JSON-RPC.
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
} as const;

export const jsonRpcResult = <T>(
  id: JsonRpcId,
  result: T,
): JsonRpcSuccess<T> => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  result,
});

export const jsonRpcError = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});
