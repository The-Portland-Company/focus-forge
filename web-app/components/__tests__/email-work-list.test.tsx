/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEmailSubject,
  formatInboxPreviewText,
  getMailboxAccentColor,
  getMailboxBadgeLabel,
  getMailboxDisplayLabel,
  getProjectBadgeLabel,
  formatParticipantName,
  formatParticipantLine,
  formatParticipantValue,
  getEmailReadStateBadgeClassName,
  getEmailReadStateLabel,
  getEmailWorkItemStyle,
  getEmailWorkVisualUnreadState,
  getPrimarySenderParticipant,
  getEmailWorkItemClassName,
  getEmailWorkPreviewClassName,
  shouldShowAiSummary,
  shouldShowSecondaryActionTitle,
  shouldShowSpamIndicator,
  shouldShowStatusBadge,
  parseLinkedTasksResponse,
} from "../email-work-list";

test("formatEmailSubject returns the normalized subject without a prefix", () => {
  assert.equal(formatEmailSubject(" Security alert "), "Security alert");
});

test("shouldShowSecondaryActionTitle hides duplicate AI titles", () => {
  assert.equal(
    shouldShowSecondaryActionTitle("Security alert", " Security alert "),
    false,
  );
  assert.equal(
    shouldShowSecondaryActionTitle("Reply and handle: Re: Forge: Test", "Forge: Test"),
    false,
  );
  assert.equal(
    shouldShowSecondaryActionTitle(
      "Review suspicious email: Security alert",
      "Security alert",
    ),
    true,
  );
});

test("formatParticipantLine renders sender and cc labels with fallbacks", () => {
  const participants = [
    {
      id: "from-1",
      emailAddress: "alerts@example.com",
      displayName: "Alerts Team",
      participantRole: "from",
    },
    {
      id: "cc-1",
      emailAddress: "spencer@example.com",
      displayName: "Spencer Hill",
      participantRole: "cc",
    },
    {
      id: "cc-2",
      emailAddress: "spencer@example.com",
      displayName: "Spencer Hill",
      participantRole: "cc",
    },
  ];

  assert.equal(
    formatParticipantLine(participants as any, "from"),
    "From: Alerts Team <alerts@example.com>",
  );
  assert.equal(
    formatParticipantLine(participants as any, "cc"),
    "CC: Spencer Hill <spencer@example.com>",
  );
  assert.equal(formatParticipantLine([], "cc"), null);
  assert.equal(formatParticipantLine([], "from"), "From: Unknown");
});

test("formatParticipantValue falls back to the email when no distinct name exists", () => {
  assert.equal(
    formatParticipantValue({
      id: "from-2",
      emailAddress: "noreply@example.com",
      displayName: "noreply@example.com",
      participantRole: "from",
    } as any),
    "noreply@example.com",
  );
});

test("getPrimarySenderParticipant returns the from participant", () => {
  const participants = [
    {
      id: "cc-1",
      emailAddress: "cc@example.com",
      displayName: "CC",
      participantRole: "cc",
    },
    {
      id: "from-1",
      emailAddress: "alerts@example.com",
      displayName: "Alerts Team",
      participantRole: "from",
    },
  ];

  assert.equal(
    getPrimarySenderParticipant(participants as any)?.emailAddress,
    "alerts@example.com",
  );
});

test("formatParticipantName prefers display names and falls back to email", () => {
  assert.equal(
    formatParticipantName({
      id: "from-1",
      emailAddress: "alerts@example.com",
      displayName: "Alerts Team",
      participantRole: "from",
    } as any),
    "Alerts Team",
  );
  assert.equal(
    formatParticipantName({
      id: "from-2",
      emailAddress: "noreply@example.com",
      displayName: "noreply@example.com",
      participantRole: "from",
    } as any),
    "noreply@example.com",
  );
});

