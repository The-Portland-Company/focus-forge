import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server/handler";
import { JSON_RPC_ERRORS, jsonRpcError, type JsonRpcId } from "@/lib/mcp/server/protocol";
import { checkApiTokenRateLimit } from "@/lib/api/rate-limit";
import { authenticate } from "@/src/vendor/tpc-auth/authenticate";
import { unauthorized } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";

// POST /api/mcp
//
// Model Context Protocol server (spec 2026-07-28), now a TPC Auth protected
// resource (RFC 9728 / RFC 8707 resource indicators) instead of a bearer
// token that is equal to a locally-issued API key. Every request must carry
// a TPC-issued access token or `tpc_pat_…` PAT bound to `TPC_RESOURCE`;
// `authenticate()` verifies JWTs locally against JWKS and resolves PATs via
// token exchange with a 60s cache. There is still no session store — every
// request carries its own bearer token.
//
// Per-tool scope enforcement (requireScope) still happens inside
// handleMcpRequest for each tools/call, per least-privilege / fail-closed.
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

  const ctx = await authenticate(request, { resource: TPC_RESOURCE });
  if (!ctx) {
    return unauthorized(TPC_RESOURCE);
  }

  // handleMcpRequest re-derives auth per-call (via lib/mcp/server/tpc-adapter.ts,
  // also TPC-backed) so each tools/call is checked against exactly that
  // tool's required scope — least privilege, fail closed. The gate above is a
  // cheap early reject for requests with no usable credential at all.
  const authHeader = request.headers.get("authorization");

  const rl = checkApiTokenRateLimit("mcp", ctx.sub);
  if (!rl.allowed) {
    return NextResponse.json(
      jsonRpcError(
        (typeof body === "object" && body !== null && "id" in body
          ? ((body as { id?: unknown }).id as JsonRpcId)
          : null) ?? null,
        // -32029: not in JSON_RPC_ERRORS; JSON-RPC reserves -32000..-32099
        // for implementation-defined server errors, and none of the
        // existing codes there mean "rate limited".
        -32029,
        "Too many requests. Please slow down.",
        { retryAfterMs: rl.retryAfterMs },
      ),
      { status: 429 },
    );
  }

  const result = await handleMcpRequest(body, authHeader);

  return NextResponse.json(result.body, { status: result.status });
}
