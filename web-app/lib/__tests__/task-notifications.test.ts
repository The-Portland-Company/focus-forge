/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAddedMembershipUserIds,
  extractMentionedProfileIds,
  getTaskCommentRecipients,
} from "../task-notifications";

test("extractMentionedProfileIds resolves unique email and handle mentions", () => {
  const profiles = [
    {
      id: "spencer",
      email: "spencerhill@theportlandcompany.com",
      first_name: "Spencer",
      last_name: "Hill",
      display_name: "Spencer Hill",
    },
    {
      id: "sam",
      email: "sam@theportlandcompany.com",
      first_name: "Sam",
      last_name: "Taylor",
      display_name: "Sam Taylor",
    },
    {
      id: "alex-1",
      email: "alex.one@example.com",
      first_name: "Alex",
      last_name: "One",
      display_name: "Alex One",
    },
    {
      id: "alex-2",
      email: "alex.two@example.com",
      first_name: "Alex",
      last_name: "Two",
      display_name: "Alex Two",
    },
  ];

  const mentionedIds = extractMentionedProfileIds(
    "<p>Loop in @spencerhill and @sam@theportlandcompany.com. @alex is ambiguous.</p>",
    profiles,
  );

  assert.deepEqual(mentionedIds.sort(), ["sam", "spencer"]);
});

test("getTaskCommentRecipients de-duplicates the assignee and prior commenters", () => {
  const recipients = getTaskCommentRecipients({
    authorId: "actor",
    assigneeId: "spencer",
    priorCommenterIds: ["spencer", "casey", "actor", "casey"],
  });

  assert.deepEqual(recipients, [
    { userId: "spencer", reason: "assignee_and_commenter" },
    { userId: "casey", reason: "commenter" },
  ]);
});

test("computeAddedMembershipUserIds returns only newly added users", () => {
  const addedUserIds = computeAddedMembershipUserIds({
    existingUserIds: ["owner", "casey"],
    existingOwnerIds: ["owner"],
    memberIds: ["owner", "casey", "spencer"],
    actorUserId: "owner",
  });

  assert.deepEqual(addedUserIds, ["spencer"]);
});
