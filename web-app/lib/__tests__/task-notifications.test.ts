/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAddedMembershipUserIds,
  extractMentionedProfileIds,
  getTaskCommentRecipients,
  getTaskCompletedRecipients,
  getTaskCreatedRecipientId,
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

test("getTaskCreatedRecipientId notifies the assignee but not the creating actor", () => {
  // Assigned to someone other than the actor -> notify that assignee.
  assert.equal(
    getTaskCreatedRecipientId({ assignedTo: "spencer", actorUserId: "casey" }),
    "spencer",
  );

  // Self-assignment (creator assigned it to themselves) -> no email.
  assert.equal(
    getTaskCreatedRecipientId({ assignedTo: "casey", actorUserId: "casey" }),
    null,
  );

  // No assignee -> no email.
  assert.equal(
    getTaskCreatedRecipientId({ assignedTo: null, actorUserId: "casey" }),
    null,
  );
});

test("getTaskCompletedRecipients notifies creator and assignee when a third party completes", () => {
  const recipients = getTaskCompletedRecipients({
    createdBy: "spencer",
    assignedTo: "casey",
    actorUserId: "alex",
  });

  assert.deepEqual(recipients, [
    { userId: "spencer", role: "creator" },
    { userId: "casey", role: "assignee" },
  ]);
});

test("getTaskCompletedRecipients excludes the actor who completed the task", () => {
  // Creator completes their own task that is assigned to someone else ->
  // only the assignee is notified.
  assert.deepEqual(
    getTaskCompletedRecipients({
      createdBy: "spencer",
      assignedTo: "casey",
      actorUserId: "spencer",
    }),
    [{ userId: "casey", role: "assignee" }],
  );

  // Assignee completes a task created by someone else -> only the creator.
  assert.deepEqual(
    getTaskCompletedRecipients({
      createdBy: "spencer",
      assignedTo: "casey",
      actorUserId: "casey",
    }),
    [{ userId: "spencer", role: "creator" }],
  );
});

test("getTaskCompletedRecipients de-duplicates when creator is also the assignee", () => {
  const recipients = getTaskCompletedRecipients({
    createdBy: "spencer",
    assignedTo: "spencer",
    actorUserId: "alex",
  });

  assert.deepEqual(recipients, [{ userId: "spencer", role: "creator" }]);
});

test("getTaskCompletedRecipients returns nobody when the actor created and completed it", () => {
  // Self-created, self-completed, no assignee -> no email.
  assert.deepEqual(
    getTaskCompletedRecipients({
      createdBy: "spencer",
      assignedTo: null,
      actorUserId: "spencer",
    }),
    [],
  );

  // Actor is creator and assignee -> no email.
  assert.deepEqual(
    getTaskCompletedRecipients({
      createdBy: "spencer",
      assignedTo: "spencer",
      actorUserId: "spencer",
    }),
    [],
  );
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
