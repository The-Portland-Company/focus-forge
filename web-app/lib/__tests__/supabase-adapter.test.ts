/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveVisibleProjectIds } from "../db/supabase-adapter";

test("resolveVisibleProjectIds keeps org-wide visibility when there are no explicit project memberships", () => {
  const result = resolveVisibleProjectIds({
    orgMemberships: [{ organization_id: "org-1", is_owner: false }],
    explicitProjects: [],
  });

  assert.equal(result.fullyVisibleOrganizationIds.has("org-1"), true);
  assert.deepEqual(Array.from(result.explicitProjectIds), []);
});

test("resolveVisibleProjectIds restricts non-owner org members to explicit project memberships", () => {
  const result = resolveVisibleProjectIds({
    orgMemberships: [{ organization_id: "org-1", is_owner: false }],
    explicitProjects: [{ id: "project-1", organization_id: "org-1" }],
  });

  assert.equal(result.fullyVisibleOrganizationIds.has("org-1"), false);
  assert.equal(result.explicitProjectIds.has("project-1"), true);
});

test("resolveVisibleProjectIds preserves org-wide visibility for org owners", () => {
  const result = resolveVisibleProjectIds({
    orgMemberships: [{ organization_id: "org-1", is_owner: true }],
    explicitProjects: [{ id: "project-1", organization_id: "org-1" }],
  });

  assert.equal(result.fullyVisibleOrganizationIds.has("org-1"), true);
  assert.equal(result.explicitProjectIds.has("project-1"), true);
});

// ---------------------------------------------------------------------------
// Multi-organization project ownership
// ---------------------------------------------------------------------------

import { isProjectVisible, SupabaseAdapter } from "../db/supabase-adapter";

test("resolveVisibleProjectIds counts a shared explicit project in EVERY owning org", () => {
  const result = resolveVisibleProjectIds({
    orgMemberships: [
      { organization_id: "org-a", is_owner: false },
      { organization_id: "org-b", is_owner: false },
    ],
    explicitProjects: [
      { id: "shared", organization_id: "org-a", organization_ids: ["org-a", "org-b"] },
    ],
  });
  // non-owner members of BOTH orgs are restricted to their explicit projects
  assert.equal(result.fullyVisibleOrganizationIds.has("org-a"), false);
  assert.equal(result.fullyVisibleOrganizationIds.has("org-b"), false);
  assert.equal(result.explicitProjectIds.has("shared"), true);
});

test("resolveVisibleProjectIds: legacy rows without organization_ids behave as before", () => {
  const result = resolveVisibleProjectIds({
    orgMemberships: [
      { organization_id: "org-a", is_owner: false },
      { organization_id: "org-b", is_owner: false },
    ],
    explicitProjects: [{ id: "p", organization_id: "org-a" }],
  });
  assert.equal(result.fullyVisibleOrganizationIds.has("org-a"), false);
  assert.equal(result.fullyVisibleOrganizationIds.has("org-b"), true);
});

test("isProjectVisible: visible through ANY fully-visible owning org", () => {
  const scope = {
    fullyVisibleOrganizationIds: new Set(["org-b"]),
    explicitProjectIds: new Set<string>(),
  };
  assert.equal(
    isProjectVisible({ id: "p", organization_id: "org-a", organization_ids: ["org-a", "org-b"] }, scope),
    true,
  );
  assert.equal(isProjectVisible({ id: "p", organization_id: "org-a" }, scope), false);
  assert.equal(
    isProjectVisible({ id: "p", organization_id: "org-a", organization_ids: ["org-a"] }, {
      ...scope,
      explicitProjectIds: new Set(["p"]),
    }),
    true,
  );
});

