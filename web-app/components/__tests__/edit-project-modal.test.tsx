/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { canManageProjectMembers } from "../edit-project-modal";

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
