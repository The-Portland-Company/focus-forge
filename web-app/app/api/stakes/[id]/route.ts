import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

export const dynamic = "force-dynamic";

const SEVERITIES = ["minor", "moderate", "severe", "critical"];
const STATUSES = ["active", "defused", "eliminated", "expired"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const stake = await adapter.getStakeById(id);
    if (!stake) {
      return NextResponse.json({ error: "Stake not found" }, { status: 404 });
    }
    return NextResponse.json(stake);
  } catch (error) {
    console.error("Error fetching stake:", error);
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
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { id } = await params;
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
    if (body?.description !== undefined) updates.description = body.description;
    if (body?.project_id !== undefined || body?.projectId !== undefined)
      updates.project_id = body.project_id ?? body.projectId ?? null;
    if (body?.kind !== undefined) {
      if (!["consequence", "reward"].includes(body.kind)) {
        return NextResponse.json(
          { error: "kind must be one of: consequence, reward" },
          { status: 400 },
        );
      }
      updates.kind = body.kind;
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
    if (body?.trigger_at !== undefined || body?.triggerAt !== undefined)
      updates.trigger_at = body.trigger_at ?? body.triggerAt ?? null;
    if (body?.recurrence !== undefined) updates.recurrence = body.recurrence;
    if (
      body?.recurrence_interval_days !== undefined ||
      body?.recurrenceIntervalDays !== undefined
    )
      updates.recurrence_interval_days =
        body.recurrence_interval_days ?? body.recurrenceIntervalDays ?? null;
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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const stake = await adapter.updateStake(id, updates);
    if (!stake) {
      return NextResponse.json({ error: "Stake not found" }, { status: 404 });
    }
    return NextResponse.json(stake);
  } catch (error) {
    console.error("Error updating stake:", error);
    return NextResponse.json(
      { error: "Failed to update stake" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const stake = await adapter.softDeleteStake(id);
    if (!stake) {
      return NextResponse.json({ error: "Stake not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stake:", error);
    return NextResponse.json(
      { error: "Failed to delete stake" },
      { status: 500 },
    );
  }
}
