import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { setThreadPriority } from "@/lib/email-inbox/server";

// PUT: set this thread's priority (body.priority 1..4), or clear it with null.
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const { id } = await props.params;
    const body = await request.json().catch(() => ({}));
    const priority =
      typeof body?.priority === "number" && Number.isFinite(body.priority)
        ? body.priority
        : null;
    const result = await setThreadPriority({
      userId: auth.user.id,
      threadId: id,
      priority,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to set priority",
      },
      { status: 400 },
    );
  }
}
