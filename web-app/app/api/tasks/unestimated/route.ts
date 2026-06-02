import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";

/**
 * Returns the next batch of unestimated tasks for the user, ordered by
 * priority (urgent first), then earliest due date, then creation date.
 *
 * Query params:
 *   limit       (1..100, default 20)
 *   projectId   (uuid, optional filter)
 *   orgId       (uuid, optional filter via projects.organization_id)
 *   total=1     (return only `{ total }` count — used by the nudge / page header)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));
  const projectId = url.searchParams.get("projectId");
  const orgId = url.searchParams.get("orgId");
  const wantsTotalOnly = url.searchParams.get("total") === "1";

  // Tasks visible to the user are scoped via RLS through projects/user_organizations.
  let query = supabase
    .from("tasks")
    .select(
      `id, name, description, priority, due_date, created_at, project_id,
       projects:project_id ( id, name, organization_id, organizations:organization_id ( id, name ) ),
       task_tags ( tag:tag_id ( name ) )`,
      { count: "exact" },
    )
    .is("time_estimate", null)
    .eq("completed", false)
    .order("priority", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (projectId) query = query.eq("project_id", projectId);
  // orgId filter applied client-side after fetch (Supabase doesn't filter through a joined FK easily).

  if (wantsTotalOnly) {
    const { count, error } = await query.limit(1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ total: count ?? 0 });
  }

  const { data, error, count } = await query.limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Subtask counts in a follow-up query (one round-trip).
  const taskIds = (data ?? []).map((t: any) => t.id);
  let subtaskCounts: Record<string, number> = {};
  if (taskIds.length > 0) {
    const { data: subs } = await supabase
      .from("tasks")
      .select("parent_id")
      .in("parent_id", taskIds);
    for (const row of subs ?? []) {
      const pid = (row as any).parent_id as string;
      subtaskCounts[pid] = (subtaskCounts[pid] || 0) + 1;
    }
  }

  const rows = (data ?? [])
    .filter((t: any) => {
      if (!orgId) return true;
      return t.projects?.organization_id === orgId;
    })
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      priority: t.priority,
      dueDate: t.due_date,
      createdAt: t.created_at,
      projectId: t.project_id,
      projectName: t.projects?.name ?? null,
      organizationId: t.projects?.organization_id ?? null,
      organizationName: t.projects?.organizations?.name ?? null,
      tags: (t.task_tags ?? [])
        .map((tt: any) => tt?.tag?.name)
        .filter((n: any): n is string => typeof n === "string"),
      subtaskCount: subtaskCounts[t.id] ?? 0,
    }));

  // Suppress unused param warning
  void user;

  return NextResponse.json({ tasks: rows, total: count ?? rows.length });
}
