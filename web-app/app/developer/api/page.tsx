import { ApiDocsPage } from "@/components/api-docs-page";
import { createClient } from "@/lib/supabase/server";
import { toApiKeyMeta } from "@/lib/api/keys/queries";
import type { ApiKeyMeta } from "@/lib/api/keys/types";
import { buildApiDocsRegistry } from "@/lib/api/docs/registry";

export const dynamic = "force-dynamic";

export default async function DeveloperApiDocsPage() {
  const entries = await buildApiDocsRegistry();
  const supabase = await createClient();

  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();

  let personalAccessTokens: ApiKeyMeta[] = [];
  let organizationApiKeys: ApiKeyMeta[] = [];

  if (!authError && session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    const isGlobalAdmin = ["admin", "super_admin"].includes(profile?.role || "");

    const [{ data: organizationMemberships, error: membershipError }, { data: organizationKeys }, { data: personalTokens, error: personalError }] = await Promise.all([
      supabase
        .from("user_organizations")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .eq("is_owner", true),
      isGlobalAdmin
        ? supabase
            .from("organization_api_keys")
            .select(
              "id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active, organization_id",
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: null, error: null } as const),
      supabase
        .from("personal_access_tokens")
        .select(
          "id, name, prefix, scopes, expires_at, last_used_at, created_at, created_by, is_active",
        )
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false }),
    ]);

    const adminOrgIds = organizationMemberships?.map((row: any) => row.organization_id) || [];

    if (!personalError && personalTokens) {
      personalAccessTokens = personalTokens.map((row: any) => toApiKeyMeta(row));
    }

    if (!membershipError && organizationKeys) {
      const resolved =
        isGlobalAdmin
          ? organizationKeys
          : organizationKeys.filter((row: any) => adminOrgIds.includes(row.organization_id));
      organizationApiKeys = (resolved || []).map((row: any) => toApiKeyMeta(row));
    }
  }

  return (
    <ApiDocsPage
      entries={entries}
      isAuthenticated={Boolean(session?.user)}
      personalAccessTokens={personalAccessTokens}
      organizationApiKeys={organizationApiKeys}
    />
  );
}
