/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeDevnotesMeta,
  extractDevnotesMeta,
  normalizeProjectContentFields,
  normalizeTaskContentFields,
  stripDevnotesMeta,
} from "../devnotes-meta";

function encodeMeta(obj: Record<string, unknown>): string {
  return `[DEVNOTES_META:${Buffer.from(JSON.stringify(obj), "utf8").toString(
    "base64",
  )}]`;
}

test("decodeDevnotesMeta reads the reporter email from a bare token", () => {
  const token = encodeMeta({
    creator_email: "ben@politogyvrm.com",
    creator_name: "Ben",
  });
  assert.equal(
    decodeDevnotesMeta(token)?.creator_email,
    "ben@politogyvrm.com",
  );
});

test("decodeDevnotesMeta reads a token embedded in a description", () => {
  const description = `Save button missing\n\n${encodeMeta({
    creator_email: "ben@politogyvrm.com",
  })}`;
  assert.equal(
    decodeDevnotesMeta(description)?.creator_email,
    "ben@politogyvrm.com",
  );
});

test("decodeDevnotesMeta returns null for missing or malformed tokens", () => {
  assert.equal(decodeDevnotesMeta(null), null);
  assert.equal(decodeDevnotesMeta("no token here"), null);
  assert.equal(decodeDevnotesMeta("[DEVNOTES_META:not-base64-json!!]"), null);
});

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

test("normalizeTaskContentFields cleans task descriptions the same way", () => {
  const normalized = normalizeTaskContentFields({
    description: "Task summary\n\n[DEVNOTES_META:task-token]",
  });

  assert.deepEqual(normalized, {
    description: "Task summary",
    devnotesMeta: "[DEVNOTES_META:task-token]",
  });
});
