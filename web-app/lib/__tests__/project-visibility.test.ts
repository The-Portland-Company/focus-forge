/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countProjectsInOrg,
  getSharedProjectIdsForOrgs,
  listProjectsForOrgs,
  projectBelongsToOrg,
} from "../db/project-visibility";
import { getAuthorizedProject } from "../ai-planner/persistence";

type Row = Record<string, any>;

/** Minimal PostgREST-ish fake: eq/in/limit/maybeSingle, select with embeds ignored. */
function fakeClient(tables: Record<string, Row[] | { error: any }>, log: string[] = []) {
  return {
    from(table: string) {
      const spec = tables[table];
      const filters: Array<(r: Row) => boolean> = [];
      let head = false;
      let limit: number | null = null;
      const run = () => {
        if (spec && !Array.isArray(spec)) return { data: null, error: spec.error, count: null };
        let rows = ((spec as Row[]) ?? []).filter((r) => filters.every((f) => f(r)));
        if (limit != null) rows = rows.slice(0, limit);
        return { data: head ? null : rows, error: null, count: rows.length };
      };
      const q: any = {
        select(cols: string, opts?: any) {
          log.push(`${table}.select(${cols})`);
          head = Boolean(opts?.head);
          return q;
        },
        eq(col: string, val: any) { filters.push((r) => r[col] === val); return q; },
        in(col: string, vals: any[]) {
          log.push(`${table}.in(${col},${vals.length})`);
          filters.push((r) => vals.includes(r[col]));
          return q;
        },
        limit(n: number) { limit = n; return q; },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
        then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
  };
}

const projects = [
  { id: "p1", name: "Alpha", organization_id: "A" },
  { id: "p2", name: "Beta", organization_id: "B" },
  { id: "p3", name: "Gamma", organization_id: "C" },
];
const links = [
  { project_id: "p1", organization_id: "A", role: "manager", is_primary: true },
  { project_id: "p2", organization_id: "B", role: "manager", is_primary: true },
  { project_id: "p3", organization_id: "C", role: "manager", is_primary: true },
  { project_id: "p3", organization_id: "A", role: "member", is_primary: false },
];
const withEmbeds = projects.map((p) => ({
  ...p,
  project_organizations: links.filter((l) => l.project_id === p.id),
}));

test("getSharedProjectIdsForOrgs returns only non-primary links into the orgs", async () => {
  const c = fakeClient({ project_organizations: links });
  assert.deepEqual(await getSharedProjectIdsForOrgs(c, ["A"]), ["p3"]);
  assert.deepEqual(await getSharedProjectIdsForOrgs(c, ["B"]), []);
});

test("listProjectsForOrgs unions primary-owned and shared-in projects, with all owner orgs", async () => {
  const c = fakeClient({ projects: withEmbeds, project_organizations: links });
  const rows = await listProjectsForOrgs(c, "id,name,organization_id", ["A"]);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["p1", "p3"]);
  const p3 = rows.find((r) => r.id === "p3")!;
  assert.equal(p3.organization_id, "C"); // still primary C
  assert.deepEqual(p3.organization_ids, ["C", "A"]);
});

test("listProjectsForOrgs degrades to legacy single-org when project_organizations is missing", async () => {
  const missing = { error: { code: "42P01", message: 'relation "project_organizations" does not exist' } };
  const c = fakeClient({ projects: projects, project_organizations: missing });
  const rows = await listProjectsForOrgs(c, "id,name,organization_id", ["A"]);
  assert.deepEqual(rows.map((r) => r.id), ["p1"]);
});

test("listProjectsForOrgs never sends more than 100 ids in one in()", async () => {
  const log: string[] = [];
  const many = Array.from({ length: 250 }, (_, i) => `org-${i}`);
  const c = fakeClient({ projects: [], project_organizations: [] }, log);
  await listProjectsForOrgs(c, "id,organization_id", many);
  const sizes = log.filter((l) => l.includes(".in(")).map((l) => Number(l.match(/,(\d+)\)/)![1]));
  assert.ok(sizes.length >= 3);
  assert.ok(sizes.every((n) => n <= 100));
});

test("listProjectsForOrgs with no orgs returns nothing", async () => {
  const c = fakeClient({ projects: withEmbeds, project_organizations: links });
  assert.deepEqual(await listProjectsForOrgs(c, "id", []), []);
});

test("countProjectsInOrg counts primary plus shared-in", async () => {
  const c = fakeClient({ projects, project_organizations: links });
  assert.equal(await countProjectsInOrg(c, "A"), 2);
  assert.equal(await countProjectsInOrg(c, "B"), 1);
});

test("projectBelongsToOrg matches any owning org", () => {
  assert.equal(projectBelongsToOrg(["C", "A"], "A"), true);
  assert.equal(projectBelongsToOrg(["C", "A"], "B"), false);
});

test("getAuthorizedProject grants a member of a SHARED org, denies outsiders", async () => {
  const tables = {
    projects: withEmbeds,
    user_organizations: [
      { user_id: "u-shared", organization_id: "A" },
      { user_id: "u-primary", organization_id: "C" },
      { user_id: "u-other", organization_id: "B" },
    ],
  };
  const c: any = fakeClient(tables);
  assert.equal((await getAuthorizedProject(c, "u-shared", "p3"))?.id, "p3");
  assert.equal((await getAuthorizedProject(c, "u-primary", "p3"))?.organizationId, "C");
  assert.equal(await getAuthorizedProject(c, "u-other", "p3"), null);
  // A's member must NOT get Beta (B-only)
  assert.equal(await getAuthorizedProject(c, "u-shared", "p2"), null);
});
