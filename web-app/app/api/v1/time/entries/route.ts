import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import {
  createTimeEntry,
  ensureOrgMembership,
  ensureOrgTimeAdmin,
  getTimeEntryById,
  listTimeEntries,
} from "@/lib/time/server";
import { normalizeTimeZone } from "@/lib/time/utils";

function parseList(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = await requireTimePrincipal(request, ["read"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  try {
    const entries = await listTimeEntries(auth.principal as any, {
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      projectId: request.nextUrl.searchParams.get("projectId"),
      sectionId: request.nextUrl.searchParams.get("sectionId"),
      taskIds: parseList(request.nextUrl.searchParams, "taskIds"),
      userIds: parseList(request.nextUrl.searchParams, "userIds"),
      roles: parseList(request.nextUrl.searchParams, "roles"),
      startedAfter: request.nextUrl.searchParams.get("startedAfter"),
      endedBefore: request.nextUrl.searchParams.get("endedBefore"),
      query: request.nextUrl.searchParams.get("query"),
    });

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error("GET /api/v1/time/entries error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load time entries." } },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireTimePrincipal(request, ["write"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  try {
    const body = await request.json();
    const organizationId = String(body.organizationId || "");
    const targetUserId =
      auth.principal.kind === "org_token"
        ? String(body.userId || auth.principal.createdBy)
        : String(body.userId || auth.principal.userId);

    if (!organizationId) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "organizationId is required." } },
        { status: 400 },
      );
    }

    if (auth.principal.kind !== "org_token" && targetUserId !== auth.principal.userId) {
      const canAdmin = await ensureOrgTimeAdmin(auth.principal.userId, organizationId);
      if (!canAdmin) {
        return NextResponse.json(
          { error: { code: "forbidden", message: "Cannot create time for another user." } },
          { status: 403 },
        );
      }
    }

    const isMember = await ensureOrgMembership(targetUserId, organizationId);
    if (!isMember) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Target user is not in the organization." } },
        { status: 403 },
      );
    }

    const created = await createTimeEntry({
      organizationId,
      userId: targetUserId,
      projectId: body.projectId ?? null,
      sectionId: body.sectionId ?? null,
      taskIds: Array.isArray(body.taskIds) ? body.taskIds : [],
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Focus session",
      description: typeof body.description === "string" ? body.description : null,
      timezone: normalizeTimeZone(body.timezone),
      startedAt:
        typeof body.startedAt === "string" && body.startedAt
          ? new Date(body.startedAt).toISOString()
          : new Date().toISOString(),
      endedAt:
        typeof body.endedAt === "string" && body.endedAt
          ? new Date(body.endedAt).toISOString()
          : null,
      source: typeof body.source === "string" ? body.source : "focus_forge",
      sourceMetadata:
        body.sourceMetadata && typeof body.sourceMetadata === "object"
          ? body.sourceMetadata
          : {},
    });

    const entry = await getTimeEntryById(created.id);
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/v1/time/entries error:", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: error?.message || "Failed to create time entry.",
        },
      },
      { status: 500 },
    );
  }
}
