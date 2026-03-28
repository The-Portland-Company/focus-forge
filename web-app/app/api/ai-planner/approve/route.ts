import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TaskBlueprint, isValidTaskBlueprint } from "@/lib/ai-planner/types";
import {
  createPlannerAdminClient,
  getAuthorizedProject,
} from "@/lib/ai-planner/persistence";

type CreationFailure = {
  stage: "section" | "task" | "subtask";
  path: string;
  reason: string;
};

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
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    const artifactId = typeof body?.artifactId === "string" ? body.artifactId : "";

    if (!sessionId || !projectId || !artifactId) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const admin = createPlannerAdminClient();
    const project = await getAuthorizedProject(admin, session.user.id, projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: plannerSession, error: plannerSessionError } = await admin
      .from("ai_planner_sessions")
      .select("id, user_id, project_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (plannerSessionError || !plannerSession) {
      return NextResponse.json({ error: "Planner session not found" }, { status: 404 });
    }

    if (plannerSession.user_id !== session.user.id || plannerSession.project_id !== projectId) {
      return NextResponse.json({ error: "Planner session not found" }, { status: 404 });
    }

    const { data: artifact, error: artifactError } = await admin
      .from("ai_planner_artifacts")
      .select("id, type, payload_json, approved_at")
      .eq("id", artifactId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (artifactError || !artifact || artifact.type !== "task_blueprint") {
      return NextResponse.json({ error: "Task blueprint artifact not found" }, { status: 404 });
    }

    const payload = artifact.payload_json as Record<string, unknown>;
    const existingReport = payload?.creationReport as Record<string, unknown> | undefined;

    if (artifact.approved_at && existingReport) {
      return NextResponse.json(existingReport);
    }

    const updateApprovalAttempt = await admin
      .from("ai_planner_artifacts")
      .update({ approved_at: new Date().toISOString() })
      .eq("id", artifact.id)
      .is("approved_at", null)
      .select("id")
      .maybeSingle();

    if (updateApprovalAttempt.error) {
      return NextResponse.json({ error: updateApprovalAttempt.error.message }, { status: 500 });
    }

    if (!updateApprovalAttempt.data) {
      const { data: latestArtifact } = await admin
        .from("ai_planner_artifacts")
        .select("payload_json")
        .eq("id", artifact.id)
        .maybeSingle();

      const report = (latestArtifact?.payload_json as any)?.creationReport;
      if (report) {
        return NextResponse.json(report);
      }

      return NextResponse.json(
        { error: "Blueprint is being processed. Retry shortly." },
        { status: 409 },
      );
    }

    const blueprint = artifact.payload_json as TaskBlueprint;
    if (!isValidTaskBlueprint(blueprint)) {
      return NextResponse.json({ error: "Invalid task blueprint payload" }, { status: 422 });
    }

    const failures: CreationFailure[] = [];
    const createdSectionIds: string[] = [];
    const createdTaskIds: string[] = [];
    const createdSubtaskIds: string[] = [];

    const sectionIdByName = new Map<string, string>();

    for (let listIndex = 0; listIndex < blueprint.lists.length; listIndex += 1) {
      const list = blueprint.lists[listIndex];

      const { data: section, error: sectionError } = await admin
        .from("sections")
        .insert({
          project_id: projectId,
          name: list.name,
          description: list.description || null,
          todoist_order: listIndex,
          color: "#52525b",
          icon: "📋",
        })
        .select("id")
        .single();

      if (sectionError || !section?.id) {
        failures.push({
          stage: "section",
          path: `${list.name}`,
          reason: sectionError?.message || "Failed to create section",
        });
        continue;
      }

      createdSectionIds.push(section.id);
      sectionIdByName.set(list.name, section.id);

      for (let taskIndex = 0; taskIndex < list.tasks.length; taskIndex += 1) {
        const task = list.tasks[taskIndex];
        const dependenciesText = task.dependencies?.length
          ? `\nDependencies: ${task.dependencies.join(", ")}`
          : "";
        const estimateText = task.estimate ? `\nEstimate: ${task.estimate}` : "";

        const { data: createdTask, error: taskError } = await admin
          .from("tasks")
          .insert({
            name: task.name,
            description: `${task.description || ""}${estimateText}${dependenciesText}`.trim() || null,
            priority: task.priority || 4,
            project_id: projectId,
            completed: false,
          })
          .select("id")
          .single();

        if (taskError || !createdTask?.id) {
          failures.push({
            stage: "task",
            path: `${list.name} > ${task.name}`,
            reason: taskError?.message || "Failed to create task",
          });
          continue;
        }

        createdTaskIds.push(createdTask.id);
        const sectionId = sectionIdByName.get(list.name);
        if (sectionId) {
          const { error: linkError } = await admin.from("task_sections").upsert(
            {
              task_id: createdTask.id,
              section_id: sectionId,
            },
            { onConflict: "task_id,section_id" },
          );

          if (linkError) {
            failures.push({
              stage: "task",
              path: `${list.name} > ${task.name}`,
              reason: `Failed to map task to section: ${linkError.message}`,
            });
          }
        }

        if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
          for (const subtask of task.subtasks) {
            const { data: createdSubtask, error: subtaskError } = await admin
              .from("tasks")
              .insert({
                name: subtask.name,
                description: subtask.description || null,
                project_id: projectId,
                parent_id: createdTask.id,
                priority: 4,
                completed: false,
              })
              .select("id")
              .single();

            if (subtaskError || !createdSubtask?.id) {
              failures.push({
                stage: "subtask",
                path: `${list.name} > ${task.name} > ${subtask.name}`,
                reason: subtaskError?.message || "Failed to create subtask",
              });
              continue;
            }

            createdSubtaskIds.push(createdSubtask.id);

            const sectionIdForSubtask = sectionIdByName.get(list.name);
            if (sectionIdForSubtask) {
              await admin.from("task_sections").upsert(
                {
                  task_id: createdSubtask.id,
                  section_id: sectionIdForSubtask,
                },
                { onConflict: "task_id,section_id" },
              );
            }
          }
        }
      }
    }

    const report = {
      created: {
        sections: createdSectionIds.length,
        tasks: createdTaskIds.length,
        subtasks: createdSubtaskIds.length,
      },
      failures,
      createdEntityIds: {
        sections: createdSectionIds,
        tasks: createdTaskIds,
        subtasks: createdSubtaskIds,
      },
    };

    await admin
      .from("ai_planner_artifacts")
      .update({
        payload_json: {
          ...payload,
          creationReport: report,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", artifact.id);

    await admin
      .from("ai_planner_sessions")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json(report);
  } catch (error) {
    console.error("POST /api/ai-planner/approve error:", error);
    return NextResponse.json(
      { error: "Failed to approve planner artifact" },
      { status: 500 },
    );
  }
}
