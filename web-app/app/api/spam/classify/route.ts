import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  classifySpam,
  getSpamConfidenceThreshold,
} from "@/lib/spam/server";

// POST /api/spam/classify
// Manual "paste text → classify" tester for the Spam Training tab. Runs the
// k-NN verdict against the caller's own signatures and reports whether it would
// be used directly (confidence ≥ threshold) or fall through to the backstop.
// Body: { text: string, mailboxId?, organizationId? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const verdict = await classifySpam(text, {
      userId: auth.user.id,
      organizationId: body.organizationId ?? null,
      mailboxId: body.mailboxId ?? null,
    });
    const threshold = getSpamConfidenceThreshold();
    return NextResponse.json({
      ...verdict,
      threshold,
      confident: verdict.label !== null && verdict.confidence >= threshold,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to classify text",
      },
      { status: 400 },
    );
  }
}