// Minimal in-memory PostgREST-ish fake (eq / in / is filters, thenable).
function fakeSupabase(tables: Record<string, any[]>, opts: { failEmbed?: boolean } = {}) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let selectStr = "";
    const q: any = {
      select(s: string) {
        selectStr = s;
        return q;
      },
      eq(col: string, v: any) {
        rows = rows.filter((r) => r[col] === v);
        return q;
      },
      in(col: string, vs: any[]) {
        rows = rows.filter((r) => vs.includes(r[col]));
        return q;
      },
      is(col: string, v: any) {
        rows = rows.filter((r) => (r[col] ?? null) === v);
        return q;
      },
      order() {
        return q;
      },
      then(resolve: any, reject: any) {
        if (opts.failEmbed && table === "projects" && /project_organizations/.test(selectStr)) {
          return Promise.resolve({
            data: null,
            error: { code: "PGRST200", message: "Could not find a relationship between 'projects' and 'project_organizations' in the schema cache" },
          }).then(resolve, reject);
        }
        const out = rows.map((r) => {
          if (table === "projects" && !/project_organizations/.test(selectStr)) {
            const { project_organizations: _drop, ...rest } = r;
            return rest;
          }
          return r;
        });
        return Promise.resolve({ data: out, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return { from };
}

function multiOrgTables() {
  const link = (project_id: string, organization_id: string, is_primary: boolean, role = "manager") => ({
    project_id, organization_id, is_primary, role,
  });
  const projects = [
    { id: "p-a-only", name: "A only", organization_id: "org-a", order_index: 1, deleted_at: null,
      project_organizations: [link("p-a-only", "org-a", true)].map(({ project_id: _p, ...l }) => ({ ...l, organization_id: l.organization_id })) },
    { id: "p-shared", name: "Shared", organization_id: "org-a", order_index: 2, deleted_at: null,
      project_organizations: [
        { organization_id: "org-a", is_primary: true, role: "manager" },
        { organization_id: "org-b", is_primary: false, role: "manager" },
      ] },
    { id: "p-b-only", name: "B only", organization_id: "org-b", order_index: 3, deleted_at: null,
      project_organizations: [{ organization_id: "org-b", is_primary: true, role: "manager" }] },
    { id: "p-c", name: "C only", organization_id: "org-c", order_index: 4, deleted_at: null,
      project_organizations: [{ organization_id: "org-c", is_primary: true, role: "manager" }] },
  ];
  return {
    projects,
    project_organizations: [
      link("p-a-only", "org-a", true),
      link("p-shared", "org-a", true),
      link("p-shared", "org-b", false),
      link("p-b-only", "org-b", true),
      link("p-c", "org-c", true),
    ],
    user_organizations: [] as any[],
    user_projects: [] as any[],
  };
}

test("getProjects: a member of ONLY the client org sees the shared project (and its org list) but not the primary org's other projects", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [{ user_id: "client-user", organization_id: "org-b", is_owner: false }];
  const adapter = new SupabaseAdapter(fakeSupabase(tables), "client-user");
  const projects = await adapter.getProjects();
  assert.deepEqual(projects.map((p: any) => p.id).sort(), ["p-b-only", "p-shared"]);
  const shared = projects.find((p: any) => p.id === "p-shared");
  assert.equal(shared.organizationId, "org-a");
  assert.deepEqual(shared.organizationIds, ["org-a", "org-b"]);
  assert.equal(shared.project_organizations, undefined, "raw embed must not leak into the payload");
});

test("getProjects: a member of the primary org sees the shared project once", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [{ user_id: "tpc-user", organization_id: "org-a", is_owner: true }];
  const adapter = new SupabaseAdapter(fakeSupabase(tables), "tpc-user");
  const projects = await adapter.getProjects();
  assert.deepEqual(projects.map((p: any) => p.id).sort(), ["p-a-only", "p-shared"]);
});

test("getProjects: a member of both orgs sees the shared project exactly once", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [
    { user_id: "u", organization_id: "org-a", is_owner: false },
    { user_id: "u", organization_id: "org-b", is_owner: false },
  ];
  const projects = await new SupabaseAdapter(fakeSupabase(tables), "u").getProjects();
  assert.deepEqual(projects.map((p: any) => p.id), ["p-a-only", "p-shared", "p-b-only"]);
});

test("getProjects: user in no org sees nothing; unrelated org never leaks the shared project", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [{ user_id: "c-user", organization_id: "org-c", is_owner: true }];
  const projects = await new SupabaseAdapter(fakeSupabase(tables), "c-user").getProjects();
  assert.deepEqual(projects.map((p: any) => p.id), ["p-c"]);
  const none = await new SupabaseAdapter(fakeSupabase(tables), "nobody").getProjects();
  assert.deepEqual(none, []);
});

test("getProjects(orgId): org view lists primary-owned AND shared-in projects", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [{ user_id: "client-user", organization_id: "org-b", is_owner: false }];
  const adapter = new SupabaseAdapter(fakeSupabase(tables), "client-user");
  const inB = await adapter.getProjects("org-b");
  assert.deepEqual(inB.map((p: any) => p.id).sort(), ["p-b-only", "p-shared"]);
  const inA = await adapter.getProjects("org-a");
  assert.deepEqual(inA, [], "org-a is not visible to a member of org-b only");
});

test("getProjects: non-owner client member with explicit access keeps the explicit-only restriction in the shared org", async () => {
  const tables = multiOrgTables();
  tables.user_organizations = [{ user_id: "limited", organization_id: "org-b", is_owner: false }];
  tables.user_projects = [{ user_id: "limited", project_id: "p-shared", is_owner: false }];
  const projects = await new SupabaseAdapter(fakeSupabase(tables), "limited").getProjects();
  // org-b is no longer "fully visible" for this user (explicit membership exists) -> p-b-only hidden
  assert.deepEqual(projects.map((p: any) => p.id), ["p-shared"]);
});

test("getProjects: falls back to single-org behaviour when project_organizations is not deployed", async () => {
  const tables = multiOrgTables();
  tables.project_organizations = undefined as any;
  tables.user_organizations = [{ user_id: "tpc-user", organization_id: "org-a", is_owner: true }];
  const projects = await new SupabaseAdapter(fakeSupabase(tables, { failEmbed: true }), "tpc-user").getProjects();
  assert.deepEqual(projects.map((p: any) => p.id).sort(), ["p-a-only", "p-shared"]);
  assert.deepEqual(projects.find((p: any) => p.id === "p-shared").organizationIds, ["org-a"]);
});
