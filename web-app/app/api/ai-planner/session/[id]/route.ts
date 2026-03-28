import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlannerAdminClient } from "@/lib/ai-planner/persistence";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createPlannerAdminClient();

    const { data: plannerSession, error: plannerSessionError } = await admin
      .from("ai_planner_sessions")
      .select("id, user_id, project_id, status, model, created_at, updated_at")
      .eq("id", params.id)
      .maybeSingle();

    if (plannerSessionError) {
      return NextResponse.json(
        { error: plannerSessionError.message },
        { status: 500 },
      );
    }

    if (!plannerSession || plannerSession.user_id !== session.user.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const [{ data: messages, error: messagesError }, { data: artifacts, error: artifactsError }] =
      await Promise.all([
        admin
          .from("ai_planner_messages")
          .select("id, role, content_text, content_json, token_meta, created_at")
          .eq("session_id", params.id)
          .order("created_at", { ascending: true }),
        admin
          .from("ai_planner_artifacts")
          .select("id, type, payload_json, approved_at, created_at, updated_at")
          .eq("session_id", params.id)
          .order("created_at", { ascending: false }),
      ]);

    if (messagesError || artifactsError) {
      return NextResponse.json(
        { error: messagesError?.message || artifactsError?.message || "Failed to load session data" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      session: plannerSession,
      messages: messages || [],
      artifacts: artifacts || [],
    });
  } catch (error) {
    console.error("GET /api/ai-planner/session/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch planner session" },
      { status: 500 },
    );
  }
}
