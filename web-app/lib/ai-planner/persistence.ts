import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type PlannerMessageRow = {
  id: string;
  session_id: string;
  role: "system" | "user" | "assistant";
  content_text: string | null;
  content_json: Record<string, unknown> | null;
  token_meta: Record<string, unknown> | null;
  created_at: string;
};

export type PlannerArtifactRow = {
  id: string;
  session_id: string;
  type: "plan" | "task_blueprint";
  payload_json: Record<string, unknown>;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export function createPlannerAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase service role environment variables are missing");
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAuthorizedProject(
  supabase: ReturnType<typeof createPlannerAdminClient>,
  userId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch project: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", data.organization_id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Failed to verify project access: ${membershipError.message}`);
  }

  if (!membership) {
    return null;
  }

  return {
    id: data.id as string,
    name: (data.name as string) || "Project",
    organizationId: data.organization_id as string,
  };
}

export function validatePlanDraftQuality(planDraft: any): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!planDraft || typeof planDraft !== "object") {
    missing.push("Plan draft is missing");
    return { valid: false, missing };
  }

  if (!Array.isArray(planDraft.objectives) || planDraft.objectives.length < 3) {
    missing.push("At least 3 concrete objectives");
  }

  if (!planDraft.scope || !Array.isArray(planDraft.scope.in) || planDraft.scope.in.length < 3) {
    missing.push("Clear in-scope items (3+)");
  }

  if (!Array.isArray(planDraft.architecture) || planDraft.architecture.length < 3) {
    missing.push("Architecture details (3+ points)");
  }

  if (!Array.isArray(planDraft.milestones) || planDraft.milestones.length < 3) {
    missing.push("Milestones with acceptance criteria (3+)");
  }

  if (!Array.isArray(planDraft.risks) || planDraft.risks.length < 2) {
    missing.push("Risks with mitigations (2+)");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
