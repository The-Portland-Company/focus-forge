import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { requireProjectAdmin } from "@/lib/api/authz";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import { normalizeProjectContentFields } from "@/lib/devnotes-meta";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  computeAddedMembershipUserIds,
  sendProjectMembershipNotifications,
} from "@/lib/task-notifications";

export async function PUT(
  request: NextRequest,
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

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      params.id,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates = await request.json();
    const admin = getAdminClient();
    const shouldCheckMembershipChanges =
      updates?.memberIds !== undefined || updates?.ownerId !== undefined;
    const { data: existingMembershipsRaw } = shouldCheckMembershipChanges
      ? await admin
          .from("user_projects")
          .select("user_id,is_owner")
          .eq("project_id", params.id)
      : { data: [] as Array<{ user_id: string; is_owner: boolean | null }> };
    const existingMemberships = (existingMembershipsRaw || []) as Array<{
      user_id: string;
      is_owner: boolean | null;
    }>;

    if (
      updates?.description !== undefined ||
      updates?.devnotesMeta !== undefined ||
      updates?.devnotes_meta !== undefined
    ) {
      const normalizedContent = normalizeProjectContentFields({
        description:
          updates?.description !== undefined
            ? normalizeRichText(updates.description)
            : undefined,
        devnotesMeta: updates?.devnotesMeta,
        devnotes_meta: updates?.devnotes_meta,
      });

      if (updates?.description !== undefined) {
        updates.description = normalizedContent.description;
      }

      if (
        updates?.devnotesMeta !== undefined ||
        updates?.devnotes_meta !== undefined ||
        normalizedContent.devnotesMeta
      ) {
        updates.devnotes_meta = normalizedContent.devnotesMeta;
      }
    }
    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const updatedProject = await adapter.updateProject(params.id, updates);

    if (!updatedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (shouldCheckMembershipChanges) {
      const addedUserIds = computeAddedMembershipUserIds({
        existingUserIds: existingMemberships.map((row) => row.user_id),
        existingOwnerIds: existingMemberships
          .filter((row) => Boolean(row.is_owner))
          .map((row) => row.user_id),
        memberIds: Array.isArray(updates?.memberIds)
          ? updates.memberIds
          : undefined,
        ownerId:
          typeof updates?.ownerId === "string" ? updates.ownerId : undefined,
        actorUserId: session.user.id,
      });

      void sendProjectMembershipNotifications({
        projectId: params.id,
        actorUserId: session.user.id,
        addedUserIds,
      });
    }

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
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

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      params.id,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    await adapter.deleteProject(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
