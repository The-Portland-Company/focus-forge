/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isMemberOfAnyProjectOrg,
  isMissingProjectOrganizations,
  isProjectAdmin,
  projectOrgIdsFromRow,
  projectOrgLinksFromRow,
  setProjectSharedOrganizations,
  userCanAccessProject,
} from "../db/project-orgs";
import { parseOrganizationIdsInput } from "../api/project-organization-ids";

// --- tiny fake client (eq / in filters, maybeSingle, insert/delete recording) ---
function fake(tables: Record<string, any[]>, calls: any[] = []) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let mode: "select" | "insert" | "delete" = "select";
    let payload: any;
    const q: any = {
      select() { return q; },
      insert(p: any) { mode = "insert"; payload = p; return q; },
      delete() { mode = "delete"; return q; },
      eq(c: string, v: any) { rows = rows.filter((r) => r[c] === v); return q; },
      in(c: string, vs: any[]) { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(res: any, rej: any) {
        if (mode === "insert") calls.push({ table, op: "insert", payload });
        if (mode === "delete") calls.push({ table, op: "delete", ids: rows.map((r) => r.organization_id) });
        return Promise.resolve({ data: mode === "select" ? rows : null, error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { from };
}

test("projectOrgIdsFromRow: primary first, deduped, legacy rows resolve to one org", () => {
  assert.deepEqual(projectOrgIdsFromRow({ organization_id: "a" }), ["a"]);
  assert.deepEqual(
    projectOrgIdsFromRow({
      organization_id: "a",
      project_organizations: [
        { organization_id: "b", is_primary: false },
        { organization_id: "a", is_primary: true },
      ],
    }),
    ["a", "b"],
  );
  assert.deepEqual(projectOrgIdsFromRow({ organization_id: null }), []);
});

test("projectOrgLinksFromRow carries role and primary flag", () => {
  const links = projectOrgLinksFromRow({
    organization_id: "a",
    project_organizations: [
      { organization_id: "a", role: "manager", is_primary: true },
      { organization_id: "b", role: "member", is_primary: false },
    ],
  });
  assert.deepEqual(links, [
    { organizationId: "a", role: "manager", isPrimary: true },
    { organizationId: "b", role: "member", isPrimary: false },
  ]);
});

test("isMemberOfAnyProjectOrg / isMissingProjectOrganizations", () => {
  assert.equal(isMemberOfAnyProjectOrg(["x", "b"], ["a", "b"]), true);
  assert.equal(isMemberOfAnyProjectOrg(["x"], ["a", "b"]), false);
  assert.equal(isMissingProjectOrganizations({ code: "PGRST200" }), true);
  assert.equal(isMissingProjectOrganizations({ code: "42P01" }), true);
  assert.equal(isMissingProjectOrganizations({ message: "relation \"project_organizations\" does not exist" }), true);
  assert.equal(isMissingProjectOrganizations({ code: "23505", message: "duplicate key" }), false);
  assert.equal(isMissingProjectOrganizations(null), false);
});

const project = {
  id: "p",
  organization_id: "org-a",
  project_organizations: [
    { organization_id: "org-a", role: "manager", is_primary: true },
    { organization_id: "org-b", role: "manager", is_primary: false },
    { organization_id: "org-c", role: "member", is_primary: false },
  ],
};

test("isProjectAdmin: primary owner, client-org owner (manager), member-role owner, plain member, global admin", async () => {
  const mk = (uo: any[], profiles: any[] = []) =>
    fake({ projects: [project], user_organizations: uo, profiles });
  const run = (client: any, uid: string) => isProjectAdmin(client, uid, "p");

  const primaryOwner = await run(mk([{ user_id: "u", organization_id: "org-a", is_owner: true }]), "u");
  assert.deepEqual([primaryOwner.authorized, primaryOwner.isPrimaryAdmin], [true, true]);

  const clientOwner = await run(mk([{ user_id: "u", organization_id: "org-b", is_owner: true }]), "u");
  assert.deepEqual([clientOwner.authorized, clientOwner.isPrimaryAdmin], [true, false]);

  const memberRoleOwner = await run(mk([{ user_id: "u", organization_id: "org-c", is_owner: true }]), "u");
  assert.equal(memberRoleOwner.authorized, false, "link role=member gives no project-admin rights");

  const plainMember = await run(mk([{ user_id: "u", organization_id: "org-b", is_owner: false }]), "u");
  assert.equal(plainMember.authorized, false);

  const stranger = await run(mk([{ user_id: "u", organization_id: "org-z", is_owner: true }]), "u");
  assert.equal(stranger.authorized, false);

  const admin = await run(mk([], [{ id: "u", role: "admin" }]), "u");
  assert.deepEqual([admin.authorized, admin.isPrimaryAdmin], [true, true]);
});

test("userCanAccessProject: any linked org, explicit membership, super admin; otherwise no", async () => {
  const base = { projects: [project], user_projects: [] as any[], profiles: [] as any[] };
  assert.equal(await userCanAccessProject(fake({ ...base, user_organizations: [{ user_id: "u", organization_id: "org-b" }] }), "u", "p"), true);
  assert.equal(await userCanAccessProject(fake({ ...base, user_organizations: [{ user_id: "u", organization_id: "org-z" }] }), "u", "p"), false);
  assert.equal(await userCanAccessProject(fake({ ...base, user_organizations: [], user_projects: [{ user_id: "u", project_id: "p" }] }), "u", "p"), true);
  assert.equal(await userCanAccessProject(fake({ ...base, user_organizations: [], profiles: [{ id: "u", role: "super_admin" }] }), "u", "p"), true);
  assert.equal(await userCanAccessProject(fake({ ...base, projects: [], user_organizations: [] }), "u", "nope"), false);
});

test("setProjectSharedOrganizations diffs additional orgs, never touches or duplicates the primary", async () => {
  const calls: any[] = [];
  const client = fake(
    {
      projects: [{ id: "p", organization_id: "org-a" }],
      project_organizations: [
        { project_id: "p", organization_id: "org-a", is_primary: true },
        { project_id: "p", organization_id: "org-b", is_primary: false },
      ],
    },
    calls,
  );
  const result = await setProjectSharedOrganizations(client, {
    projectId: "p",
    organizationIds: ["org-a", "org-c"], // primary ignored, b removed, c added
    actorUserId: "actor",
  });
  assert.deepEqual(result, { added: ["org-c"], removed: ["org-b"] });
  const insert = calls.find((c) => c.op === "insert");
  assert.deepEqual(insert.payload, [
    { project_id: "p", organization_id: "org-c", role: "manager", is_primary: false, added_by: "actor" },
  ]);
  assert.deepEqual(calls.find((c) => c.op === "delete").ids, ["org-b"]);
});

test("parseOrganizationIdsInput: absent => undefined (leave sharing alone); bad type => 400", () => {
  assert.equal(parseOrganizationIdsInput({}), undefined);
  assert.equal(parseOrganizationIdsInput(null), undefined);
  assert.equal(parseOrganizationIdsInput({ organization_ids: null }), undefined, "null is treated as absent: never as unshare-all");
  assert.deepEqual(parseOrganizationIdsInput({ organization_ids: ["a", " b ", "a", ""] }), ["a", "b"]);
  assert.deepEqual(parseOrganizationIdsInput({ organizationIds: [] }), []);
  for (const bad of ["a", [1], { a: 1 }]) {
    assert.throws(() => parseOrganizationIdsInput({ organization_ids: bad }), (e: any) => e.status === 400);
  }
});
