import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabase,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

type ReorderEntry = { id: string; order: number };

/**
 * Normalize the request body into an ordered list of { id, order } entries.
 * Accepts either:
 *  - { order: ["sectionA", "sectionB", ...] }  (index becomes the order)
 *  - { section_ids: [...] } / { sectionIds: [...] } (index becomes the order)
 *  - { sections: [{ id, order }, ...] }          (explicit order values)
 */
function parseReorderBody(body: any): ReorderEntry[] | null {
  const idList =
    (Array.isArray(body?.order) && body.order.every((v: unknown) => typeof v === "string")
      ? (body.order as string[])
      : null) ||
    (Array.isArray(body?.section_ids) ? (body.section_ids as unknown[]) : null) ||
    (Array.isArray(body?.sectionIds) ? (body.sectionIds as unknown[]) : null);

  if (idList) {
    const entries: ReorderEntry[] = [];
    idList.forEach((id, index) => {
      if (typeof id === "string" && id.trim()) {
        entries.push({ id: id.trim(), order: index });
      }
    });
    return entries.length > 0 ? entries : null;
  }

  if (Array.isArray(body?.sections)) {
    const entries: ReorderEntry[] = [];
    body.sections.forEach((item: any, index: number) => {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (!id) return;
      const order = Number.isFinite(Number(item?.order))
        ? Number(item.order)
        : index;
      entries.push({ id, order });
    });
    return entries.length > 0 ? entries : null;
  }

  return null;
}

export async function POST(
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

    const entries = parseReorderBody(body);
    if (!entries) {
      return NextResponse.json(
        mobileFailure(
          "validation_error",
          "An ordered list of section ids is required (order, section_ids, or sections[])",
        ),
        { status: 400 },
      );
    }

    const adapter = await getMobileAdapterForUser(auth.user.id);
    const projects = await adapter.getProjects();
    const hasAccess = projects.some((project: any) => project.id === projectId);

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure("project_not_found", "Project not found for current user"),
        { status: 404 },
      );
    }

    const serviceSupabase = createServiceSupabase();

    // Only reorder sections that actually belong to this project.
    const { data: existingSections, error: fetchError } = await serviceSupabase
      .from("sections")
      .select("id")
      .eq("project_id", projectId)
      .is("deleted_at", null);

    if (fetchError) {
      return NextResponse.json(
        mobileFailure(
          "section_fetch_failed",
          "Failed to load sections for project",
          fetchError,
        ),
        { status: 500 },
      );
    }

    const validIds = new Set((existingSections || []).map((s: any) => s.id));
    const updates = entries.filter((entry) => validIds.has(entry.id));

    if (updates.length === 0) {
      return NextResponse.json(
        mobileFailure(
          "validation_error",
          "None of the provided section ids belong to this project",
        ),
        { status: 400 },
      );
    }

    const updatedAt = new Date().toISOString();
    const results = await Promise.all(
      updates.map((entry) =>
        serviceSupabase
          .from("sections")
          .update({ todoist_order: entry.order, updated_at: updatedAt })
          .eq("id", entry.id)
          .eq("project_id", projectId)
          .select("id,name")
          .single(),
      ),
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      return NextResponse.json(
        mobileFailure(
          "section_reorder_failed",
          failed.error.message || "Failed to reorder sections",
          failed.error,
        ),
        { status: 500 },
      );
    }

    const ordered = updates.map((entry) => ({
      id: entry.id,
      section_id: entry.id,
      order: entry.order,
    }));

    return NextResponse.json(mobileSuccess(ordered), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to reorder project sections", error),
      { status: 500 },
    );
  }
}
