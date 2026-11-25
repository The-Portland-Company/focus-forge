import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server/handler";
import { JSON_RPC_ERRORS, jsonRpcError, type JsonRpcId } from "@/lib/mcp/server/protocol";
import { checkApiTokenRateLimit } from "@/lib/api/rate-limit";
import { authenticate } from "@/src/vendor/tpc-auth/authenticate";
import { unauthorized } from "@/src/vendor/tpc-auth/resource";
import { TPC_RESOURCE, TPC_LEGACY_RESOURCES } from "@/src/vendor/tpc-auth/config";

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

// Permissive CORS for the MCP surface only: these requests carry bearer
// tokens, never cookies, and must be reachable from the ChatGPT web client's
// origin (chatgpt.com / chat.openai.com). Browser MCP clients fire a CORS
// preflight for the POST because it carries an Authorization header; without
// these headers the preflight fails and the client silently discovers zero
// tools even though OAuth (a full-page redirect, not CORS-gated) succeeded.
// Mirrors Focus: Finance's known-good MCP CORS (backend app/mcp/index.js).
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  };
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    response.headers.set(k, v);
  }
  return response;
}

// CORS preflight: browser MCP clients (ChatGPT web) send OPTIONS before the
// bearer-bearing POST. Without an explicit handler Next.js auto-answers 204 but
// omits the Access-Control-* headers, so the preflight fails and the real POST
// never fires — the exact cause of "connected, zero tools" in ChatGPT.
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

// A GET to the MCP endpoint (some clients probe it for an SSE stream) returns a
// 401 challenge when unauthenticated, else 405 JSON — never an HTML page that
// would break discovery. CORS headers included so browser clients can read it.
export async function GET(request: NextRequest) {
  const ctx = await authenticate(request, { resource: TPC_RESOURCE, legacyResources: TPC_LEGACY_RESOURCES });
  if (!ctx) {
    return withCors(request, NextResponse.json(
      { error: "invalid_token" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource", error="invalid_token"`,
          "Cache-Control": "no-store",
        },
      },
    ));
  }
  return withCors(request, NextResponse.json(
    { error: "method_not_allowed", error_description: "Use POST for MCP JSON-RPC." },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  ));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(request, NextResponse.json(
      jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "Invalid JSON"),
      { status: 400 },
    ));
  }

  const ctx = await authenticate(request, { resource: TPC_RESOURCE, legacyResources: TPC_LEGACY_RESOURCES });
  if (!ctx) {
    // unauthorized() returns a plain Response; re-wrap so CORS headers apply and
    // the browser client can read the WWW-Authenticate challenge.
    const res = unauthorized(TPC_RESOURCE);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
    return new NextResponse(res.body, { status: res.status, headers });
  }

  // handleMcpRequest re-derives auth per-call (via lib/mcp/server/tpc-adapter.ts,
  // also TPC-backed) so each tools/call is checked against exactly that
  // tool's required scope — least privilege, fail closed. The gate above is a
  // cheap early reject for requests with no usable credential at all.
  const authHeader = request.headers.get("authorization");

  const rl = checkApiTokenRateLimit("mcp", ctx.sub);
  if (!rl.allowed) {
    return withCors(request, NextResponse.json(
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
    ));
  }

  const result = await handleMcpRequest(body, authHeader);

  if (result.status === 202) return withCors(request, new NextResponse(null, { status: 202 }));

  return withCors(request, NextResponse.json(result.body, { status: result.status }));
}
