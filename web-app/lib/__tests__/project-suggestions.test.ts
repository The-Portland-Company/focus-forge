/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreProjectForInboxItem,
  suggestProjectsForInboxItem,
} from "@/lib/email-inbox/project-suggestions";
import type { InboxItem, Project } from "@/lib/types";

const project = (name: string, extra: Partial<Project> = {}): Project =>
  ({ id: name, name, archived: false, ...extra }) as Project;

const email = (fields: Partial<InboxItem> = {}): InboxItem =>
  ({
    subject: "",
    summaryText: "",
    previewText: "",
    actionTitle: "",
    participants: [],
    ...fields,
  }) as unknown as InboxItem;

test("the sender's domain outranks every other signal", () => {
  const item = email({
    subject: "Invoice from Acme",
    participants: [
      {
        participantRole: "from",
        emailAddress: "billing@villagex.app",
        displayName: "Billing",
      },
    ] as InboxItem["participants"],
  });

  const ranked = suggestProjectsForInboxItem(
    [project("Acme"), project("Village X")],
    item,
  );

  assert.equal(ranked[0].project.name, "Village X");
  assert.equal(ranked[0].reason, "Sender is @villagex.app");
  // "Acme" still matches, via the subject, but ranks below the domain hit.
  assert.equal(ranked[1].project.name, "Acme");
  assert.equal(ranked[1].reason, "Mentioned in the subject");
});

test("project names match across punctuation and casing", () => {
  const item = email({
    participants: [
      { participantRole: "from", emailAddress: "hi@villagex.app" },
    ] as InboxItem["participants"],
  });

  assert.ok(scoreProjectForInboxItem(project("Village X"), item));
  assert.ok(scoreProjectForInboxItem(project("village-x"), item));
});

test("the AI summary and body preview are searched, not just the subject", () => {
  const fromSummary = scoreProjectForInboxItem(
    project("Handyman Hill"),
    email({ summaryText: "Scheduling for the Handyman Hill remodel" }),
  );
  assert.equal(fromSummary?.reason, "Mentioned in the summary");

  const fromPreview = scoreProjectForInboxItem(
    project("Handyman Hill"),
    email({ previewText: "Quote attached for Handyman Hill" }),
  );
  assert.equal(fromPreview?.reason, "Mentioned in the summary");
});

test("common words never carry a match on their own", () => {
  // "The" / "Project" are stop words and "app" is too generic — a project named
  // with only those must not match every email that happens to say them.
  assert.equal(
    scoreProjectForInboxItem(
      project("The App"),
      email({ subject: "The app is down" }),
    ),
    null,
  );
});

test("archived projects are never suggested", () => {
  const item = email({ subject: "Village X update" });
  const ranked = suggestProjectsForInboxItem(
    [project("Village X", { archived: true })],
    item,
  );
  assert.deepEqual(ranked, []);
});

test("an email with nothing to match on yields no suggestions", () => {
  const ranked = suggestProjectsForInboxItem([project("Village X")], email());
  assert.deepEqual(ranked, []);
});
