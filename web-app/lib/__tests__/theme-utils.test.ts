/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveThemePreset } from "../theme-utils";

test("resolveThemePreset inherits dark mode when the system prefers dark", () => {
  assert.equal(resolveThemePreset("system", true), "dark");
});

test("resolveThemePreset inherits light mode when the system prefers light", () => {
  assert.equal(resolveThemePreset("system", false), "light");
});

test("resolveThemePreset leaves explicit presets unchanged", () => {
  assert.equal(resolveThemePreset("dark", false), "dark");
  assert.equal(resolveThemePreset("light", true), "light");
  assert.equal(resolveThemePreset("liquid-glass-dark", false), "liquid-glass-dark");
});
