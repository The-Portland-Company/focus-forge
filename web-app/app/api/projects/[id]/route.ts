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
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";
import { isProjectLockedError } from "@/lib/db/project-lock-error";
import { parseOrganizationIdsInput } from "@/lib/api/project-organization-ids";
import {
  PROJECT_ORG_EMBED,
  isMissingProjectOrganizations,
  projectOrgIdsFromRow,
  projectOrgLinksFromRow,
} from "@/lib/db/project-orgs";

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      params.id,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const updates = await request.json();
    const admin = getAdminClient();

    // Multi-org sharing: ONLY an admin of the PRIMARY org may change which orgs
    // a project is shared with or move its primary org. Managers of an
    // additional org keep full project admin otherwise (rename, members, ...).
    const requestedOrgIds = parseOrganizationIdsInput(updates);
    const requestedPrimary =
      updates?.organization_id ?? updates?.organizationId ?? undefined;
    const changesPrimary =
      requestedPrimary !== undefined && requestedPrimary !== authz.organizationId;
    if ((requestedOrgIds !== undefined || changesPrimary) && !authz.isPrimaryAdmin) {
      return NextResponse.json(
        {
          error:
            "Only an admin of the project's primary organization can change its organizations",
        },
        { status: 403 },
      );
    }
    if (requestedOrgIds !== undefined) {
      await adapter.validateOrganizationIds(requestedOrgIds);
    }
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
    const updatedProject = await adapter.updateProject(params.id, updates);

    if (!updatedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let sharingResult: { added: string[]; removed: string[] } | null = null;
    if (requestedOrgIds !== undefined) {
      // Primary is always kept; everything else becomes the additional set.
      sharingResult = await adapter.setProjectOrganizations(
        params.id,
        requestedOrgIds,
      );
      if (
        (sharingResult.added.length > 0 || sharingResult.removed.length > 0) &&
        updatedProject.organization_id
      ) {
        await adapter.writeAuditLog({
          organizationId: updatedProject.organization_id,
          actorUserId: session.user.id,
          action: "project.share",
          entityType: "project",
          entityId: params.id,
          metadata: {
            name: updatedProject.name ?? null,
            addedOrganizationIds: sharingResult.added,
            removedOrganizationIds: sharingResult.removed,
          },
        });
      }
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

    // Report the authoritative org set back to the client.
    let orgFields: Record<string, unknown> = {};
    {
      const { data: orgRow, error: orgRowError } = await admin
        .from("projects")
        .select(`organization_id, ${PROJECT_ORG_EMBED}`)
        .eq("id", params.id)
        .maybeSingle();
      if (!orgRowError && orgRow) {
        orgFields = {
          organizationIds: projectOrgIdsFromRow(orgRow as any),
          organizationLinks: projectOrgLinksFromRow(orgRow as any),
        };
      } else if (orgRowError && !isMissingProjectOrganizations(orgRowError)) {
        console.error("Failed to read project organizations:", orgRowError);
      }
    }

    return NextResponse.json({ ...updatedProject, ...orgFields });
  } catch (error) {
    if (isProjectLockedError(error)) {
      return NextResponse.json({ error: "Project is locked" }, { status: 423 });
    }
    if ((error as any)?.status === 400) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
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
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      params.id,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);

    // Snapshot org/name for the audit entry before the soft-delete.
    const { data: projectRow } = (await (supabase as any)
      .from("projects")
      .select("organization_id,name")
      .eq("id", params.id)
      .maybeSingle()) as { data: { organization_id: string; name: string } | null };

    const { batchId } = await adapter.deleteProject(params.id);

    if (projectRow?.organization_id) {
      await adapter.writeAuditLog({
        organizationId: projectRow.organization_id,
        actorUserId: session.user.id,
        action: "project.delete",
        entityType: "project",
        entityId: params.id,
        metadata: { name: projectRow.name ?? null, batchId },
      });
    }

    return NextResponse.json({ success: true, batchId });
  } catch (error) {
    if (isProjectLockedError(error)) {
      return NextResponse.json({ error: "Project is locked" }, { status: 423 });
    }
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
