/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEmailSubject,
  formatInboxPreviewText,
  formatParticipantName,
  formatParticipantLine,
  formatParticipantValue,
  getPrimarySenderParticipant,
  getEmailWorkItemClassName,
  getEmailWorkPreviewClassName,
  shouldShowSecondaryActionTitle,
  shouldShowStatusBadge,
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

test("shouldShowStatusBadge hides the active badge only", () => {
  assert.equal(shouldShowStatusBadge("active"), false);
  assert.equal(shouldShowStatusBadge("quarantine"), true);
});

test("getEmailWorkItemClassName highlights unread threads when they are not selected", () => {
  const unreadClasses = getEmailWorkItemClassName({
    isSelected: false,
    isUnread: true,
  });
  const readClasses = getEmailWorkItemClassName({
    isSelected: false,
    isUnread: false,
  });

  assert.match(
    unreadClasses,
    /border-\[rgb\(var\(--theme-primary-rgb\)\)\]\/35/,
  );
  assert.doesNotMatch(
    readClasses,
    /border-\[rgb\(var\(--theme-primary-rgb\)\)\]\/35/,
  );
});

test("getEmailWorkPreviewClassName keeps previews wrapping inside the list pane", () => {
  const previewClasses = getEmailWorkPreviewClassName(true);

  assert.match(previewClasses, /break-words/);
  assert.match(previewClasses, /whitespace-normal/);
  assert.doesNotMatch(previewClasses, /truncate/);
});
