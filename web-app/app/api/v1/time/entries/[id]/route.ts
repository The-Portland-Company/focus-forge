import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import {
  deleteTimeEntry,
  ensureOrgMembership,
  ensureOrgTimeAdmin,
  getTimeEntryById,
  updateTimeEntry,
} from "@/lib/time/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeTimeZone } from "@/lib/time/utils";

async function getEntryRecord(id: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .schema("time_tracking")
    .from("entries")
    .select("id,organization_id,user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireTimePrincipal(request, ["read"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const params = await props.params;

  try {
    const entry = await getTimeEntryById(params.id);
    if (
      auth.principal.kind !== "org_token" &&
      entry.userId !== auth.principal.userId &&
      !(await ensureOrgTimeAdmin(auth.principal.userId, entry.organizationId))
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    if (
      auth.principal.kind === "org_token" &&
      entry.organizationId !== auth.principal.organizationId
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error("GET /api/v1/time/entries/[id] error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load time entry." } },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireTimePrincipal(request, ["write"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const params = await props.params;

  try {
    const existing = await getEntryRecord(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Time entry not found." } },
        { status: 404 },
      );
    }

    if (auth.principal.kind === "org_token") {
      if (existing.organization_id !== auth.principal.organizationId) {
        return NextResponse.json(
          { error: { code: "forbidden", message: "Forbidden." } },
          { status: 403 },
        );
      }
    } else if (
      existing.user_id !== auth.principal.userId &&
      !(await ensureOrgTimeAdmin(auth.principal.userId, existing.organization_id))
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    const body = await request.json();
    const targetUserId =
      auth.principal.kind === "org_token"
        ? String(body.userId || existing.user_id)
        : String(body.userId || existing.user_id);

    if (targetUserId !== existing.user_id) {
      const allowed =
        auth.principal.kind === "org_token"
          ? true
          : await ensureOrgTimeAdmin(auth.principal.userId, existing.organization_id);

      if (!allowed) {
        return NextResponse.json(
          { error: { code: "forbidden", message: "Cannot reassign time entry." } },
          { status: 403 },
        );
      }

      const isMember = await ensureOrgMembership(targetUserId, existing.organization_id);
      if (!isMember) {
        return NextResponse.json(
          { error: { code: "forbidden", message: "Target user is not in the organization." } },
          { status: 403 },
        );
      }
    }

    const updated = await updateTimeEntry(params.id, {
      organizationId: body.organizationId,
      userId: targetUserId,
      projectId: body.projectId,
      sectionId: body.sectionId,
      taskIds: Array.isArray(body.taskIds) ? body.taskIds : undefined,
      title: body.title,
      description: body.description,
      timezone: body.timezone ? normalizeTimeZone(body.timezone) : undefined,
      startedAt:
        typeof body.startedAt === "string" ? new Date(body.startedAt).toISOString() : undefined,
      endedAt:
        body.endedAt === null
          ? null
          : typeof body.endedAt === "string"
            ? new Date(body.endedAt).toISOString()
            : undefined,
      sourceMetadata:
        body.sourceMetadata && typeof body.sourceMetadata === "object"
          ? body.sourceMetadata
          : undefined,
    });

    return NextResponse.json({ data: updated });
  } catch (error: any) {
    console.error("PATCH /api/v1/time/entries/[id] error:", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: error?.message || "Failed to update time entry.",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireTimePrincipal(request, ["write"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const params = await props.params;

  try {
    const existing = await getEntryRecord(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Time entry not found." } },
        { status: 404 },
      );
    }

    if (auth.principal.kind === "org_token") {
      if (existing.organization_id !== auth.principal.organizationId) {
        return NextResponse.json(
          { error: { code: "forbidden", message: "Forbidden." } },
          { status: 403 },
        );
      }
    } else if (
      existing.user_id !== auth.principal.userId &&
      !(await ensureOrgTimeAdmin(auth.principal.userId, existing.organization_id))
    ) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    await deleteTimeEntry(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/v1/time/entries/[id] error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to delete time entry." } },
      { status: 500 },
    );
  }
}
