import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

export const dynamic = "force-dynamic";

const RESOLUTION_TYPES = ["defuses_once", "eliminates"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const links = await adapter.getTaskStakeLinks(id);
    return NextResponse.json(links);
  } catch (error) {
    console.error("Error fetching task stake links:", error);
    return NextResponse.json(
      { error: "Failed to fetch task stake links" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const stakeId = body?.stake_id ?? body?.stakeId;
    const resolutionType =
      body?.resolution_type ?? body?.resolutionType ?? "defuses_once";

    if (typeof stakeId !== "string" || !stakeId) {
      return NextResponse.json(
        { error: "stake_id is required" },
        { status: 400 },
      );
    }
    if (!RESOLUTION_TYPES.includes(resolutionType)) {
      return NextResponse.json(
        { error: "resolution_type must be one of: defuses_once, eliminates" },
        { status: 400 },
      );
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const link = await adapter.linkTaskStake({
      task_id: id,
      stake_id: stakeId,
      resolution_type: resolutionType,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Error linking task stake:", error);
    return NextResponse.json(
      { error: "Failed to link task stake" },
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
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const stakeId =
      body?.stake_id ??
      body?.stakeId ??
      request.nextUrl.searchParams.get("stake_id");

    if (typeof stakeId !== "string" || !stakeId) {
      return NextResponse.json(
        { error: "stake_id is required" },
        { status: 400 },
      );
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const link = await adapter.unlinkTaskStake(id, stakeId);
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unlinking task stake:", error);
    return NextResponse.json(
      { error: "Failed to unlink task stake" },
      { status: 500 },
    );
  }
}
