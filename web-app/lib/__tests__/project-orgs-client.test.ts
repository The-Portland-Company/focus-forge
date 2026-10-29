import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getProjectOrganizationIds,
  projectBelongsToOrganization,
  isSharedProject,
  dedupeProjectsById,
  buildOrganizationLinks,
} from "../project-orgs-client";

describe("project-orgs-client", () => {
  test("legacy project falls back to primary", () => {
    const p = { id: "p", organizationId: "a" };
    assert.deepEqual(getProjectOrganizationIds(p), ["a"]);
    assert.equal(isSharedProject(p), false);
    assert.equal(projectBelongsToOrganization(p, "a"), true);
    assert.equal(projectBelongsToOrganization(p, "b"), false);
  });

  test("shared project belongs to every org, primary first, deduped", () => {
    const p = { id: "p", organizationId: "a", organizationIds: ["b", "a", "b", "c"] };
    assert.deepEqual(getProjectOrganizationIds(p), ["a", "b", "c"]);
    assert.equal(isSharedProject(p), true);
    assert.equal(projectBelongsToOrganization(p, "c"), true);
    assert.equal(projectBelongsToOrganization(p, null), false);
  });

  test("dedupeProjectsById keeps first occurrence", () => {
    const out = dedupeProjectsById([{ id: "1", n: 1 }, { id: "2", n: 2 }, { id: "1", n: 3 }]);
    assert.deepEqual(out.map((x) => x.n), [1, 2]);
  });

  test("buildOrganizationLinks puts primary first and keeps roles", () => {
    const links = buildOrganizationLinks("a", ["b", "a"], [
      { organizationId: "b", role: "manager", isPrimary: false },
    ]);
    assert.deepEqual(links, [
      { organizationId: "a", role: "manager", isPrimary: true },
      { organizationId: "b", role: "manager", isPrimary: false },
    ]);
  });
});
