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

    // Resolve which organizations to include. With an explicit ?organizationId
    // we scope to that one; otherwise aggregate across ALL of the user's orgs so
    // a stake shows on the board no matter which org its task lives in (the
    // board previously only queried the user's first org, hiding stakes created
    // in any other org).
    const requestedOrgId = request.nextUrl.searchParams.get("organizationId");
    let organizationIds: string[];
    if (requestedOrgId) {
      organizationIds = [requestedOrgId];
    } else {
      const orgs = await adapter.getOrganizations();
      organizationIds = (orgs ?? []).map((o: { id: string }) => o.id);
    }
    if (organizationIds.length === 0) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 },
      );
    }

    // Merge the per-org graphs into one board-wide graph.
    const graph: { stakes: any[]; edges: any[]; links: any[] } = {
      stakes: [],
      edges: [],
      links: [],
    };
    for (const orgId of organizationIds) {
      const orgGraph = await adapter.getDominoGraphData(orgId);
      graph.stakes.push(...((orgGraph.stakes as any[]) ?? []));
      graph.edges.push(...((orgGraph.edges as any[]) ?? []));
      graph.links.push(...((orgGraph.links as any[]) ?? []));
    }

    const stakeGraph = buildGraph(graph.stakes, graph.edges);

    // Resolve task names for every resolver task so the board can show which
    // Task(s) keep each domino standing (click-to-view-task). The graph links
    // only carry task_id + resolution_type; join the tasks table here.
    const resolverTaskIds = Array.from(
      new Set(
        (graph.links as any[])
          .map((l) => l.task_id)
          .filter((id: any) => typeof id === "string" && id),
      ),
    ) as string[];

    const taskNameById = new Map<string, string>();
    if (resolverTaskIds.length > 0) {
      const { data: taskRows } = await auth.supabase
        .from("tasks")
        .select("id, name")
        .in("id", resolverTaskIds)
        .is("deleted_at", null);
      for (const row of (taskRows as any[]) ?? []) {
        taskNameById.set(String(row.id), row.name ?? "");
      }
    }

    // Resolver tasks per stake, from the links.
    const resolversByStake = new Map<
      string,
      { taskId: string; resolutionType: string; taskName: string | null }[]
    >();
    for (const link of graph.links as any[]) {
      const list = resolversByStake.get(link.stake_id) ?? [];
      list.push({
        taskId: link.task_id,
        resolutionType: link.resolution_type,
        taskName: taskNameById.get(String(link.task_id)) ?? null,
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
