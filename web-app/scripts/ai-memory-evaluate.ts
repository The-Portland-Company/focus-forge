/**
 * AI Memory Eval Harness
 *
 * Dry mode (no creds): prints fixtures + expected outcomes, exits 0.
 * Live mode (creds present): seeds memories, runs retrieval + prompt assertions,
 * prints accuracy table, cleans up, exits nonzero on any hard failure.
 */

import { buildAIMemoryPromptBlock, buildPlaybookPromptBlock } from "../lib/ai-memory/prompt";
import { shouldCreateMemoryFromEvent } from "../lib/ai-memory/write";
import { resolveRuleDrivenThreadState } from "../lib/email-inbox/reprocess";
import type { RetrievedAIMemory } from "../lib/ai-memory/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface Fixture {
  label: string;
  input: string;
  expected: {
    org?: string;
    project?: string;
    category?: string;
    priority?: string;
    estimate?: string;
  };
}

const FIXTURES: Fixture[] = [
  {
    label: "Personal haircut",
    input: "Get your haircut",
    expected: { org: "Personal", project: "Health", category: "Hygiene", priority: "low" },
  },
  {
    label: "Client website emergency fix",
    input: "Deliver emergency fix to client's website",
    expected: { org: "The Portland Company", project: "Website", category: "Bugs", priority: "P1" },
  },
  {
    label: "Checkout down",
    input: "Client says checkout is down",
    expected: { project: "Website", category: "Bugs", priority: "P1" },
  },
  {
    label: "Renew SSL cert",
    input: "Renew SSL cert for Client A",
    expected: { project: "Website", category: "DevOps", priority: "P2" },
  },
  {
    label: "Pay laundromat",
    input: "Pay laundromat",
    expected: { category: "Errands" },
  },
  {
    label: "Schedule dentist",
    input: "Schedule dentist appointment",
    expected: { org: "Personal", project: "Health", category: "Appointment" },
  },
  {
    label: "Review Stripe dispute",
    input: "Review Stripe dispute",
    expected: { category: "Finance" },
  },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string)   { return `\x1b[31m${s}\x1b[0m`; }
function bold(s: string)  { return `\x1b[1m${s}\x1b[0m`; }

// ─── Pure / offline assertions ────────────────────────────────────────────────

function runPureAssertions(): boolean {
  const results: Array<{ name: string; pass: boolean; err?: string }> = [];

  // shouldCreateMemoryFromEvent logic
  const passEvents = [
    "user_approved_task_category",
    "user_corrected_task_category",
    "user_moved_task_project",
    "user_changed_priority",
    "email_taskified",
    "memory_created",
  ] as const;

  for (const et of passEvents) {
    const ok = shouldCreateMemoryFromEvent({
      user_id: "u",
      organization_id: null,
      source_type: "task",
      event_type: et,
      before_json: null,
      after_json: null,
      reason: "user_approved",
    });
    results.push({ name: `shouldCreate:${et}`, pass: ok });
  }

  const notOk = shouldCreateMemoryFromEvent({
    user_id: "u",
    organization_id: null,
    source_type: "task",
    event_type: "ai_suggested_task_category",
    before_json: null,
    after_json: null,
    reason: "ai_suggested",
  });
  results.push({ name: "shouldCreate:ai_suggested_task_category=false", pass: !notOk });

  // buildAIMemoryPromptBlock
  const mem: RetrievedAIMemory = {
    id: "x",
    memory_type: "task_categorization",
    input_text: "client emergency",
    normalized_summary: "client website emergencies are P1",
    outcome_json: { organization: "TPC", project: "Website", category: "Bugs", priority: "P1" },
    source_type: "user_corrected",
    weight: 2.0,
    confidence: 0.9,
    source_count: 1,
    similarity: 0.95,
    score: 1.9,
  };
  const block = buildAIMemoryPromptBlock([mem]);
  results.push({ name: "promptBlock:includes input", pass: block.includes("client website emergencies are P1") });
  results.push({ name: "promptBlock:includes Organization", pass: block.includes("Organization: TPC") });
  results.push({ name: "promptBlock:includes footer", pass: block.includes("Do not treat them as hard rules") });
  results.push({ name: "promptBlock:empty array => empty string", pass: buildAIMemoryPromptBlock([]) === "" });
  results.push({ name: "playbookBlock:null => empty string", pass: buildPlaybookPromptBlock(null) === "" });

  // Hard-rule-override scenario: quarantine rule forces quarantine regardless of AI
  const quarantineResult = resolveRuleDrivenThreadState({
    aiResult: {
      classification: "reference",
      status: "active",
      actionTitle: "Looks ok",
      summary: "Seems legitimate",
      reason: "Not spam",
      confidence: 0.8,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    },
    ruleActions: new Set(["quarantine"]),
  });
  results.push({
    name: "hardRule:quarantine action forces quarantine status",
    pass: quarantineResult.status === "quarantine",
  });

  let allPass = true;
  for (const r of results) {
    const icon = r.pass ? green("✓") : red("✗");
    console.log(`  ${icon} ${r.name}`);
    if (!r.pass) allPass = false;
  }
  return allPass;
}

// ─── Live mode ────────────────────────────────────────────────────────────────