test("getMailboxDisplayLabel prefers display name, then mailbox name, then email", () => {
  assert.equal(
    getMailboxDisplayLabel(
      {
        id: "mailbox-1",
        name: "Operations",
        displayName: "Support",
        emailAddress: "support@example.com",
      } as any,
      {
        mailboxName: "Fallback mailbox",
        mailboxEmailAddress: "fallback@example.com",
      } as any,
    ),
    "Support",
  );

  assert.equal(
    getMailboxDisplayLabel(
      null,
      {
        mailboxName: "",
        mailboxEmailAddress: "fallback@example.com",
      } as any,
    ),
    "fallback@example.com",
  );
});

test("getMailboxAccentColor is stable for the same mailbox identity", () => {
  const first = getMailboxAccentColor(
    {
      id: "mailbox-1",
      emailAddress: "support@example.com",
    } as any,
    {
      mailboxId: "mailbox-1",
      mailboxName: "Support",
      mailboxEmailAddress: "support@example.com",
    } as any,
  );
  const second = getMailboxAccentColor(
    {
      id: "mailbox-1",
      emailAddress: "support@example.com",
    } as any,
    {
      mailboxId: "mailbox-1",
      mailboxName: "Support",
      mailboxEmailAddress: "support@example.com",
    } as any,
  );

  assert.equal(first, second);
  assert.match(first, /^hsl\(\d+ 72% 64%\)$/);
});

test("getMailboxBadgeLabel creates compact mailbox initials", () => {
  assert.equal(getMailboxBadgeLabel("Politogy VRM"), "PV");
  assert.equal(getMailboxBadgeLabel("support@example.com"), "SU");
  assert.equal(getMailboxBadgeLabel(""), "MB");
});

test("getProjectBadgeLabel creates compact initials for linked projects", () => {
  assert.equal(
    getProjectBadgeLabel({
      name: "Politogy VRM",
    } as any),
    "PV",
  );
  assert.equal(
    getProjectBadgeLabel({
      name: "Moving",
    } as any),
    "MO",
  );
  assert.equal(getProjectBadgeLabel(null), null);
});

test("formatInboxPreviewText strips html, markdown, and line breaks", () => {
  assert.equal(
    formatInboxPreviewText(
      "<p>Hello Jon,</p>\n\nThis is **bla** [link](https://example.com)",
    ),
    "Hello Jon, This is bla link",
  );
});

test("formatInboxPreviewText truncates long previews with ellipsis", () => {
  const input = `Hello Jon, ${"a".repeat(210)}`;
  const output = formatInboxPreviewText(input, 25);

  assert.equal(output, "Hello Jon, aaaaaaaaaaaaaa...");
});

test("shouldShowAiSummary hides short or duplicate summaries", () => {
  assert.equal(
    shouldShowAiSummary({
      summaryText: "Reply from Forge.",
      previewText: "Reply from Forge.",
    }),
    false,
  );
  assert.equal(
    shouldShowAiSummary({
      summaryText: "Password reset link",
      previewText: "Password reset link",
    }),
    false,
  );
  assert.equal(
    shouldShowAiSummary({
      summaryText: "Customer is asking for pricing details and a follow-up call next week.",
      previewText: "Can you share pricing and a time for a call next week?",
    }),
    true,
  );
});

test("shouldShowStatusBadge only shows badges for quarantine and spam states", () => {
  assert.equal(shouldShowStatusBadge("active"), false);
  assert.equal(shouldShowStatusBadge("needs_project"), false);
  assert.equal(shouldShowStatusBadge("quarantine"), true);
  assert.equal(shouldShowStatusBadge("spam"), true);
});

test("shouldShowSpamIndicator only flags ai-identified spam states", () => {
  assert.equal(shouldShowSpamIndicator("active"), false);
  assert.equal(shouldShowSpamIndicator("needs_project"), false);
  assert.equal(shouldShowSpamIndicator("quarantine"), true);
  assert.equal(shouldShowSpamIndicator("spam"), true);
});

