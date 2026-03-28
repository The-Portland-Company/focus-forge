import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlannerAdminClient, getAuthorizedProject } from "@/lib/ai-planner/persistence";
import { runAutoSectionModel } from "@/lib/ai-planner/auto-section";

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
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";

    if (!projectId) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const admin = createPlannerAdminClient();
    const project = await getAuthorizedProject(admin, session.user.id, projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [{ data: sectionRows, error: sectionError }, { data: taskRows, error: taskError }] =
      await Promise.all([
        admin
          .from("sections")
          .select("id, name, todoist_order")
          .eq("project_id", projectId)
          .order("todoist_order", { ascending: true }),
        admin
          .from("tasks")
          .select("id, name, description")
          .eq("project_id", projectId)
          .is("section_id", null)
          .eq("completed", false),
      ]);

    if (sectionError) {
      return NextResponse.json({ error: sectionError.message }, { status: 500 });
    }

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    const existingSections = (sectionRows || []).map((row: any) => ({
      id: row.id as string,
      name: row.name as string,
    }));

    const unassignedTasks = (taskRows || []).map((row: any) => ({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) || "",
    }));

    if (unassignedTasks.length === 0) {
      return NextResponse.json({
        summary: "No unassigned tasks to organize.",
        movedTasks: 0,
        createdSections: 0,
        createdSectionNames: [],
      });
    }

    const aiResult = await runAutoSectionModel({
      projectName: project.name,
      existingSections,
      unassignedTasks,
    });

    const sectionIdByName = new Map(
      existingSections.map((section) => [section.name.trim().toLowerCase(), section.id]),
    );

    let createdSections = 0;
    const createdSectionNames: string[] = [];
    const currentMaxOrder = (sectionRows || []).reduce((max: number, row: any) => {
      const value = row.todoist_order ?? 0;
      return Math.max(max, Number.isFinite(value) ? value : 0);
    }, 0);
    let nextOrder = currentMaxOrder + 1;

    for (const suggestion of aiResult.suggestions) {
      const normalizedName = suggestion.targetSectionName.trim().toLowerCase();
      if (!normalizedName || sectionIdByName.has(normalizedName)) {
        continue;
      }

      if (!suggestion.createSection) {
        return NextResponse.json(
          { error: `AI selected a missing section without creating it: ${suggestion.targetSectionName}` },
          { status: 500 },
        );
      }

      const { data: createdSection, error: createSectionError } = await admin
        .from("sections")
        .insert({
          project_id: projectId,
          name: suggestion.targetSectionName.trim(),
          todoist_order: nextOrder,
        })
        .select("id, name")
        .single();

      if (createSectionError || !createdSection?.id) {
        return NextResponse.json(
          { error: createSectionError?.message || "Failed to create AI section" },
          { status: 500 },
        );
      }

      nextOrder += 1;
      createdSections += 1;
      createdSectionNames.push(createdSection.name);
      sectionIdByName.set(normalizedName, createdSection.id);
    }

    let movedTasks = 0;

    for (const suggestion of aiResult.suggestions) {
      const sectionId = sectionIdByName.get(suggestion.targetSectionName.trim().toLowerCase());
      if (!sectionId) {
        return NextResponse.json(
          { error: `AI returned an unresolved section target: ${suggestion.targetSectionName}` },
          { status: 500 },
        );
      }

      const { error: updateTaskError } = await admin
        .from("tasks")
        .update({
          section_id: sectionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", suggestion.taskId)
        .eq("project_id", projectId);

      if (updateTaskError) {
        return NextResponse.json(
          { error: updateTaskError.message },
          { status: 500 },
        );
      }

      const { error: linkError } = await admin.from("task_sections").upsert(
        {
          task_id: suggestion.taskId,
          section_id: sectionId,
        },
        { onConflict: "task_id,section_id" },
      );

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 });
      }

      movedTasks += 1;
    }

    return NextResponse.json({
      summary: aiResult.summary,
      movedTasks,
      createdSections,
      createdSectionNames,
    });
  } catch (error) {
    console.error("POST /api/ai-planner/auto-section error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to auto-organize tasks";

    if (message.includes("OPENAI_API_KEY is not configured")) {
      return NextResponse.json(
        { error: "AI organizer is not configured: missing OPENAI_API_KEY on server" },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
