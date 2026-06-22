import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STAKE_KINDS = ["consequence", "reward"];
const SEVERITIES = ["minor", "moderate", "severe", "critical"];
const STATUSES = ["active", "defused", "eliminated", "expired"];

// Resolve the authenticated user (getUser revalidates against the Auth server),
// load the stake with the service-role admin client (the cookie client yields
// auth.uid()=NULL in route handlers — see app/api/keys/personal-access-tokens),
// then verify the user belongs to the stake's organization.
// Returns either { errorResponse } or { user, db, stake }.
async function authorizeStake(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    } as const;
  }

  const db = getAdminClient();

  const { data: stake, error: stakeError } = await db
    .from("stakes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (stakeError) {
    return {
      errorResponse: NextResponse.json(
        { error: "Failed to load stake" },
        { status: 500 },
      ),
    } as const;
  }

  if (!stake) {
    return {
      errorResponse: NextResponse.json(
        { error: "Stake not found" },
        { status: 404 },
      ),
    } as const;
  }

  const { data: membership, error: membershipError } = await db
    .from("user_organizations")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("organization_id", stake.organization_id)
    .maybeSingle();

  if (membershipError) {
    return {
      errorResponse: NextResponse.json(
        { error: "Failed to verify organization membership" },
        { status: 500 },
      ),
    } as const;
  }

  if (!membership) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }

  return { user, db, stake } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStake(id);
    if ("errorResponse" in auth) return auth.errorResponse;
    return NextResponse.json(auth.stake);
  } catch (error) {
    console.error("GET /api/stakes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stake" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStake(id);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { db } = auth;

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body?.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { error: "Stake name cannot be empty" },
          { status: 400 },
        );
      }
      updates.name = name;
    }

    if (body?.kind !== undefined) {
      if (!STAKE_KINDS.includes(body.kind)) {
        return NextResponse.json(
          { error: "kind must be one of: consequence, reward" },
          { status: 400 },
        );
      }
      updates.kind = body.kind;
    }

    if (body?.severity !== undefined) {
      if (body.severity !== null && !SEVERITIES.includes(body.severity)) {
        return NextResponse.json(
          {
            error:
              "severity must be one of: minor, moderate, severe, critical",
          },
          { status: 400 },
        );
      }
      updates.severity = body.severity;
    }

    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json(
          {
            error:
              "status must be one of: active, defused, eliminated, expired",
          },
          { status: 400 },
        );
      }
      updates.status = body.status;
    }

    if (body?.monetary_value !== undefined) {
      if (body.monetary_value === null) {
        updates.monetary_value = null;
      } else {
        const num = Number(body.monetary_value);
        if (!Number.isFinite(num) || num < 0) {
          return NextResponse.json(
            { error: "monetary_value must be a non-negative number" },
            { status: 400 },
          );
        }
        updates.monetary_value = num;
      }
    }

    if (body?.description !== undefined) updates.description = body.description;
    if (body?.project_id !== undefined || body?.projectId !== undefined)
      updates.project_id = body.project_id ?? body.projectId ?? null;
    if (body?.trigger_at !== undefined || body?.triggerAt !== undefined)
      updates.trigger_at = body.trigger_at ?? body.triggerAt ?? null;
    if (body?.recurrence !== undefined) updates.recurrence = body.recurrence;
    if (
      body?.recurrence_interval_days !== undefined ||
      body?.recurrenceIntervalDays !== undefined
    )
      updates.recurrence_interval_days =
        body.recurrence_interval_days ?? body.recurrenceIntervalDays ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await db
      .from("stakes")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to update stake" },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json({ error: "Stake not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/stakes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update stake" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStake(id);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { db } = auth;

    const now = new Date().toISOString();

    // Soft-delete the stake itself.
    const { error: stakeError } = await db
      .from("stakes")
      .update({ deleted_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (stakeError) {
      return NextResponse.json(
        { error: stakeError.message || "Failed to delete stake" },
        { status: 500 },
      );
    }

    // Soft-delete related edges where this stake is the parent or the child.
    const { error: parentEdgeError } = await db
      .from("stake_edges")
      .update({ deleted_at: now })
      .eq("parent_stake_id", id)
      .is("deleted_at", null);
    if (parentEdgeError) {
      console.error(
        "DELETE /api/stakes/[id] parent edge cleanup error:",
        parentEdgeError,
      );
    }

    const { error: childEdgeError } = await db
      .from("stake_edges")
      .update({ deleted_at: now })
      .eq("child_stake_id", id)
      .is("deleted_at", null);
    if (childEdgeError) {
      console.error(
        "DELETE /api/stakes/[id] child edge cleanup error:",
        childEdgeError,
      );
    }

    // Soft-delete related task↔stake links.
    const { error: linkError } = await db
      .from("task_stakes")
      .update({ deleted_at: now })
      .eq("stake_id", id)
      .is("deleted_at", null);
    if (linkError) {
      console.error(
        "DELETE /api/stakes/[id] task_stakes cleanup error:",
        linkError,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/stakes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete stake" },
      { status: 500 },
    );
  }
}
