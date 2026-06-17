import { NextRequest, NextResponse } from "next/server";
import {
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

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

    const adapter = await getMobileAdapterForUser(auth.user.id);
    const projects = await adapter.getProjects();
    const hasAccess = projects.some((project: any) => project.id === projectId);

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure("project_not_found", "Project not found for current user"),
        { status: 404 },
      );
    }

    const updated = await adapter.updateProject(projectId, body || {});
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

    const adapter = await getMobileAdapterForUser(auth.user.id);
    const projects = await adapter.getProjects();
    const hasAccess = projects.some((project: any) => project.id === projectId);

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure("project_not_found", "Project not found for current user"),
        { status: 404 },
      );
    }

    await adapter.deleteProject(projectId);
    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to delete project", error),
      { status: 500 },
    );
  }
}
