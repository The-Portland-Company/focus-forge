// Covers the project-access gap in the mobile task write routes
// (POST /api/mobile/tasks, PATCH /api/mobile/tasks/[id]): tasks are written
// with a service-role client (see lib/db/pg-direct.ts / supabase-adapter.ts),
// which bypasses Postgres RLS, so the app-layer check in
// lib/mobile/api.ts (hasProjectAccess / resolveMobileTaskProjectId) is the
// only thing standing between an authenticated caller and writing tasks into
// a project belonging to an organization they are not a member of.
//
// Confirmed real-world case this guards against: Forge user a31d128b (member
// only of org "The Portland Company") creating tasks in project 3e27e2b6,
// which belongs to a different org ("Politogy") the user is not a member of.
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasProjectAccess,
  resolveMobileTaskProjectId,
  resolveMobileTaskProjectIds,
} from "@/lib/mobile/api";

// A minimal fake of the Supabase query-builder surface resolveMobileTaskProjectId
// uses: `.from(table).select(cols).eq(col, val).is(col, val).maybeSingle()`.
// Table contents are keyed by id.
const fakeServiceSupabase = (tables: Record<string, Record<string, any>>) => {
  return {
    from(table: string) {
      let filterId: string | undefined;
      const builder: any = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          if (column === "id") filterId = value;
          return builder;
        },
        is() {
          return builder;
        },
        async maybeSingle() {
          const row = filterId ? tables[table]?.[filterId] : undefined;
          return { data: row ?? null, error: null };
        },
      };
      return builder;
    },
  };
};

test("hasProjectAccess: allowed when the project is in the caller's visible project list", () => {
  const projects = [{ id: "project-tpc" }, { id: "project-other" }];
  assert.equal(hasProjectAccess(projects, "project-tpc"), true);
});

test("hasProjectAccess: forbidden when the project is not in the caller's visible project list", () => {
  // Mirrors the confirmed bug: user a31d128b (org "The Portland Company")
  // has no visibility into project 3e27e2b6 (org "Politogy").
  const projects = [{ id: "project-portland-co" }];
  assert.equal(hasProjectAccess(projects, "project-3e27e2b6"), false);
});

test("hasProjectAccess: forbidden against an empty project list", () => {
  assert.equal(hasProjectAccess([], "project-3e27e2b6"), false);
});

test("resolveMobileTaskProjectId: passes through an explicit project_id", async () => {
  const supabase = fakeServiceSupabase({});
  const projectId = await resolveMobileTaskProjectId(supabase as any, {
    project_id: "project-a",
  });
  assert.equal(projectId, "project-a");
});

test("resolveMobileTaskProjectId: returns null for a project-less (inbox) task", async () => {
  const supabase = fakeServiceSupabase({});
  const projectId = await resolveMobileTaskProjectId(supabase as any, {});
  assert.equal(projectId, null);
});

test("resolveMobileTaskProjectId: resolves via goal_id when project_id is omitted", async () => {
  const supabase = fakeServiceSupabase({
    goals: { "goal-1": { id: "goal-1", project_id: "project-from-goal" } },
  });
  const projectId = await resolveMobileTaskProjectId(supabase as any, {
    goal_id: "goal-1",
  });
  assert.equal(projectId, "project-from-goal");
});

test("resolveMobileTaskProjectId: resolves via section_id when project_id and goal_id are omitted", async () => {
  const supabase = fakeServiceSupabase({
    sections: { "section-1": { project_id: "project-from-section" } },
  });
  const projectId = await resolveMobileTaskProjectId(supabase as any, {
    section_id: "section-1",
  });
  assert.equal(projectId, "project-from-section");
});

test("resolveMobileTaskProjectId: resolves via parent_id (subtask) as a last resort", async () => {
  const supabase = fakeServiceSupabase({
    tasks: { "parent-1": { project_id: "project-from-parent" } },
  });
  const projectId = await resolveMobileTaskProjectId(supabase as any, {
    parent_id: "parent-1",
  });
  assert.equal(projectId, "project-from-parent");
});

test("resolveMobileTaskProjectId: a caller-supplied project_id is never overridden by section_id/goal_id/parent_id", async () => {
  // This is the specific bypass the fix must close: a caller can't point
  // project_id at a project they're not asking about while section_id/
  // goal_id/parent_id (which they DO have access to) get used instead -
  // project_id, when present, always wins and gets checked.
  const supabase = fakeServiceSupabase({
    goals: { "goal-1": { id: "goal-1", project_id: "project-from-goal" } },
  });
  const projectId = await resolveMobileTaskProjectId(supabase as any, {
    project_id: "project-explicit",
    goal_id: "goal-1",
  });
  assert.equal(projectId, "project-explicit");
});

// resolveMobileTaskProjectIds closes the gap resolveMobileTaskProjectId's
// single-winner priority order leaves open: a caller sends an accessible
// project_id plus a goal_id/section_id/parent_id belonging to a *different*
// project the caller can't access. The single-value resolver only ever
// checked project_id in that case, so the route never noticed the mismatched
// reference. resolveMobileTaskProjectIds returns every referenced project so
// callers can require access to all of them.

test("resolveMobileTaskProjectIds: returns only project_id when no other reference is present", async () => {
  const supabase = fakeServiceSupabase({});
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {
    project_id: "project-a",
  });
  assert.deepEqual(projectIds, ["project-a"]);
});

test("resolveMobileTaskProjectIds: returns an empty array for a project-less (inbox) task", async () => {
  const supabase = fakeServiceSupabase({});
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {});
  assert.deepEqual(projectIds, []);
});

test("resolveMobileTaskProjectIds: includes both project_id and the goal's project when they differ", async () => {
  // The mixed case this fix targets: an accessible project_id paired with a
  // goal_id that lives in a different, inaccessible project. Both must be
  // returned so the caller can be denied access to the goal's project.
  const supabase = fakeServiceSupabase({
    goals: { "goal-1": { id: "goal-1", project_id: "project-from-goal" } },
  });
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {
    project_id: "project-explicit",
    goal_id: "goal-1",
  });
  assert.deepEqual(
    [...projectIds].sort(),
    ["project-explicit", "project-from-goal"].sort(),
  );
});

test("resolveMobileTaskProjectIds: includes project_id, goal's project, section's project and parent's project all at once", async () => {
  const supabase = fakeServiceSupabase({
    goals: { "goal-1": { id: "goal-1", project_id: "project-from-goal" } },
    sections: { "section-1": { project_id: "project-from-section" } },
    tasks: { "parent-1": { project_id: "project-from-parent" } },
  });
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {
    project_id: "project-explicit",
    goal_id: "goal-1",
    section_id: "section-1",
    parent_id: "parent-1",
  });
  assert.deepEqual(
    [...projectIds].sort(),
    [
      "project-explicit",
      "project-from-goal",
      "project-from-section",
      "project-from-parent",
    ].sort(),
  );
});

test("resolveMobileTaskProjectIds: deduplicates when references resolve to the same project", async () => {
  const supabase = fakeServiceSupabase({
    goals: { "goal-1": { id: "goal-1", project_id: "project-a" } },
  });
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {
    project_id: "project-a",
    goal_id: "goal-1",
  });
  assert.deepEqual(projectIds, ["project-a"]);
});

test("resolveMobileTaskProjectIds: ignores a goal_id that doesn't resolve to a live goal", async () => {
  const supabase = fakeServiceSupabase({});
  const projectIds = await resolveMobileTaskProjectIds(supabase as any, {
    project_id: "project-explicit",
    goal_id: "goal-missing",
  });
  assert.deepEqual(projectIds, ["project-explicit"]);
});
