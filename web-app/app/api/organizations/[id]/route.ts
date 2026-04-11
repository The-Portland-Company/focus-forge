import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { requireOrgAdmin } from "@/lib/api/authz";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  computeAddedMembershipUserIds,
  sendOrganizationMembershipNotifications,
} from "@/lib/task-notifications";

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authz = await requireOrgAdmin(supabase, session.user.id, params.id);
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const admin = getAdminClient();
    const shouldCheckMembershipChanges =
      body?.memberIds !== undefined || body?.ownerId !== undefined;
    const { data: existingMembershipsRaw } = shouldCheckMembershipChanges
      ? await admin
          .from("user_organizations")
          .select("user_id,is_owner")
          .eq("organization_id", params.id)
      : { data: [] as Array<{ user_id: string; is_owner: boolean | null }> };
    const existingMemberships = (existingMembershipsRaw || []) as Array<{
      user_id: string;
      is_owner: boolean | null;
    }>;

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const updatedOrg = await adapter.updateOrganization(params.id, body);

    if (updatedOrg) {
      if (shouldCheckMembershipChanges) {
        const addedUserIds = computeAddedMembershipUserIds({
          existingUserIds: existingMemberships.map((row) => row.user_id),
          existingOwnerIds: existingMemberships
            .filter((row) => Boolean(row.is_owner))
            .map((row) => row.user_id),
          memberIds: Array.isArray(body?.memberIds)
            ? body.memberIds
            : undefined,
          ownerId: typeof body?.ownerId === "string" ? body.ownerId : undefined,
          actorUserId: session.user.id,
        });

        void sendOrganizationMembershipNotifications({
          organizationId: params.id,
          actorUserId: session.user.id,
          addedUserIds,
        });
      }

      return NextResponse.json(updatedOrg);
    } else {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }
  } catch (error) {
    console.error("Error updating organization:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    await adapter.deleteOrganization(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting organization:", error);
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 },
    );
  }
}
