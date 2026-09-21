import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/server/handler";
import { JSON_RPC_ERRORS, jsonRpcError, type JsonRpcId } from "@/lib/mcp/server/protocol";
import { verifyMobileAccessTokenOrPat } from "@/lib/mobile/api";
import { checkApiTokenRateLimit } from "@/lib/api/rate-limit";

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

  // Rate-limit by the resolved PAT/user identity before dispatching. This is a
  // lightweight pre-check purely for rate limiting — handleMcpRequest still
  // does its own per-tool scope re-authentication (see comment above).
  const authHeader = request.headers.get("authorization");
  const auth = await verifyMobileAccessTokenOrPat(authHeader);
  if (auth.ok) {
    const rl = checkApiTokenRateLimit("mcp", auth.user.id);
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
  }

  const result = await handleMcpRequest(body, authHeader);

  return NextResponse.json(result.body, { status: result.status });
}
