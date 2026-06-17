import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      .select("task_id, thread_id, generated_by, rationale");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const links: Record<string, string> = {};
    const aiCreated: Record<
      string,
      { threadId: string; generatedBy: string; rationale: string | null }
    > = {};
    for (const row of data || []) {
      links[row.task_id] = row.thread_id;
      if (row.generated_by === "ai") {
        aiCreated[row.task_id] = {
          threadId: row.thread_id,
          generatedBy: row.generated_by,
          rationale: row.rationale ?? null,
        };
      }
    }

    return NextResponse.json({ links, aiCreated });
  } catch (error) {
    console.error("GET /api/email/task-links error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email task links" },
      { status: 500 },
    );
  }
}
