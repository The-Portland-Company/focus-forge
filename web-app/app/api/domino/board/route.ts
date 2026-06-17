import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { buildGraph, effectiveWeight } from "@/lib/domino/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const adapter = new SupabaseAdapter(auth.supabase, auth.user.id);

    let organizationId: string | null =
      request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      const orgs = await adapter.getOrganizations();
      organizationId = orgs?.[0]?.id || null;
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 },
      );
    }

    const graph = await adapter.getDominoGraphData(organizationId);
    const stakeGraph = buildGraph(graph.stakes, graph.edges);

    // Resolver tasks per stake, from the links.
    const resolversByStake = new Map<
      string,
      { taskId: string; resolutionType: string }[]
    >();
    for (const link of graph.links as any[]) {
      const list = resolversByStake.get(link.stake_id) ?? [];
      list.push({
        taskId: link.task_id,
        resolutionType: link.resolution_type,
      });
      resolversByStake.set(link.stake_id, list);
    }

    const activeStakes = (graph.stakes as any[]).filter(
      (s) => (s.status ?? "active") === "active",
    );

    const board = activeStakes.map((stake) => ({
      id: stake.id,
      name: stake.name,
      kind: stake.kind,
      description: stake.description ?? null,
      monetaryValue: stake.monetary_value ?? null,
      severity: stake.severity ?? null,
      triggerAt: stake.trigger_at ?? null,
      recurrence: stake.recurrence ?? null,
      recurrenceIntervalDays: stake.recurrence_interval_days ?? null,
      status: stake.status ?? "active",
      effectiveWeight: effectiveWeight(stake.id, stakeGraph),
      resolvers: resolversByStake.get(stake.id) ?? [],
    }));

    const edges = (graph.edges as any[]).map((e) => ({
      parentStakeId: e.parent_stake_id,
      childStakeId: e.child_stake_id,
      weightMultiplier: e.weight_multiplier ?? null,
    }));

    return NextResponse.json({ stakes: board, edges });
  } catch (error) {
    console.error("Error building domino board:", error);
    return NextResponse.json(
      { error: "Failed to build domino board" },
      { status: 500 },
    );
  }
}
