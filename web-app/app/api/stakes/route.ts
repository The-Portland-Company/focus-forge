import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

export const dynamic = "force-dynamic";

const STAKE_KINDS = ["consequence", "reward"];
const SEVERITIES = ["minor", "moderate", "severe", "critical"];
const STATUSES = ["active", "defused", "eliminated", "expired"];

async function resolveOrganizationId(
  adapter: SupabaseAdapter,
  explicit?: unknown,
): Promise<string | null> {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const orgs = await adapter.getOrganizations();
  return orgs?.[0]?.id || null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const organizationId = await resolveOrganizationId(
      adapter,
      request.nextUrl.searchParams.get("organizationId"),
    );
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 },
      );
    }

    const stakes = await adapter.getStakes(organizationId);
    return NextResponse.json(stakes);
  } catch (error) {
    console.error("Error fetching stakes:", error);
    return NextResponse.json(
      { error: "Failed to fetch stakes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);

    const organizationId = await resolveOrganizationId(
      adapter,
      body?.organization_id ?? body?.organizationId,
    );
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 },
      );
    }

    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Stake name is required" },
        { status: 400 },
      );
    }

    const kind = body?.kind;
    if (!STAKE_KINDS.includes(kind)) {
      return NextResponse.json(
        { error: "kind must be one of: consequence, reward" },
        { status: 400 },
      );
    }

    const severity = body?.severity ?? null;
    if (severity !== null && !SEVERITIES.includes(severity)) {
      return NextResponse.json(
        { error: "severity must be one of: minor, moderate, severe, critical" },
        { status: 400 },
      );
    }

    const status = body?.status ?? "active";
    if (!STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "status must be one of: active, defused, eliminated, expired" },
        { status: 400 },
      );
    }

    let monetaryValue: number | null = null;
    if (body?.monetary_value !== undefined && body?.monetary_value !== null) {
      const num = Number(body.monetary_value);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json(
          { error: "monetary_value must be a non-negative number" },
          { status: 400 },
        );
      }
      monetaryValue = num;
    }

    const stake = await adapter.createStake({
      organization_id: organizationId,
      project_id: body?.project_id ?? body?.projectId ?? null,
      kind,
      name,
      description: body?.description ?? null,
      monetary_value: monetaryValue,
      severity,
      trigger_at: body?.trigger_at ?? body?.triggerAt ?? null,
      recurrence: body?.recurrence ?? null,
      recurrence_interval_days:
        body?.recurrence_interval_days ?? body?.recurrenceIntervalDays ?? null,
      status,
    });

    return NextResponse.json(stake, { status: 201 });
  } catch (error) {
    console.error("Error creating stake:", error);
    return NextResponse.json(
      { error: "Failed to create stake" },
      { status: 500 },
    );
  }
}
