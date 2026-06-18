import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

// Mobile endpoint to READ and SET the `public` flag on email-linked tasks.
//
// Privacy: this uses the service client (standard mobile pattern), so we must
// manually enforce the same mailbox gating that RLS provides on the web. We
// only ever return / mutate rows whose linked email thread the authenticated
// user can access (user_can_access_email_thread, SECURITY DEFINER). We never
// return any email content here — only task_id, thread_id and the public flag.

const userCanAccessThread = async (
  supabase: ReturnType<typeof createServiceSupabase>,
  threadId: string,
  userId: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc("user_can_access_email_thread", {
    p_thread_id: threadId,
    p_user_id: userId,
  });
  if (error) return false;
  return data === true;
};

// GET /api/mobile/email/task-links — map of task_id -> { threadId, public }
// for email-linked tasks the user can access.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const supabase = createServiceSupabase();
    const { data, error } = await (supabase as any)
      .from("email_thread_tasks")
      .select("task_id, thread_id, generated_by, rationale, public");

    if (error) {
      return NextResponse.json(
        mobileFailure("query_failed", error.message),
        { status: 500 },
      );
    }

    const accessibleThreads = new Map<string, boolean>();
    const links: Record<
      string,
      {
        threadId: string;
        public: boolean;
        generatedBy: string;
        rationale: string | null;
      }
    > = {};

    for (const row of data || []) {
      const threadId = row.thread_id as string;
      let canAccess = accessibleThreads.get(threadId);
      if (canAccess === undefined) {
        canAccess = await userCanAccessThread(supabase, threadId, auth.user.id);
        accessibleThreads.set(threadId, canAccess);
      }
      if (!canAccess) continue;
      links[row.task_id] = {
        threadId,
        public: row.public === true,
        generatedBy: row.generated_by,
        rationale: row.rationale ?? null,
      };
    }

    return NextResponse.json(mobileSuccess({ links }));
  } catch (error) {
    console.error("GET /api/mobile/email/task-links error:", error);
    return NextResponse.json(
      mobileFailure("server_error", "Failed to fetch email task links"),
      { status: 500 },
    );
  }
}

// PATCH /api/mobile/email/task-links — set the public flag.
// Body: { taskId: string, public: boolean }.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    let body: { taskId?: unknown; public?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        mobileFailure("invalid_body", "Invalid JSON body"),
        { status: 400 },
      );
    }

    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const isPublic = body.public;
    if (!taskId || typeof isPublic !== "boolean") {
      return NextResponse.json(
        mobileFailure(
          "invalid_body",
          "taskId (string) and public (boolean) are required",
        ),
        { status: 400 },
      );
    }

    const supabase = createServiceSupabase();
    const { data: linkRows, error: linkError } = await (supabase as any)
      .from("email_thread_tasks")
      .select("task_id, thread_id")
      .eq("task_id", taskId);

    if (linkError) {
      return NextResponse.json(
        mobileFailure("query_failed", linkError.message),
        { status: 500 },
      );
    }
    if (!linkRows || linkRows.length === 0) {
      return NextResponse.json(
        mobileFailure("not_found", "No email-linked task found for this task"),
        { status: 404 },
      );
    }

    // Enforce mailbox access for every linked thread before mutating.
    for (const row of linkRows) {
      const canAccess = await userCanAccessThread(
        supabase,
        row.thread_id as string,
        auth.user.id,
      );
      if (!canAccess) {
        return NextResponse.json(
          mobileFailure("forbidden", "You cannot manage this email link"),
          { status: 403 },
        );
      }
    }

    const { error: updateError } = await (supabase as any)
      .from("email_thread_tasks")
      .update({ public: isPublic })
      .eq("task_id", taskId);

    if (updateError) {
      return NextResponse.json(
        mobileFailure("update_failed", updateError.message),
        { status: 500 },
      );
    }

    return NextResponse.json(mobileSuccess({ taskId, public: isPublic }));
  } catch (error) {
    console.error("PATCH /api/mobile/email/task-links error:", error);
    return NextResponse.json(
      mobileFailure("server_error", "Failed to update email task link"),
      { status: 500 },
    );
  }
}
