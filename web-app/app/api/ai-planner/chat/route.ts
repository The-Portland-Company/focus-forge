import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPlannerModel } from "@/lib/ai-planner/server";
import { isValidTaskBlueprint, PlannerMode } from "@/lib/ai-planner/types";
import {
  createPlannerAdminClient,
  getAuthorizedProject,
  validatePlanDraftQuality,
} from "@/lib/ai-planner/persistence";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const mode = body?.mode as PlannerMode;

    if (!projectId || !message || !["clarify", "draft_plan", "finalize_tasks"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const admin = createPlannerAdminClient();
    const project = await getAuthorizedProject(admin, session.user.id, projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let plannerSessionId = sessionId;

    if (plannerSessionId) {
      const { data: existingSession, error: existingSessionError } = await admin
        .from("ai_planner_sessions")
        .select("id, user_id, project_id")
        .eq("id", plannerSessionId)
        .maybeSingle();

      if (existingSessionError) {
        return NextResponse.json(
          { error: existingSessionError.message },
          { status: 500 },
        );
      }

      if (
        !existingSession ||
        existingSession.user_id !== session.user.id ||
        existingSession.project_id !== projectId
      ) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
    } else {
      const { data: latestSession } = await admin
        .from("ai_planner_sessions")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("project_id", projectId)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSession?.id) {
        plannerSessionId = latestSession.id;
      }
    }

    if (!plannerSessionId) {
      const { data: createdSession, error: createSessionError } = await admin
        .from("ai_planner_sessions")
        .insert({
          user_id: session.user.id,
          project_id: projectId,
          model: "gpt-4.1",
          status: "active",
        })
        .select("id")
        .single();

      if (createSessionError || !createdSession?.id) {
        return NextResponse.json(
          { error: createSessionError?.message || "Failed to create planner session" },
          { status: 500 },
        );
      }

      plannerSessionId = createdSession.id;
    }

    const { error: insertUserMessageError } = await admin
      .from("ai_planner_messages")
      .insert({
        session_id: plannerSessionId,
        role: "user",
        content_text: message,
      });

    if (insertUserMessageError) {
      return NextResponse.json(
        { error: insertUserMessageError.message },
        { status: 500 },
      );
    }

    const { data: persistedMessages, error: messagesError } = await admin
      .from("ai_planner_messages")
      .select("role, content_text")
      .eq("session_id", plannerSessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    const conversation = (persistedMessages || [])
      .filter((msg: any) => msg.role === "user" || msg.role === "assistant")
      .map((msg: any) => ({
        role: msg.role as "user" | "assistant",
        content: String(msg.content_text || ""),
      }))
      .filter((msg: any) => msg.content.trim().length > 0);

    const modelOutput = await runPlannerModel({
      mode,
      projectName: project.name,
      conversation,
    });

    let readiness = modelOutput.readiness;
    let missingInfo = [...modelOutput.missingInfo];
    let planArtifact: any = null;
    let taskBlueprintArtifact: any = null;

    if (mode === "draft_plan" && modelOutput.planDraft) {
      const quality = validatePlanDraftQuality(modelOutput.planDraft);
      if (!quality.valid) {
        readiness = "needs_clarification";
        missingInfo = Array.from(new Set([...missingInfo, ...quality.missing]));
      } else {
        const { data: artifact, error: artifactError } = await admin
          .from("ai_planner_artifacts")
          .insert({
            session_id: plannerSessionId,
            type: "plan",
            payload_json: modelOutput.planDraft,
          })
          .select("id, type, payload_json, created_at, updated_at, approved_at")
          .single();

        if (!artifactError && artifact) {
          planArtifact = artifact;
        }
      }
    }

    if (mode === "finalize_tasks" && modelOutput.taskBlueprint) {
      if (!isValidTaskBlueprint(modelOutput.taskBlueprint)) {
        return NextResponse.json(
          {
            error: "Model returned invalid task blueprint",
          },
          { status: 422 },
        );
      }

      const { data: artifact, error: artifactError } = await admin
        .from("ai_planner_artifacts")
        .insert({
          session_id: plannerSessionId,
          type: "task_blueprint",
          payload_json: modelOutput.taskBlueprint,
        })
        .select("id, type, payload_json, created_at, updated_at, approved_at")
        .single();

      if (!artifactError && artifact) {
        taskBlueprintArtifact = artifact;
      }
      readiness = "ready_for_execution";
    }

    const { error: insertAssistantMessageError } = await admin
      .from("ai_planner_messages")
      .insert({
        session_id: plannerSessionId,
        role: "assistant",
        content_text: modelOutput.assistantMessage,
        content_json: {
          readiness,
          missingInfo,
          hasPlanDraft: Boolean(modelOutput.planDraft),
          hasTaskBlueprint: Boolean(modelOutput.taskBlueprint),
        },
      });

    if (insertAssistantMessageError) {
      return NextResponse.json(
        { error: insertAssistantMessageError.message },
        { status: 500 },
      );
    }

    const nextStatus =
      readiness === "ready_for_execution"
        ? "draft_ready"
        : readiness === "draft_ready"
          ? "draft_ready"
          : "active";

    await admin
      .from("ai_planner_sessions")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", plannerSessionId);

    return NextResponse.json({
      sessionId: plannerSessionId,
      assistantMessage: modelOutput.assistantMessage,
      readiness,
      missingInfo,
      planDraft: modelOutput.planDraft,
      planArtifact,
      taskBlueprintArtifact,
    });
  } catch (error) {
    console.error("POST /api/ai-planner/chat error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process planner chat request";

    if (message.includes("OPENAI_API_KEY is not configured")) {
      return NextResponse.json(
        { error: "AI planner is not configured: missing OPENAI_API_KEY on server" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to process planner chat request" },
      { status: 500 },
    );
  }
}
