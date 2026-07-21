import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canWriteShare,
  normalizePermission,
  isShareActive,
} from "../project-share";

const base = {
  revoked_at: null as string | null,
  expires_at: null as string | null,
  allow_public: true as boolean | null,
  permission: "write" as string | null,
};

describe("normalizePermission", () => {
  test("only the exact string 'write' grants write", () => {
    assert.equal(normalizePermission("write"), "write");
    assert.equal(normalizePermission("read"), "read");
  });

  test("anything unexpected falls back to read", () => {
    for (const value of [
      undefined,
      null,
      "",
      "WRITE",
      "admin",
      true,
      1,
      {},
      ["write"],
    ]) {
      assert.equal(normalizePermission(value), "read");
    }
  });
});

describe("canWriteShare", () => {
  test("grants write for an active, public, write-level share", () => {
    assert.equal(canWriteShare(base), true);
  });

  test("denies a read-level share", () => {
    assert.equal(canWriteShare({ ...base, permission: "read" }), false);
    assert.equal(canWriteShare({ ...base, permission: null }), false);
  });

  test("denies a revoked share even at write level", () => {
    assert.equal(
      canWriteShare({ ...base, revoked_at: new Date().toISOString() }),
      false,
    );
  });

  test("denies an expired share even at write level", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    assert.equal(canWriteShare({ ...base, expires_at: past }), false);
  });

  test("allows a not-yet-expired share", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(canWriteShare({ ...base, expires_at: future }), true);
  });

  test("denies when public access is switched off", () => {
    assert.equal(canWriteShare({ ...base, allow_public: false }), false);
  });
});

describe("isShareActive", () => {
  test("treats expiry as inclusive of the boundary", () => {
    assert.equal(
      isShareActive({ revoked_at: null, expires_at: new Date().toISOString() }),
      false,
    );
  });

  test("a share with no expiry never expires", () => {
    assert.equal(isShareActive({ revoked_at: null, expires_at: null }), true);
  });
});
