import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getProviderStatuses } from "@/lib/ai/provider-status";

/**
 * GET /api/llm-providers/status
 *
 * Live status (and, where the vendor exposes one, credit balance) for every LLM
 * provider this deployment uses. Any signed-in user may read it: it exposes
 * only provider names, model ids, env-var NAMES, and a status — never a key.
 *
 * Results are cached in-module for 60s. `?refresh=1` forces a re-probe for the
 * Settings page's Refresh button.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    const providers = await getProviderStatuses({ force });
    return NextResponse.json({ providers, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error probing LLM provider status:", error);
    return NextResponse.json(
      { error: "Failed to probe LLM providers" },
      { status: 500 },
    );
  }
}
