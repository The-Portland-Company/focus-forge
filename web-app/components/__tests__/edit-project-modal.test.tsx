/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { canManageProjectMembers } from "../edit-project-modal";
import { filterAvailableMembers } from "../existing-member-picker";

test("canManageProjectMembers allows admins", () => {
  assert.equal(
    canManageProjectMembers({
      currentUserId: "user-1",
      currentUserRole: "admin",
      organizationOwnerId: "owner-1",
      projectOwnerId: "owner-2",
      projectUserIds: [],
    }),
    true,
  );
});

test("canManageProjectMembers falls back to project membership", () => {
  assert.equal(
    canManageProjectMembers({
      currentUserId: "member-1",
      currentUserRole: null,
      organizationOwnerId: "owner-1",
      projectOwnerId: null,
      projectUserIds: ["member-1"],
    }),
    true,
  );
});

test("canManageProjectMembers rejects unrelated users", () => {
  assert.equal(
    canManageProjectMembers({
      currentUserId: "outsider-1",
      currentUserRole: "team_member",
      organizationOwnerId: "owner-1",
      projectOwnerId: "owner-2",
      projectUserIds: ["member-1"],
    }),
    false,
  );
});

test("filterAvailableMembers only returns eligible matches", () => {
  const users = [
    {
      id: "user-1",
      firstName: "Casey",
      lastName: "Nguyen",
      name: "Casey Nguyen",
      email: "casey@example.com",
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      status: "active" as const,
    },
    {
      id: "user-2",
      firstName: "Robin",
      lastName: "Stone",
      name: "Robin Stone",
      email: "robin@example.com",
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      status: "active" as const,
    },
  ];

  const filtered = filterAvailableMembers(users, ["user-1", "user-2"], ["user-2"], "casey");

  assert.deepEqual(filtered.map((user) => user.id), ["user-1"]);
});
