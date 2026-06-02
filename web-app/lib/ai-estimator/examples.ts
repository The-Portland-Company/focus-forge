import { createClient } from "@/lib/supabase/server";

export interface CalibrationExample {
  name: string;
  description?: string | null;
  projectName?: string | null;
  acceptedMinutes: number;
}

/**
 * Pulls the user's recent accepted estimates so the AI can calibrate to their pace.
 * If a projectName is provided, examples from that project are prioritized.
 */
export async function fetchRecentExamples(
  userId: string,
  options?: { projectName?: string | null; limit?: number },
): Promise<CalibrationExample[]> {
  const limit = options?.limit ?? 12;
  const supabase = await createClient();

  // Same-project examples are most relevant; pull those first, then top up with global.
  const sameProject = options?.projectName
    ? await (supabase as any)
        .from("task_estimate_examples")
        .select("task_name, task_description, project_name, accepted_minutes")
        .eq("user_id", userId)
        .eq("project_name", options.projectName)
        .order("created_at", { ascending: false })
        .limit(limit)
    : { data: null as any[] | null, error: null };

  const seen = new Set<string>();
  const results: CalibrationExample[] = [];

  const push = (row: any) => {
    if (!row?.task_name) return;
    const key = `${row.task_name}::${row.accepted_minutes}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      name: row.task_name,
      description: row.task_description ?? null,
      projectName: row.project_name ?? null,
      acceptedMinutes: row.accepted_minutes,
    });
  };

  (sameProject.data ?? []).forEach(push);

  if (results.length < limit) {
    const { data } = await (supabase as any)
      .from("task_estimate_examples")
      .select("task_name, task_description, project_name, accepted_minutes")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    (data ?? []).forEach((row: any) => {
      if (results.length < limit) push(row);
    });
  }

  return results.slice(0, limit);
}
