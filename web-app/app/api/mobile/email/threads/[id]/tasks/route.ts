import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  createTasksForThread,
  getThreadDetailForUser,
} from "@/lib/email-inbox/server";

// GET /api/mobile/email/threads/[id]/tasks
// Mobile Bearer-token mirror of /api/email/threads/[id]/tasks (GET).
// Returns the tasks linked to this thread.
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const thread = await getThreadDetailForUser(auth.user.id, params.id);
    const linkedTasks = thread.linkedTasks || [];
    return NextResponse.json(
      mobileSuccess(linkedTasks, { count: linkedTasks.length }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("not_found", "Failed to load linked tasks", error),
      { status: 404 },
    );
  }
}

// POST /api/mobile/email/threads/[id]/tasks
// Mobile Bearer-token mirror of /api/email/threads/[id]/tasks (POST).
// Body: { projectId? }. Generates task(s) from the email thread (AI).
export async function POST(
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
    const tasks = await createTasksForThread(
      auth.user.id,
      params.id,
      body.projectId || null,
    );
    return NextResponse.json(mobileSuccess(tasks, { count: tasks.length }), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to generate tasks", error),
      { status: 400 },
    );
  }
}
