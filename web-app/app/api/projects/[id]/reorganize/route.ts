import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAdmin } from "@/lib/api/authz";
import { resolveEmailChain } from "@/lib/ai/email-provider";
import {
  classifyTasksForReorg,
  type ReorgCandidateProject,
} from "@/lib/task-reorg/classify";
import { applyReorgBatch, type ReorgMove } from "@/lib/task-reorg/apply";

/**
 * POST /api/projects/[id]/reorganize
 *
 * Dry-run by default: loads the project's OPEN tasks, gathers the user's
 * candidate projects across their orgs, asks the AI to route each task to the
 * best-fit project, and returns a PROPOSAL (no task is moved).
 *
 * With `?apply=true` or a body `{ apply: true, taskIds?: string[] }`, records a
 * task_reorg_batches row + task_reorg_moves rows and moves the selected tasks
 * (defaults to every task with a suggestion). Returns the batchId.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const projectId = params.id;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      projectId,
    );
    if (!authz.authorized || !authz.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    let body: { apply?: boolean; taskIds?: string[] } = {};
    try {
      body = (await request.json()) || {};
    } catch {
      body = {};
    }
    const apply = url.searchParams.get("apply") === "true" || body.apply === true;
    const requestedTaskIds = Array.isArray(body.taskIds)
      ? new Set(body.taskIds.filter((v): v is string => typeof v === "string"))
      : null;

    // Source project (name feeds the prompt) + org ai_settings for the chain.
    const { data: sourceProject } = (await (supabase as any)
      .from("projects")
      .select("id,name,organization_id")
      .eq("id", projectId)
      .maybeSingle()) as {
      data: { id: string; name: string; organization_id: string } | null;
    };

    const { data: orgRow } = (await (supabase as any)
      .from("organizations")
      .select("ai_settings")
      .eq("id", authz.organizationId)
      .maybeSingle()) as { data: { ai_settings: unknown } | null };
    const chain = resolveEmailChain(orgRow?.ai_settings ?? null);
    if (chain.length === 0) {
      return NextResponse.json(
        { error: "AI triage is disabled for this organization" },
        { status: 400 },
      );
    }

    // Open, non-deleted tasks in the project.
    const { data: taskRows, error: taskError } = await (supabase as any)
      .from("tasks")
      .select("id,name,description,project_id,section_id")
      .eq("project_id", projectId)
      .eq("completed", false)
      .is("deleted_at", null);

    if (taskError) {
      return NextResponse.json(
        { error: "Failed to load tasks" },
        { status: 500 },
      );
    }

    const tasks = ((taskRows || []) as Array<{
      id: string;
      name: string;
      description: string | null;
      project_id: string;
      section_id: string | null;
    }>).filter(
      (t) => !requestedTaskIds || requestedTaskIds.has(t.id),
    );

    // Candidate projects: every non-deleted project in the user's orgs, minus
    // the source project itself.
    const { data: candidateRows } = await (supabase as any)
      .from("projects")
      .select("id,name,description,organization_id,organizations(name)")
      .is("deleted_at", null);

    const candidateProjects: ReorgCandidateProject[] = (
      (candidateRows || []) as Array<{
        id: string;
        name: string;
        description: string | null;
        organizations: { name: string } | null;
      }>
    )
      .filter((p) => p.id !== projectId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        organizationName: p.organizations?.name ?? null,
      }));

    const proposal = await classifyTasksForReorg({
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
      candidateProjects,
      currentProjectId: projectId,
      currentProjectName: sourceProject?.name ?? null,
      chain,
    });

    if (!apply) {
      return NextResponse.json({ projectId, proposal });
    }

    // Apply: build moves from the proposal (respecting an explicit taskIds set).
    const sectionByTask = new Map(tasks.map((t) => [t.id, t.section_id]));
    const moves: ReorgMove[] = proposal
      .filter((p) => p.suggestedProjectId)
      .filter((p) => !requestedTaskIds || requestedTaskIds.has(p.taskId))
      .map((p) => ({
        taskId: p.taskId,
        beforeProjectId: projectId,
        beforeSectionId: sectionByTask.get(p.taskId) ?? null,
        afterProjectId: p.suggestedProjectId as string,
        afterSectionId: null,
        reason: p.reason,
        confidence: p.confidence,
      }));

    if (moves.length === 0) {
      return NextResponse.json({
        projectId,
        proposal,
        batchId: null,
        movedCount: 0,
      });
    }

    const { batchId, movedCount } = await applyReorgBatch(supabase, {
      organizationId: authz.organizationId,
      projectId,
      createdBy: session.user.id,
      summary: {
        sourceProjectName: sourceProject?.name ?? null,
        movedCount: moves.length,
        destinations: Object.entries(
          moves.reduce<Record<string, number>>((acc, m) => {
            acc[m.afterProjectId] = (acc[m.afterProjectId] || 0) + 1;
            return acc;
          }, {}),
        ).map(([project_id, count]) => ({ project_id, count })),
      },
      moves,
    });

    return NextResponse.json({ projectId, batchId, movedCount, proposal });
  } catch (error) {
    console.error("Error reorganizing project tasks:", error);
    return NextResponse.json(
      { error: "Failed to reorganize project tasks" },
      { status: 500 },
    );
  }
}
