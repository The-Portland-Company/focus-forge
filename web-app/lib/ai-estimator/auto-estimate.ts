import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateTaskMinutesWithModel } from "./server";
import { fetchEstimatorModelChains } from "./chains";

/**
 * Agent-created tasks must carry a time estimate. When an agent didn't supply
 * one, fill it in from the estimator. Callers decide what counts as agent-created. Best-effort: never throws, and never
 * overwrites an estimate that is already set.
 */
export async function ensureAgentTaskEstimate(
  admin: SupabaseClient<any, any, any>,
  taskId: string,
  userId: string,
): Promise<number | null> {
  try {
    const { data: task } = await (admin as any)
      .from("tasks")
      .select("id, name, description, priority, time_estimate")
      .eq("id", taskId)
      .maybeSingle();
    if (!task || task.time_estimate != null) {
      return task?.time_estimate ?? null;
    }
    const modelChains = await fetchEstimatorModelChains(admin, userId);
    const { minutes } = await estimateTaskMinutesWithModel({
      name: task.name,
      description: task.description,
      priority: task.priority,
      modelChains,
    });
    await (admin as any)
      .from("tasks")
      .update({ time_estimate: minutes })
      .eq("id", taskId)
      .is("time_estimate", null);
    return minutes;
  } catch (e) {
    console.error("[estimator] auto-estimate for agent task failed:", e);
    return null;
  }
}
