import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultModelChains,
  type AIModelChains,
} from "@/lib/ai/model-chains";

/**
 * Load a user's persisted AI model chains (estimator + assistant) from their
 * profile. Best-effort: any error returns the quality-first defaults so the
 * estimator never hard-fails on a missing column / row.
 */
export async function fetchEstimatorModelChains(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<Partial<AIModelChains>> {
  try {
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("ai_model_chains")
      .eq("id", userId)
      .single();
    if (error || !data?.ai_model_chains) return defaultModelChains();
    return data.ai_model_chains as Partial<AIModelChains>;
  } catch {
    return defaultModelChains();
  }
}