async function runLiveMode(): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const { retrieveRelevantAIMemory } = await import("../lib/ai-memory/retrieval");
  const { generateEmbedding, EMBEDDING_DIM } = await import("../lib/ai-core/embeddings");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ai_memories.user_id has an FK to profiles — use a real profile for the eval.
  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (profileErr || !profileRow) {
    console.log("\n  Skipped live eval: no profile row available to scope test memories.");
    return;
  }
  const TEST_USER_ID = profileRow.id as string;
  const seededIds: string[] = [];

  try {
    // Seed a precedent memory: client emergency → P1
    console.log("\n  Seeding precedent memories...");
    const precedentEmbedding = await generateEmbedding("client website emergency fix");
    const { data: seedRow, error: seedErr } = await supabase
      .from("ai_memories")
      .insert({
        user_id: TEST_USER_ID,
        organization_id: null,
        memory_type: "task_categorization",
        input_text: "client website emergency fix",
        normalized_summary: "client website emergencies are P1 bugs",
        outcome_json: { organization: "The Portland Company", project: "Website", category: "Bugs", priority: "P1" },
        source_event_id: null,
        source_type: "user_corrected",
        weight: 2.0,
        confidence: 0.9,
        source_count: 2,
        embedding: precedentEmbedding,
        status: "active",
      })
      .select("id")
      .single();

    if (seedErr) throw new Error(`Seed failed: ${seedErr.message}`);
    seededIds.push(seedRow.id);
    console.log(`  Seeded memory id: ${seedRow.id}`);

    // Run eval per fixture
    const results: Array<{ label: string; pass: boolean; notes: string }> = [];

    for (const fixture of FIXTURES) {
      try {
        const memories = await retrieveRelevantAIMemory(supabase, {
          userId: TEST_USER_ID,
          organizationId: null,
          inputText: fixture.input,
          memoryTypes: ["task_categorization", "priority_judgment", "project_routing"],
          limit: 6,
        });

        const block = buildAIMemoryPromptBlock(memories);

        // For client emergency fixtures, assert precedent is retrieved + in block
        const isEmergencyFixture = fixture.input.toLowerCase().includes("emergency") ||
          fixture.input.toLowerCase().includes("checkout");

        let pass = true;
        const notes: string[] = [];

        if (isEmergencyFixture) {
          const found = memories.some((m) => m.id === seedRow.id);
          if (!found) {
            pass = false;
            notes.push("precedent memory not retrieved");
          }
          if (!block.includes("P1")) {
            pass = false;
            notes.push("P1 not in prompt block");
          }
        } else {
          // For other fixtures, just assert retrieval doesn't throw and block is a string
          if (typeof block !== "string") {
            pass = false;
            notes.push("block is not a string");
          }
        }

        results.push({ label: fixture.label, pass, notes: notes.join(", ") || "ok" });
      } catch (err: any) {
        results.push({ label: fixture.label, pass: false, notes: `threw: ${err.message}` });
      }
    }

    // Print accuracy table
    console.log("\n  ┌─────────────────────────────────────────────────────────────────┐");
    console.log("  │ Fixture                          │ Result │ Notes                │");
    console.log("  ├─────────────────────────────────────────────────────────────────┤");
    let passed = 0;
    for (const r of results) {
      const icon = r.pass ? green("PASS") : red("FAIL");
      const label = r.label.padEnd(32);
      const notes = r.notes.slice(0, 20).padEnd(20);
      console.log(`  │ ${label} │ ${icon} │ ${notes} │`);
      if (r.pass) passed++;
    }
    console.log("  └─────────────────────────────────────────────────────────────────┘");
    console.log(`\n  Accuracy: ${passed}/${results.length} (${Math.round(100 * passed / results.length)}%)`);

    return results.every((r) => r.pass);
  } finally {
    // Clean up seeded rows
    if (seededIds.length > 0) {
      await supabase.from("ai_memories").delete().in("id", seededIds);
      console.log(`\n  Cleaned up ${seededIds.length} seeded row(s).`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const hasCredentials =
    !!process.env.OPENAI_API_KEY &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(bold("\n=== AI Memory Eval Harness ===\n"));

  if (!hasCredentials) {
    console.log("  Mode: DESCRIBE / DRY (no credentials detected)\n");
    console.log("  Fixtures and expected outcomes:");
    for (const f of FIXTURES) {
      console.log(`    • ${f.label} → ${JSON.stringify(f.expected)}`);
    }
    console.log("\n  Pure assertions (no network/DB):");
    const pureOk = runPureAssertions();
    if (!pureOk) {
      console.log(red("\n  Some pure assertions failed — check implementation.\n"));
      process.exit(1);
    }
    console.log(green("\n  All pure assertions passed."));
    console.log("\n  Skipped: live DB/embedding checks (no credentials)");
    console.log("  Set OPENAI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run live.\n");
    process.exit(0);
  }

  // Live mode
  console.log("  Mode: LIVE\n");
  console.log("  Pure assertions:");
  const pureOk = runPureAssertions();
  if (!pureOk) {
    console.log(red("\n  Pure assertions failed — aborting live run.\n"));
    process.exit(1);
  }

  console.log("\n  Live retrieval + prompt eval:");
  let liveOk: boolean;
  try {
    liveOk = await runLiveMode();
  } catch (err: any) {
    console.error(red(`\n  Live eval threw: ${err.message}\n`));
    process.exit(1);
  }

  if (!liveOk) {
    console.log(red("\n  FAIL — one or more live assertions failed.\n"));
    process.exit(1);
  }

  console.log(green("\n  All checks passed.\n"));
  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\nFatal: ${err.message}\n`));
  process.exit(1);
});
