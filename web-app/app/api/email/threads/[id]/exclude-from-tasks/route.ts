import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { maybeCreateAIMemoryFromEvent } from "@/lib/ai-memory/write";

// POST /api/email/threads/[id]/exclude-from-tasks
// Retrain signal: the user said "don't create tasks for emails like this".
// We record a real, high-weight (2.0) `user_corrected` AI-memory example keyed
// off the offending email (subject + sender). Future email classification
// retrieves these corrections, biasing the AI away from taskifying similar
// emails. This reuses the existing ai-memory pipeline — no fabricated data.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = supabase as any;

    // RLS-scoped read confirms the user owns this thread before we act.
    const { data: thread, error: threadError } = await db
      .from("email_threads")
      .select("id, subject, action_title, classification, action_reason")
      .eq("id", id)
      .maybeSingle();

    if (threadError) {
      return NextResponse.json(
        { error: threadError.message },
        { status: 500 },
      );
    }
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let senderEmail: string | null = null;
    let senderName: string | null = null;
    const { data: fromParticipant } = await db
      .from("email_participants")
      .select("display_name, email_address")
      .eq("thread_id", id)
      .eq("participant_role", "from")
      .limit(1)
      .maybeSingle();
    if (fromParticipant) {
      senderName = fromParticipant.display_name ?? null;
      senderEmail = fromParticipant.email_address ?? null;
    }

    const admin = getAdminClient();
    const subject = thread.subject ?? thread.action_title ?? "";

    const result = await maybeCreateAIMemoryFromEvent(admin, {
      user_id: session.user.id,
      source_type: "email",
      source_id: String(id),
      event_type: "user_corrected_task_category",
      before_json: {
        kind: "email_taskify_correction",
        subject,
        sender_name: senderName,
        sender_email: senderEmail,
        prior_classification: thread.classification ?? null,
        prior_reason: thread.action_reason ?? null,
      },
      after_json: {
        should_create_task: false,
        directive:
          "Do not create tasks for emails like this (similar sender/subject). The user marked an AI-created task as unwanted.",
      },
      reason: "user_corrected",
    });

    return NextResponse.json({
      ok: true,
      memoryCreated: result.created,
    });
  } catch (error) {
    console.error(
      "POST /api/email/threads/[id]/exclude-from-tasks error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to record retrain signal" },
      { status: 500 },
    );
  }
}
