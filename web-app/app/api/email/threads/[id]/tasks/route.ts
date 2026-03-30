import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  createTasksForThread,
  getThreadDetailForUser,
} from "@/lib/email-inbox/server";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const thread = await getThreadDetailForUser(auth.user.id, params.id);
    return NextResponse.json(thread.linkedTasks || []);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load linked tasks",
      },
      { status: 404 },
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const params = await props.params;
    const tasks = await createTasksForThread(
      auth.user.id,
      params.id,
      body.projectId || null,
    );
    return NextResponse.json(tasks, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate tasks",
      },
      { status: 400 },
    );
  }
}
