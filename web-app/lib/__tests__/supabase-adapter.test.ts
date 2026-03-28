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
