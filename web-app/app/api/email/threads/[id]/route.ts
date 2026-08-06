import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getThreadDetailForUser } from "@/lib/email-inbox/server";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const startedAt = Date.now();
    const thread = await getThreadDetailForUser(auth.user.id, params.id);
    const elapsedMs = Date.now() - startedAt;

    // Slow opens have been reported (a minute or more) while the queries this
    // path runs measure well under a second, so record the real server time:
    // `Server-Timing` shows it in the browser's network panel, and anything
    // pathological is logged with the thread id for the container logs.
    if (elapsedMs > 3000) {
      console.warn(
        `[thread-detail] slow read: ${elapsedMs}ms thread=${params.id}`,
      );
    }

    return NextResponse.json(thread, {
      headers: {
        "Server-Timing": `thread;dur=${elapsedMs}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load thread",
      },
      { status: 404 },
    );
  }
}
