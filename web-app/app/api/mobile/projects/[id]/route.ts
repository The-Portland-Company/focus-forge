import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabase,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

async function resolveAccessibleProject(userId: string, projectId: string) {
  const adapter = await getMobileAdapterForUser(userId);
  const projects = await adapter.getProjects();
  const project = (projects || []).find((p: any) => p.id === projectId);
  return { adapter, project };
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const projectId = params.id;
    const body = await request.json();

    if (typeof body?.archived !== "boolean") {
      return NextResponse.json(
        mobileFailure("validation_error", "archived (boolean) is required"),
        { status: 400 },
      );
    }

    const { adapter, project } = await resolveAccessibleProject(
      auth.user.id,
      projectId,
    );

    if (!project) {
      return NextResponse.json(
        mobileFailure("project_not_found", "Project not found for current user"),
        { status: 404 },
      );
    }

    const updated = await adapter.updateProject(projectId, {
      archived: body.archived,
    });
    return NextResponse.json(mobileSuccess(updated), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to update project", error),
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const projectId = params.id;

    const { adapter, project } = await resolveAccessibleProject(
      auth.user.id,
      projectId,
    );

    if (!project) {
      return NextResponse.json(
        mobileFailure("project_not_found", "Project not found for current user"),
        { status: 404 },
      );
    }

    // Count tasks + sections that will cascade for the response (best-effort).
    const service = createServiceSupabase();
    const [{ count: taskCount }, { count: sectionCount }] = await Promise.all([
      service
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("deleted_at", null),
      service
        .from("sections")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("deleted_at", null),
    ]);

    // soft_delete_entity RPC cascades project -> sections + tasks (RLS-scoped
    // via the mobile adapter's authed client).
    const { batchId } = await adapter.deleteProject(projectId);

    if (project.organization_id) {
      await adapter.writeAuditLog({
        organizationId: project.organization_id,
        actorUserId: auth.user.id,
        action: "project.delete",
        entityType: "project",
        entityId: projectId,
        metadata: { name: project.name ?? null, batchId, source: "mobile" },
      });
    }

    return NextResponse.json(
      mobileSuccess({
        id: projectId,
        deleted: true,
        batchId,
        deletedTaskCount: taskCount ?? 0,
        deletedSectionCount: sectionCount ?? 0,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to delete project", error),
      { status: 500 },
    );
  }
}
