import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlannerAdminClient } from "@/lib/ai-planner/persistence";
import { HIGH_IMPACT_SEND_TOOLS, DEFAULT_APPROVAL_TTL_MS, mintSendApproval, type HighImpactSendTool } from "@/lib/ai-agent/approval";
import { loadSendPreview } from "@/lib/ai-agent/send-preview";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export const dynamic = "force-dynamic";

/**
 * Mints a send approval from an authenticated human's explicit confirmation
 * of a specific, previewed send. This is the ONLY place an approval is ever
 * created — never the model, never the client. The params hash is always
 * recomputed here from the currently-persisted draft; the client's hash is
 * only used to detect a stale preview (the draft changed since the human
 * looked at it), never trusted as the thing being approved.
 *
 * The minted approval is handed back to the browser as an opaque, signed
 * artifact: it is meaningless without the server secret that signs it, so a
 * client cannot forge or alter one, only relay it back verbatim on the next
 * chat turn (see app/api/ai-agent/chat/route.ts). The model never sees it.
 */
export async function POST(request: NextRequest) {
  try {
    const viewerResult = await requireViewerOrUnauthorized();
    if (viewerResult instanceof NextResponse) return viewerResult;
    const { supabase, user } = viewerResult;

    const body = await request.json().catch(() => ({}));
    const tool = body?.tool as HighImpactSendTool;
    const draftId = typeof body?.draftId === "string" ? body.draftId.trim() : "";
    const expectedParamsHash = typeof body?.paramsHash === "string" ? body.paramsHash : "";

    if (!HIGH_IMPACT_SEND_TOOLS.includes(tool)) {
      return NextResponse.json({ error: "Unknown or missing tool." }, { status: 400 });
    }
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }
    if (!expectedParamsHash) {
      return NextResponse.json(
        { error: "paramsHash is required — approve the exact preview shown, not a guess." },
        { status: 400 },
      );
    }

    const admin = createPlannerAdminClient();
    const preview = await loadSendPreview(admin, user.id, tool, draftId);
    if (!preview) {
      return NextResponse.json({ error: "Draft not found (or not yours to send)." }, { status: 404 });
    }
    if (preview.sentAt || preview.status === "sent") {
      return NextResponse.json({ error: "This draft has already been sent." }, { status: 409 });
    }

    // Re-derived server-side from the PERSISTED draft, never from the client.
    // A mismatch means the draft changed since the human previewed it (or the
    // client is trying to approve something it never showed) — refuse either
    // way and make the caller re-preview.
    if (preview.paramsHash !== expectedParamsHash) {
      return NextResponse.json(
        {
          error: "The draft has changed since you previewed it. Refresh the preview and approve again.",
          reason: "draft_changed",
        },
        { status: 409 },
      );
    }

    const approval = mintSendApproval(preview.action, {
      approvedByUserId: user.id,
    });

    return NextResponse.json({
      approval,
      ttlMs: DEFAULT_APPROVAL_TTL_MS,
      expiresAt: approval.expiresAt,
      preview: {
        tool,
        draftId,
        subject: preview.subject,
        recipients: preview.recipients,
        bodyPreview: preview.bodyPreview,
      },
    });
  } catch (error) {
    console.error("POST /api/ai-agent/approve-send error:", error);
    const msg = error instanceof Error ? error.message : "Failed to approve send";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
