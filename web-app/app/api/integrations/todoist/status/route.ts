import { NextResponse } from "next/server";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

// GET /api/integrations/todoist/status — replaces components/todoist-integration.tsx's
// former direct browser Supabase reads (profile todoist_* fields, task/project/
// section/comment/tag counts, sync history), which stopped working once the
// browser lost its Supabase session under TPC Auth. Runs server-side with the
// caller's RLS-scoped client from requireViewer().
export async function GET() {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;
  const { user, supabase } = result;

  const [{ data: profile }, projects, tasks, completed, sections, comments, tags, history] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "todoist_api_token, todoist_sync_enabled, todoist_auto_sync, todoist_sync_frequency, todoist_email, todoist_full_name, todoist_premium, last_todoist_sync",
        )
        .eq("id", user.id)
        .single(),
      supabase.from("projects").select("id", { count: "exact", head: true }),
      supabase.from("tasks").select("id", { count: "exact", head: true }),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("completed", true),
      supabase.from("sections").select("id", { count: "exact", head: true }),
      supabase.from("comments").select("id", { count: "exact", head: true }),
      supabase.from("tags").select("id", { count: "exact", head: true }),
      supabase
        .from("todoist_sync_history")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  return NextResponse.json({
    profile: profile ?? null,
    stats: {
      totalProjects: projects.count || 0,
      totalTasks: tasks.count || 0,
      completedTasks: completed.count || 0,
      totalSections: sections.count || 0,
      totalComments: comments.count || 0,
      totalTags: tags.count || 0,
    },
    history: history.data ?? [],
  });
}
