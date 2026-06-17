import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlannerAdminClient, getAuthorizedProject } from "@/lib/ai-planner/persistence";
import { resolveAccessibleProjectIds } from "@/lib/ai-agent/tools";
import { runAgent, type AgentChatMessage } from "@/lib/ai-agent/server";
import { describeImagesInMessage } from "@/lib/ai-agent/providers";
import { extractImageUrls } from "@/lib/ai-agent/image-ingest";

export const dynamic = "force-dynamic";

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
    const forceNewSession = body?.newConversation === true;
    const sessionId = forceNewSession
      ? null
      : typeof body?.sessionId === "string"
        ? body.sessionId
        : null;
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const pageContext = body?.pageContext && typeof body.pageContext === "object" ? body.pageContext : {};
    const preferredProvider = ["auto", "openai", "anthropic", "xai"].includes(body?.provider)
      ? body.provider
      : "auto";

    if (!message) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const admin = createPlannerAdminClient();

    // projectId is optional: present on a project page, absent when the
    // assistant is used globally (e.g. Today/Inbox views).
    let project: { id: string; name: string } | null = null;
    if (projectId) {
      project = await getAuthorizedProject(admin, session.user.id, projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    // Resolve or create a persistent session. Project sessions key on project_id;
    // the global session is the one with project_id IS NULL for this user.
    let agentSessionId = sessionId;
    if (agentSessionId) {
      const { data: existing } = await admin
        .from("ai_planner_sessions")
        .select("id, user_id, project_id")
        .eq("id", agentSessionId)
        .maybeSingle();
      const sameScope = existing && existing.project_id === (projectId || null);
      if (!existing || existing.user_id !== session.user.id || !sameScope) {
        agentSessionId = null;
      }
    }
    // Resume the most recent session for this scope — unless the client asked
    // for a brand-new conversation, in which case we skip resume and create one.
    if (!agentSessionId && !forceNewSession) {
      let q = admin
        .from("ai_planner_sessions")
        .select("id")
        .eq("user_id", session.user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1);
      q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
      const { data: latest } = await q.maybeSingle();
      agentSessionId = latest?.id ?? null;
    }
    if (!agentSessionId) {
      const { data: created, error: createErr } = await admin
        .from("ai_planner_sessions")
        .insert({
          user_id: session.user.id,
          project_id: projectId || null,
          model: "gpt-4.1",
          status: "active",
        })
        .select("id")
        .single();
      if (createErr || !created?.id) {
        return NextResponse.json({ error: createErr?.message || "Failed to create session" }, { status: 500 });
      }
      agentSessionId = created.id;
    }

    // Detect any image URL(s) the user pasted and, if present, fetch them
    // SSRF-safely and run a vision-describe step so the agent can "see" them.
    // Persist only the URL *reference* in content_json — never raw bytes.
    const imageUrls = extractImageUrls(message);
    let vision: Awaited<ReturnType<typeof describeImagesInMessage>> | null = null;
    if (imageUrls.length > 0) {
      try {
        vision = await describeImagesInMessage(message);
      } catch {
        vision = null; // never block the chat on the vision step
      }
    }

    const userContentJson =
      imageUrls.length > 0
        ? {
            imageUrls,
            imagesDescribed: vision?.describedUrls ?? [],
            imagesFailed: vision?.failedUrls ?? imageUrls,
          }
        : null;

    await admin.from("ai_planner_messages").insert({
      session_id: agentSessionId,
      role: "user",
      content_text: message,
      ...(userContentJson ? { content_json: userContentJson } : {}),
    });

    const { data: persisted } = await admin
      .from("ai_planner_messages")
      .select("role, content_text")
      .eq("session_id", agentSessionId)
      .order("created_at", { ascending: true });

    const conversation: AgentChatMessage[] = (persisted || [])
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && String(m.content_text || "").trim())
      .map((m: any) => ({ role: m.role, content: String(m.content_text) }))
      .slice(-30);

    // Feed the vision-describe output (or honest fallback) to the agent as an
    // extra assistant-visible context turn appended after the user message.
    if (vision?.context) {
      conversation.push({ role: "user", content: vision.context });
    }

    const accessibleProjectIds = await resolveAccessibleProjectIds(admin, session.user.id);
    const timezone =
      typeof pageContext.timezone === "string" && pageContext.timezone ? pageContext.timezone : null;

    const result = await runAgent({
      conversation,
      page: {
        view: typeof pageContext.view === "string" ? pageContext.view : null,
        projectId: projectId || null,
        projectName: project?.name ?? null,
        visibleTaskCount:
          typeof pageContext.visibleTaskCount === "number" ? pageContext.visibleTaskCount : null,
        timezone,
      },
      toolContext: { admin, userId: session.user.id, accessibleProjectIds, timezone },
      preferredProvider,
    });

    await admin.from("ai_planner_messages").insert({
      session_id: agentSessionId,
      role: "assistant",
      content_text: result.assistantMessage,
      content_json: { toolsUsed: result.toolsUsed, mutated: result.mutated, provider: result.provider },
    });

    await admin
      .from("ai_planner_sessions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", agentSessionId);

    return NextResponse.json({
      sessionId: agentSessionId,
      assistantMessage: result.assistantMessage,
      toolsUsed: result.toolsUsed,
      mutated: result.mutated,
      provider: result.provider,
    });
  } catch (error) {
    console.error("POST /api/ai-agent/chat error:", error);
    const msg = error instanceof Error ? error.message : "Failed to process agent request";
    if (msg.includes("No AI provider configured")) {
      return NextResponse.json(
        { error: "AI agent is not configured: set OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY on the server" },
        { status: 503 },
      );
    }
    if (msg.includes("All AI providers failed")) {
      const exhausted = /quota|credit|spending limit/i.test(msg);
      return NextResponse.json(
        {
          error: exhausted
            ? "All AI providers are out of credit/quota (OpenAI, Anthropic, and xAI). Fund one of the accounts to use the assistant."
            : "All AI providers failed.",
          detail: msg.slice(0, 500),
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg.slice(0, 300) || "Failed to process agent request" }, { status: 500 });
  }
}
