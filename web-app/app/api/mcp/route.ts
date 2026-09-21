import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server/handler";
import { JSON_RPC_ERRORS, jsonRpcError } from "@/lib/mcp/server/protocol";

// POST /api/mcp
//
// Model Context Protocol server (spec 2026-07-28). Stateless JSON-RPC 2.0
// over HTTP: every request carries its own Authorization bearer token
// (mobile access token or Focus Forge PAT) — there is no session store.
//
// Methods: initialize, tools/list, tools/call. Each tool declares its own
// requiredScopes; tools/call re-authenticates per-call against exactly those
// scopes (least privilege, fail closed).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "Invalid JSON"),
      { status: 400 },
    );
  }

  const result = await handleMcpRequest(
    body,
    request.headers.get("authorization"),
  );

  return NextResponse.json(result.body, { status: result.status });
}
