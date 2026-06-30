/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInboxSearchTerms,
  buildThreadSearchOrFilter,
} from "../email-inbox/server";

test("parseInboxSearchTerms splits on whitespace and drops empties", () => {
  assert.deepEqual(parseInboxSearchTerms("Ricky Klontz"), [
    "Ricky",
    "Klontz",
  ]);
  assert.deepEqual(parseInboxSearchTerms("   spaced    out  "), [
    "spaced",
    "out",
  ]);
  assert.deepEqual(parseInboxSearchTerms(""), []);
});

test("parseInboxSearchTerms strips PostgREST .or() metacharacters", () => {
  // Commas, parens, percent, asterisk, backslash would break the filter string.
  assert.deepEqual(parseInboxSearchTerms("Ric%ky, (Klo*ntz)"), [
    "Ricky",
    "Klontz",
  ]);
  // A token made entirely of metacharacters is dropped.
  assert.deepEqual(parseInboxSearchTerms("%%% ***"), []);
});

test("buildThreadSearchOrFilter ILIKEs every searchable thread column", () => {
  assert.equal(
    buildThreadSearchOrFilter("ricky"),
    "subject.ilike.%ricky%,normalized_subject.ilike.%ricky%," +
      "preview_text.ilike.%ricky%,summary_text.ilike.%ricky%," +
      "action_title.ilike.%ricky%",
  );
});
