/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getDatabaseThemePreset,
  normalizeDatabaseThemePreset,
  resolveThemePreset,
} from "../theme-utils";

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

test("getDatabaseThemePreset maps system to a database-safe preset", () => {
  assert.equal(getDatabaseThemePreset("system", true), "dark");
  assert.equal(getDatabaseThemePreset("system", false), "light");
});

test("getDatabaseThemePreset maps liquid glass variants to the legacy preset", () => {
  assert.equal(getDatabaseThemePreset("liquid-glass-dark", true), "liquid-glass");
  assert.equal(getDatabaseThemePreset("liquid-glass-light", false), "liquid-glass");
});

test("normalizeDatabaseThemePreset expands the legacy liquid glass preset", () => {
  assert.equal(normalizeDatabaseThemePreset("liquid-glass"), "liquid-glass-dark");
});
