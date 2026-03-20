/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import type { Organization, User } from "../../lib/types";
import {
  buildPendingOrganizationUser,
  getOrganizationUserIds,
  mergeUsersById,
} from "../organization-settings-modal";

test("getOrganizationUserIds includes owner and members without duplicates", () => {
  const organization: Organization = {
    id: "org-1",
    name: "Focus Forge",
    color: "#111111",
    ownerId: "owner-1",
    memberIds: ["member-1", "owner-1"],
  };

  assert.deepEqual(getOrganizationUserIds(organization), ["member-1", "owner-1"]);
});

test("buildPendingOrganizationUser creates a pending member preview", () => {
  const user = buildPendingOrganizationUser({
    userId: "user-1",
    email: "invitee@example.com",
    firstName: "Casey",
    lastName: "Nguyen",
  });

  assert.equal(user.id, "user-1");
  assert.equal(user.name, "Casey Nguyen");
  assert.equal(user.status, "pending");
  assert.equal(user.email, "invitee@example.com");
});

test("mergeUsersById keeps fetched users and appends pending invite previews", () => {
  const fetchedUsers: User[] = [
    {
      id: "owner-1",
      firstName: "Owner",
      lastName: "User",
      name: "Owner User",
      email: "owner@example.com",
      createdAt: "2026-03-19T10:00:00.000Z",
      updatedAt: "2026-03-19T10:00:00.000Z",
      status: "active",
    },
  ];

  const pendingInvite = buildPendingOrganizationUser({
    userId: "pending-1",
    email: "invitee@example.com",
    firstName: "Pending",
    lastName: "Invite",
  });

  const merged = mergeUsersById(fetchedUsers, [pendingInvite]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "owner-1");
  assert.equal(merged[1].id, "pending-1");
  assert.equal(merged[1].status, "pending");
});