test("getEmailWorkItemClassName keeps unread threads brand-accented", () => {
  const unreadClasses = getEmailWorkItemClassName({
    isSelected: false,
    isUnread: true,
  });
  const selectedUnreadClasses = getEmailWorkItemClassName({
    isSelected: true,
    isUnread: true,
  });
  const readClasses = getEmailWorkItemClassName({
    isSelected: false,
    isUnread: false,
  });

  assert.match(
    unreadClasses,
    /transition-\[background-color,background-image,border-color\]/,
  );
  assert.match(
    selectedUnreadClasses,
    /transition-\[background-color,background-image,border-color\]/,
  );
  assert.match(
    readClasses,
    /transition-\[background-color,background-image,border-color\]/,
  );
});

test("getEmailWorkItemStyle keeps unread rows accented and selected rows on a dark read surface", () => {
  const unreadStyle = getEmailWorkItemStyle({
    isSelected: false,
    isUnread: true,
  });
  const selectedUnreadStyle = getEmailWorkItemStyle({
    isSelected: true,
    isUnread: true,
  });
  const selectedReadStyle = getEmailWorkItemStyle({
    isSelected: true,
    isUnread: false,
  });
  const readStyle = getEmailWorkItemStyle({
    isSelected: false,
    isUnread: false,
  });

  assert.match(String(unreadStyle.backgroundImage), /var\(--user-profile-gradient\)/);
  assert.match(String(unreadStyle.backgroundImage), /0\.9/);
  assert.equal(selectedUnreadStyle.backgroundColor, "rgba(255, 255, 255, 0.12)");
  assert.equal(selectedReadStyle.backgroundColor, "rgba(255, 255, 255, 0.12)");
  assert.equal(readStyle.backgroundColor, "rgba(255, 255, 255, 0.10)");
});

test("getEmailWorkVisualUnreadState treats selected unread threads as visually read", () => {
  assert.equal(
    getEmailWorkVisualUnreadState({
      isSelected: false,
      isUnread: true,
    }),
    true,
  );
  assert.equal(
    getEmailWorkVisualUnreadState({
      isSelected: true,
      isUnread: true,
    }),
    false,
  );
  assert.equal(
    getEmailWorkVisualUnreadState({
      isSelected: false,
      isUnread: false,
    }),
    false,
  );
});

test("read state badge helpers distinguish unread and read styles", () => {
  assert.equal(getEmailReadStateLabel(true), "Unread");
  assert.equal(getEmailReadStateLabel(false), "Read");
  assert.match(
    getEmailReadStateBadgeClassName(true),
    /text-\[rgb\(var\(--theme-primary-rgb\)\)\]/,
  );
  assert.match(getEmailReadStateBadgeClassName(false), /text-zinc-400/);
});

test("getEmailWorkPreviewClassName keeps previews wrapping inside the list pane", () => {
  const unreadPreviewClasses = getEmailWorkPreviewClassName(true);
  const readPreviewClasses = getEmailWorkPreviewClassName(false);

  assert.match(unreadPreviewClasses, /break-words/);
  assert.match(unreadPreviewClasses, /whitespace-normal/);
  assert.match(unreadPreviewClasses, /font-semibold/);
  assert.match(unreadPreviewClasses, /text-zinc-100/);
  assert.doesNotMatch(unreadPreviewClasses, /truncate/);
  assert.match(readPreviewClasses, /font-normal/);
  assert.match(readPreviewClasses, /text-zinc-400/);
});

test("parseLinkedTasksResponse returns valid linked tasks", async () => {
  const response = new Response(
    JSON.stringify([
      { id: "task-1", name: "Follow up with Ben" },
      { id: "task-2", name: "Ship final draft" },
      { id: 3, title: "invalid" },
    ]),
    { status: 200 },
  );

  const tasks = await parseLinkedTasksResponse(response);

  assert.deepEqual(tasks, [
    { id: "task-1", name: "Follow up with Ben" },
    { id: "task-2", name: "Ship final draft" },
  ]);
});

test("parseLinkedTasksResponse throws the api error message", async () => {
  const response = new Response(
    JSON.stringify({ error: "Thread not found" }),
    { status: 404 },
  );

  await assert.rejects(
    () => parseLinkedTasksResponse(response),
    /Thread not found/,
  );
});
