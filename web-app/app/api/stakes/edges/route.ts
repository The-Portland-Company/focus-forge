import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";

export const dynamic = "force-dynamic";

// Postgres check_violation — raised by the stake_edges BEFORE INSERT cycle trigger.
const CHECK_VIOLATION = "23514";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const parentStakeId = body?.parent_stake_id ?? body?.parentStakeId;
    const childStakeId = body?.child_stake_id ?? body?.childStakeId;

    if (typeof parentStakeId !== "string" || !parentStakeId) {
      return NextResponse.json(
        { error: "parent_stake_id is required" },
        { status: 400 },
      );
    }
    if (typeof childStakeId !== "string" || !childStakeId) {
      return NextResponse.json(
        { error: "child_stake_id is required" },
        { status: 400 },
      );
    }
    if (parentStakeId === childStakeId) {
      return NextResponse.json(
        { error: "An edge cannot link a stake to itself" },
        { status: 400 },
      );
    }

    let weightMultiplier: number | undefined;
    const rawWeight = body?.weight_multiplier ?? body?.weightMultiplier;
    if (rawWeight !== undefined && rawWeight !== null) {
      const num = Number(rawWeight);
      if (!Number.isFinite(num)) {
        return NextResponse.json(
          { error: "weight_multiplier must be a number" },
          { status: 400 },
        );
      }
      weightMultiplier = num;
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    try {
      const edge = await adapter.createStakeEdge({
        parent_stake_id: parentStakeId,
        child_stake_id: childStakeId,
        ...(weightMultiplier !== undefined
          ? { weight_multiplier: weightMultiplier }
          : {}),
      });
      return NextResponse.json(edge, { status: 201 });
    } catch (dbError: any) {
      if (dbError?.code === CHECK_VIOLATION) {
        return NextResponse.json(
          {
            error:
              "This edge would create a cycle in the stake chain and was rejected",
          },
          { status: 409 },
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error("Error creating stake edge:", error);
    return NextResponse.json(
      { error: "Failed to create stake edge" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parentStakeId =
      body?.parent_stake_id ??
      body?.parentStakeId ??
      request.nextUrl.searchParams.get("parent_stake_id");
    const childStakeId =
      body?.child_stake_id ??
      body?.childStakeId ??
      request.nextUrl.searchParams.get("child_stake_id");

    if (typeof parentStakeId !== "string" || !parentStakeId) {
      return NextResponse.json(
        { error: "parent_stake_id is required" },
        { status: 400 },
      );
    }
    if (typeof childStakeId !== "string" || !childStakeId) {
      return NextResponse.json(
        { error: "child_stake_id is required" },
        { status: 400 },
      );
    }

    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);
    const edge = await adapter.deleteStakeEdge(parentStakeId, childStakeId);
    if (!edge) {
      return NextResponse.json({ error: "Edge not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stake edge:", error);
    return NextResponse.json(
      { error: "Failed to delete stake edge" },
      { status: 500 },
    );
  }
}
