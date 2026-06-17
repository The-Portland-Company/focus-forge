import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/email/threads/[id]/ai-rationale
// Returns the real, stored signals the AI used when it judged this email
// task-worthy: the thread's classification, confidence, action reason, plus
// the source email subject and sender. RLS scopes the thread to the user.
//
// We deliberately surface only what is genuinely persisted — if action_reason
// is empty we return null and the UI is honest that no per-task prose exists,
// falling back to the classification/confidence signals.
export async function GET(
  _request: Request,
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

    const { data: thread, error: threadError } = await db
      .from("email_threads")
      .select(
        "id, subject, classification, action_confidence, action_reason, action_title",
      )
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

    // Sender (the "from" participant) — best-available signal for who sent it.
    let senderName: string | null = null;
    let senderEmail: string | null = null;
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

    const confidence =
      typeof thread.action_confidence === "number"
        ? thread.action_confidence
        : thread.action_confidence != null
          ? Number(thread.action_confidence)
          : null;

    return NextResponse.json({
      threadId: thread.id,
      subject: thread.subject ?? thread.action_title ?? null,
      senderName,
      senderEmail,
      classification: thread.classification ?? null,
      confidence,
      reason: thread.action_reason ? String(thread.action_reason) : null,
    });
  } catch (error) {
    console.error("GET /api/email/threads/[id]/ai-rationale error:", error);
    return NextResponse.json(
      { error: "Failed to load AI rationale" },
      { status: 500 },
    );
  }
}
