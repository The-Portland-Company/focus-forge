import { NextRequest, NextResponse } from "next/server";
import {
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  normalizeTaskInput,
  serializeMobileTask,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendTaskLifecycleNotifications } from "@/lib/task-notifications";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";
import { normalizeRichText } from "@/lib/rich-text-sanitize";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const adapter = await getMobileAdapterForUser(auth.user.id);
    const task = await adapter.getTask(params.id);

    if (!task) {
      return NextResponse.json(
        mobileFailure("task_not_found", "Task not found for current user"),
        { status: 404 },
      );
    }

    return NextResponse.json(mobileSuccess(serializeMobileTask(task)), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to fetch task", error),
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const raw = await request.json();
    const payload = normalizeTaskInput(raw);
    const normalizedTaskContent =
      payload.description !== undefined ||
      payload.devnotes_meta !== undefined ||
      raw?.devnotesMeta !== undefined
        ? normalizeTaskContentFields({
            description:
              typeof payload.description === "string"
                ? normalizeRichText(payload.description)
                : undefined,
            devnotesMeta: raw?.devnotesMeta,
            devnotes_meta:
              typeof payload.devnotes_meta === "string"
                ? payload.devnotes_meta
                : undefined,
          })
        : null;
    const admin = getAdminClient();
    const { data: existingTask } = await admin
      .from("tasks")
      .select("id,name,description,assigned_to")
      .eq("id", params.id)
      .maybeSingle();

    const adapter = await getMobileAdapterForUser(auth.user.id);
    const updated = await adapter.updateTask(params.id, {
      ...payload,
      ...(normalizedTaskContent
        ? {
            description: normalizedTaskContent.description,
            devnotes_meta: normalizedTaskContent.devnotesMeta,
          }
        : {}),
      updated_at: new Date().toISOString(),
    });

    void sendTaskLifecycleNotifications({
      taskId: updated.id,
      actorUserId: auth.user.id,
      previousAssignedTo: existingTask?.assigned_to || null,
      previousText: [existingTask?.name || "", existingTask?.description || ""]
        .filter(Boolean)
        .join("\n"),
    });

    return NextResponse.json(mobileSuccess(serializeMobileTask(updated)), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to update task", error),
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
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const adapter = await getMobileAdapterForUser(auth.user.id);
    await adapter.deleteTask(params.id);

    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to delete task", error),
      { status: 500 },
    );
  }
}
