import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  addProjectToThread,
  removeProjectFromThread,
} from "@/lib/email-inbox/server";

// POST { projectId } — add a project association to the thread (multi-project).
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
    };
    const projectId = String(body.projectId || "").trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const thread = await addProjectToThread(auth.user.id, params.id, projectId);
    return NextResponse.json(thread);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to add project to email thread",
      },
      { status: 400 },
    );
  }
}

// DELETE { projectId } — remove a project association from the thread.
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
    };
    const projectId = String(body.projectId || "").trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const thread = await removeProjectFromThread(
      auth.user.id,
      params.id,
      projectId,
    );
    return NextResponse.json(thread);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove project from email thread",
      },
      { status: 400 },
    );
  }
}
