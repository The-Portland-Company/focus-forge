import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTaskLinkMaps } from "@/lib/email-inbox/task-links";

// GET /api/email/task-links — map of task_id -> thread_id for tasks created
// from / linked to email threads (RLS scopes rows to the current user).
//
// Also returns `aiCreated`: a map of task_id -> { threadId, generatedBy,
// rationale } for tasks the AI created from a task-worthy email. This powers
// the clickable AI-origin indicator + refinement modal on the Today view.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // email_thread_tasks isn't in the generated DB types yet
    const { data, error } = await (supabase as any)
      .from("email_thread_tasks")
      .select("task_id, thread_id, generated_by, rationale, public");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch the sender ("from") address for the linked threads so clients can
    // render "From: <email>" next to email-created tasks. RLS scopes rows to
    // threads the user can see.
    const threadIds = Array.from(
      new Set(
        ((data as any[]) || [])
          .map((r) => r?.thread_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );
    let senderRows: any[] = [];
    if (threadIds.length > 0) {
      const { data: senders } = await (supabase as any)
        .from("email_participants")
        .select("thread_id, email_address, created_at")
        .eq("participant_role", "from")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true });
      senderRows = senders || [];
    }

    // links/aiCreated/publicByTaskId/senderByTaskId maps.
    const { links, aiCreated, publicByTaskId, senderByTaskId } =
      buildTaskLinkMaps(data, senderRows);

    return NextResponse.json({
      links,
      aiCreated,
      publicByTaskId,
      senderByTaskId,
    });
  } catch (error) {
    console.error("GET /api/email/task-links error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email task links" },
      { status: 500 },
    );
  }
}

// PATCH /api/email/task-links — set the `public` flag on an email-linked task.
// Body: { taskId: string, public: boolean }. RLS ("Users can manage email
// thread tasks") restricts the update to users with access to the linked
// mailbox, so only someone who can see the email can change its publicness.
// This only flips a flag on the link row; it never exposes email content.
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { taskId?: unknown; public?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const isPublic = body.public;
    if (!taskId || typeof isPublic !== "boolean") {
      return NextResponse.json(
        { error: "taskId (string) and public (boolean) are required" },
        { status: 400 },
      );
    }

    // email_thread_tasks isn't in the generated DB types yet.
    const { data, error } = await (supabase as any)
      .from("email_thread_tasks")
      .update({ public: isPublic })
      .eq("task_id", taskId)
      .select("task_id, public");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      // No row updated => either no email link for this task, or RLS blocked it.
      return NextResponse.json(
        { error: "No email-linked task found for this task" },
        { status: 404 },
      );
    }

    return NextResponse.json({ taskId, public: isPublic });
  } catch (error) {
    console.error("PATCH /api/email/task-links error:", error);
    return NextResponse.json(
      { error: "Failed to update email task link" },
      { status: 500 },
    );
  }
}
