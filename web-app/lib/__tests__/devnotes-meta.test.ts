/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDevnotesMeta,
  normalizeProjectContentFields,
  stripDevnotesMeta,
} from "../devnotes-meta";

test("extractDevnotesMeta returns the embedded DevNotes payload", () => {
  const description =
    "Project summary\n\n[DEVNOTES_META:abc123]\nMore text\n[DEVNOTES_META:def456]";

  assert.equal(
    extractDevnotesMeta(description),
    "[DEVNOTES_META:abc123]\n[DEVNOTES_META:def456]",
  );
});

test("stripDevnotesMeta removes the embedded payload and collapses whitespace", () => {
  const description =
    "Project summary\n\n[DEVNOTES_META:abc123]\n\nAdditional context";

  assert.equal(
    stripDevnotesMeta(description),
    "Project summary\n\nAdditional context",
  );
});

test("normalizeProjectContentFields prefers explicit devnotesMeta and cleans description", () => {
  const normalized = normalizeProjectContentFields({
    description: "Project summary\n\n[DEVNOTES_META:embedded]",
    devnotesMeta: "[DEVNOTES_META:explicit]",
  });

  assert.deepEqual(normalized, {
    description: "Project summary",
    devnotesMeta: "[DEVNOTES_META:explicit]",
  });
});
