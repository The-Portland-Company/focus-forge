import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { setThreadInboxTab } from "@/lib/email-inbox/server";

// PUT: assign this thread to an inbox tab (body.tabId), or clear it (null).
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const { id } = await props.params;
    const body = await request.json().catch(() => ({}));
    const tabId =
      typeof body?.tabId === "string" && body.tabId ? body.tabId : null;
    const result = await setThreadInboxTab({
      userId: auth.user.id,
      threadId: id,
      tabId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set tab" },
      { status: 400 },
    );
  }
}
