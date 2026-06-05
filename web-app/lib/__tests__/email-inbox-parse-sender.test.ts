import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeParticipant,
  parseAddressString,
  selectPrimarySender,
} from "@/lib/email-inbox/parse-sender";
import type { InboxParticipant } from "@/lib/types";

function from(
  partial: Partial<InboxParticipant> & { id?: string },
): InboxParticipant {
  return {
    id: partial.id ?? "p1",
    emailAddress: partial.emailAddress ?? "",
    displayName: partial.displayName ?? null,
    participantRole: partial.participantRole ?? "from",
    profileId: partial.profileId ?? null,
    contactId: partial.contactId ?? null,
  };
}

test("parseAddressString: Name <email>", () => {
  assert.deepEqual(parseAddressString("Dan Clemens <dan@x.com>"), {
    name: "Dan Clemens",
    email: "dan@x.com",
  });
});

test("parseAddressString: quoted name", () => {
  assert.deepEqual(parseAddressString('"Clemens, Dan" <dan@x.com>'), {
    name: "Clemens, Dan",
    email: "dan@x.com",
  });
  assert.deepEqual(parseAddressString("'Semrush' via Agency <a@x.com>"), {
    name: "'Semrush' via Agency",
    email: "a@x.com",
  });
});

test("parseAddressString: bare email", () => {
  assert.deepEqual(parseAddressString("dan@x.com"), {
    name: "",
    email: "dan@x.com",
  });
});

test("parseAddressString: angle only", () => {
  assert.deepEqual(parseAddressString("<dan@x.com>"), {
    name: "",
    email: "dan@x.com",
  });
});

test("parseAddressString: name == email is dropped", () => {
  assert.deepEqual(parseAddressString("dan@x.com <dan@x.com>"), {
    name: "",
    email: "dan@x.com",
  });
});

test("parseAddressString: name-only value", () => {
  assert.deepEqual(parseAddressString("Support Team"), {
    name: "Support Team",
    email: "",
  });
});

test("parseAddressString: name then bare email no brackets", () => {
  assert.deepEqual(parseAddressString("Dan Clemens dan@x.com"), {
    name: "Dan Clemens",
    email: "dan@x.com",
  });
});

test("parseAddressString: empty/nullish", () => {
  assert.deepEqual(parseAddressString(""), { name: "", email: "" });
  assert.deepEqual(parseAddressString(null), { name: "", email: "" });
  assert.deepEqual(parseAddressString(undefined), { name: "", email: "" });
});

test("normalizeParticipant: raw header stuffed in email column", () => {
  const result = normalizeParticipant(
    from({ emailAddress: "Dan Clemens <dan@x.com>", displayName: null }),
  );
  assert.equal(result.emailAddress, "dan@x.com");
  assert.equal(result.displayName, "Dan Clemens");
});

test("normalizeParticipant: address only in display name", () => {
  const result = normalizeParticipant(
    from({ emailAddress: "", displayName: "Dan <dan@x.com>" }),
  );
  assert.equal(result.emailAddress, "dan@x.com");
  assert.equal(result.displayName, "Dan");
});

test("normalizeParticipant: clean row is unchanged", () => {
  const input = from({ emailAddress: "dan@x.com", displayName: "Dan" });
  assert.deepEqual(normalizeParticipant(input), input);
});

test("selectPrimarySender: returns null when no from participants", () => {
  assert.equal(selectPrimarySender([]), null);
  assert.equal(
    selectPrimarySender([from({ participantRole: "to", emailAddress: "x@x.com" })]),
    null,
  );
});

test("selectPrimarySender: prefers the entry with data over an empty one", () => {
  const empty = from({ id: "a", emailAddress: "", displayName: null });
  const withData = from({ id: "b", emailAddress: "dan@x.com", displayName: "Dan" });
  const result = selectPrimarySender([empty, withData]);
  assert.equal(result?.id, "b");
  assert.equal(result?.emailAddress, "dan@x.com");
});

test("selectPrimarySender: ties resolve to the most recent (last) entry", () => {
  const older = from({ id: "old", emailAddress: "old@x.com", displayName: "Old" });
  const newer = from({ id: "new", emailAddress: "new@x.com", displayName: "New" });
  const result = selectPrimarySender([older, newer]);
  assert.equal(result?.id, "new");
});

test("selectPrimarySender: parses raw header on the chosen entry", () => {
  const result = selectPrimarySender([
    from({ emailAddress: "Dan Clemens <dan@x.com>" }),
  ]);
  assert.equal(result?.emailAddress, "dan@x.com");
  assert.equal(result?.displayName, "Dan Clemens");
});
