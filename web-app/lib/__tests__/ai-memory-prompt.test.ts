/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { buildAIMemoryPromptBlock, buildPlaybookPromptBlock } from "../ai-memory/prompt";
import type { RetrievedAIMemory, AIPlaybook } from "../ai-memory/types";

function makeMemory(overrides: Partial<RetrievedAIMemory> = {}): RetrievedAIMemory {
  return {
    id: "mem-001",
    memory_type: "task_categorization",
    input_text: "Get your haircut",
    normalized_summary: "Personal hygiene task goes to Health project",
    outcome_json: {
      organization: "Personal",
      project: "Health",
      category: "Hygiene",
      priority: "low",
      estimate_minutes: 30,
    },
    source_type: "user_corrected",
    weight: 2.0,
    confidence: 0.9,
    source_count: 3,
    similarity: 0.93,
    score: 1.86,
    ...overrides,
  };
}

test("buildAIMemoryPromptBlock includes input (normalized_summary)", () => {
  const memories = [makeMemory()];
  const result = buildAIMemoryPromptBlock(memories);
  assert.ok(result.includes("Personal hygiene task goes to Health project"), "Should include normalized_summary as input");
});

test("buildAIMemoryPromptBlock includes flattened outcome fields", () => {
  const memories = [makeMemory()];
  const result = buildAIMemoryPromptBlock(memories);
  assert.ok(result.includes("Organization: Personal"), "Should include Organization");
  assert.ok(result.includes("Project: Health"), "Should include Project");
  assert.ok(result.includes("Category: Hygiene"), "Should include Category");
  assert.ok(result.includes("Priority: low"), "Should include Priority");
  assert.ok(result.includes("Estimate: 30"), "Should include Estimate from estimate_minutes");
});

test("buildAIMemoryPromptBlock includes source type", () => {
  const memories = [makeMemory()];
  const result = buildAIMemoryPromptBlock(memories);
  assert.ok(result.includes("user corrected"), "Should include formatted source type");
});

test("buildAIMemoryPromptBlock includes 'Do not treat them as hard rules' footer", () => {
  const memories = [makeMemory()];
  const result = buildAIMemoryPromptBlock(memories);
  assert.ok(result.includes("Do not treat them as hard rules"), "Should include footer disclaimer");
});

test("buildAIMemoryPromptBlock returns empty string for empty array", () => {
  assert.equal(buildAIMemoryPromptBlock([]), "", "Empty array should return empty string");
});

test("buildPlaybookPromptBlock returns empty string for null", () => {
  assert.equal(buildPlaybookPromptBlock(null), "", "null playbook should return empty string");
});

test("buildPlaybookPromptBlock includes content_markdown when present", () => {
  const playbook: AIPlaybook = {
    id: "pb-001",
    user_id: "user-001",
    organization_id: null,
    playbook_type: "task_categorization",
    version: 1,
    content_markdown: "Always assign client emergencies to P1.",
    source_memory_ids: [],
    status: "active",
    created_by: "ai",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  };
  const result = buildPlaybookPromptBlock(playbook);
  assert.ok(result.includes("Always assign client emergencies to P1."), "Should include content_markdown");
});
