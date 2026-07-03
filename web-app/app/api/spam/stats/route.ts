import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  getSpamStats,
  getSpamConfidenceThreshold,
  getSpamFallbackMode,
} from "@/lib/spam/server";

// GET /api/spam/stats?mailboxId=&organizationId=
// Training-corpus counts (by label/source) + recent classification accuracy,
// plus the read-only runtime config (confidence threshold, fallback mode) the
// Spam Training tab and settings surface without a dedicated config endpoint.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const stats = await getSpamStats({
      userId: auth.user.id,
      organizationId: searchParams.get("organizationId"),
      mailboxId: searchParams.get("mailboxId"),
    });
    return NextResponse.json({
      ...stats,
      confidenceThreshold: getSpamConfidenceThreshold(),
      fallbackMode: getSpamFallbackMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load spam stats",
      },
      { status: 400 },
    );
  }
}
