/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecipientRaw,
  parseRecipientParts,
} from "@/components/ui/recipient-autocomplete-input";

test("splits a first and last name out of a named address", () => {
  assert.deepEqual(parseRecipientParts("Jane Doe <jane@example.com>"), {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  });
});

test("a bare address has no name parts", () => {
  assert.deepEqual(parseRecipientParts("bob@example.com"), {
    firstName: "",
    lastName: "",
    email: "bob@example.com",
  });
});

test("a single-word name lands wholly in first name", () => {
  assert.deepEqual(parseRecipientParts("Cher <cher@example.com>"), {
    firstName: "Cher",
    lastName: "",
    email: "cher@example.com",
  });
});

test("a three-part name keeps everything after the first word as last name", () => {
  assert.deepEqual(
    parseRecipientParts("Mary Jane Watson <mj@example.com>"),
    { firstName: "Mary", lastName: "Jane Watson", email: "mj@example.com" },
  );
});

test("surrounding quotes on the display name are stripped", () => {
  assert.deepEqual(parseRecipientParts('"Jane Doe" <jane@example.com>'), {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  });
});

test("build round-trips a full name", () => {
  assert.equal(
    buildRecipientRaw({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    }),
    "Jane Doe <jane@example.com>",
  );
});

test("build with no name yields a bare address", () => {
  assert.equal(
    buildRecipientRaw({ firstName: "", lastName: "", email: "x@y.com" }),
    "x@y.com",
  );
});

test("build tolerates a first name only", () => {
  assert.equal(
    buildRecipientRaw({ firstName: "Cher", lastName: "", email: "c@x.com" }),
    "Cher <c@x.com>",
  );
});

test("parse and build round-trip together", () => {
  const raw = "Fred Smith <fred@talentconnect.shop>";
  assert.equal(buildRecipientRaw(parseRecipientParts(raw)), raw);
});
