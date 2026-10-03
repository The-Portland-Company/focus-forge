import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isProjectLockedError } from "../db/project-lock-error";

describe("isProjectLockedError", () => {
  test("matches the trigger's exception message", () => {
    assert.equal(
      isProjectLockedError({
        message: "project_locked: cannot delete locked project abc-123",
      }),
      true,
    );
  });
  test("false for unrelated errors", () => {
    assert.equal(isProjectLockedError({ message: "connection refused" }), false);
    assert.equal(isProjectLockedError(new Error("not found")), false);
  });
  test("false for non-error values", () => {
    assert.equal(isProjectLockedError(null), false);
    assert.equal(isProjectLockedError(undefined), false);
    assert.equal(isProjectLockedError("project_locked"), false);
  });
});
