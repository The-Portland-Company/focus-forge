import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractedTask {
  name: string;
  description?: string;
  priority?: 1 | 2 | 3 | 4;
  due_date?: string | null;
}

interface ExtractionResult {
  projectId: string | null;
  tasks: ExtractedTask[];
}

const SYSTEM_PROMPT = `You convert a user's spoken transcript into a list of discrete, actionable tasks for a project management app.

Rules:
- Extract each distinct action item as its own task. Do not combine multiple actions into one task.
- "name" is a short imperative phrase (under 80 chars). "description" is optional and only included when the user gave extra detail.
- "priority" is 1 (urgent) - 4 (low). Omit unless the user clearly indicated urgency.
- "due_date" is YYYY-MM-DD or null. Only set if the user named a date.
- If the user names a project, match it (case-insensitive substring or fuzzy) against the provided project list and return that project's id as "projectId". Otherwise return null for projectId (the caller will use the current view's project).
- If the transcript contains no actionable tasks, return an empty tasks array.
- Output strictly the JSON object matching the schema. No prose.`;

const RESPONSE_SCHEMA = {
  name: "extracted_tasks",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId", "tasks"],
    properties: {
      projectId: { type: ["string", "null"] },
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "priority", "due_date"],
          properties: {
            name: { type: "string" },
            description: { type: ["string", "null"] },
            priority: {
              type: ["integer", "null"],
              enum: [1, 2, 3, 4, null],
            },
            due_date: { type: ["string", "null"] },
          },
        },
      },
    },
  },
} as const;

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const transcript: string =
      typeof body?.transcript === "string" ? body.transcript.trim() : "";
    const currentProjectId: string | null =
      typeof body?.currentProjectId === "string" ? body.currentProjectId : null;
    const projects: { id: string; name: string }[] = Array.isArray(
      body?.projects,
    )
      ? body.projects
          .filter(
            (p: unknown): p is { id: string; name: string } =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as { id?: unknown }).id === "string" &&
              typeof (p as { name?: unknown }).name === "string",
          )
          .slice(0, 200)
      : [];

    if (!transcript) {
      return NextResponse.json(
        { error: "Empty transcript" },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const userMessage = [
      `Today's date: ${today}`,
      `Current project id (fallback): ${currentProjectId ?? "none"}`,
      `Available projects:`,
      projects.length
        ? projects.map((p) => `- ${p.name} (id: ${p.id})`).join("\n")
        : "(none provided)",
      "",
      "Transcript:",
      transcript,
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Extraction failed: ${text}` },
        { status: 502 },
      );
    }

    const payload = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    let parsed: ExtractionResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON" },
        { status: 502 },
      );
    }

    const projectIds = new Set(projects.map((p) => p.id));
    const resolvedProjectId =
      parsed.projectId && projectIds.has(parsed.projectId)
        ? parsed.projectId
        : currentProjectId;

    const tasks = (parsed.tasks ?? [])
      .filter((t) => t && typeof t.name === "string" && t.name.trim().length)
      .map((t) => ({
        name: t.name.trim().slice(0, 200),
        description:
          typeof t.description === "string" && t.description.trim()
            ? t.description.trim()
            : undefined,
        priority:
          t.priority && [1, 2, 3, 4].includes(t.priority)
            ? t.priority
            : undefined,
        due_date:
          typeof t.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)
            ? t.due_date
            : undefined,
      }));

    return NextResponse.json({
      projectId: resolvedProjectId,
      tasks,
      transcript,
    });
  } catch (err) {
    console.error("voice/tasks-from-text error", err);
    return NextResponse.json(
      { error: "Failed to extract tasks" },
      { status: 500 },
    );
  }
}
