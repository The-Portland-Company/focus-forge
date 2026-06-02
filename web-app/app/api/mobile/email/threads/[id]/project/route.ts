import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { assignProjectToThread } from "@/lib/email-inbox/server";

// PUT/POST /api/mobile/email/threads/[id]/project
// Mobile Bearer-token mirror of /api/email/threads/[id]/project (PUT).
// Body: { projectId }. Returns the reprocessed thread.
async function handle(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const params = await props.params;
    if (!body.projectId || typeof body.projectId !== "string") {
      return NextResponse.json(
        mobileFailure("validation_error", "projectId is required"),
        { status: 400 },
      );
    }

    const thread = await assignProjectToThread(
      auth.user.id,
      params.id,
      body.projectId,
    );
    return NextResponse.json(mobileSuccess(thread), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "action_failed",
        "Failed to assign project to email thread",
        error,
      ),
      { status: 400 },
    );
  }
}

export const PUT = handle;
export const POST = handle;
