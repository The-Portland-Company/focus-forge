#!/usr/bin/env node
/**
 * Supabase Advisor gate.
 *
 * Fetches the project's security and performance advisors and compares them to
 * a committed baseline, failing on anything NEW. The database carries a large
 * pre-existing backlog (see supabase/advisor-baseline.json); gating on the
 * absolute count would leave the build permanently red and teach everyone to
 * ignore it. Gating on regressions makes it actionable from day one.
 *
 * Findings are identified by `cache_key`, which the Advisor API assigns per
 * finding (e.g. `extension_in_public_vector`) and which stays stable across
 * runs, so renaming a lint category doesn't churn the baseline.
 *
 * Usage:
 *   node scripts/supabase-advisor.mjs            # check against baseline
 *   node scripts/supabase-advisor.mjs --update   # rewrite the baseline
 *   node scripts/supabase-advisor.mjs --summary  # print counts, never fail
 *
 * Credentials, in order of preference:
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF  (CI: repo secrets)
 *   1Password item "Supabase - Focus: Forge" -> "Account Token"  (local)
 *
 * Exit codes: 0 clean, 1 new findings, 2 could not run (missing creds/network).
 * A run that cannot authenticate never fails a build as if the database were
 * dirty — that distinction is why 2 exists.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "supabase", "advisor-baseline.json");
const KINDS = ["security", "performance"];

// Levels that fail the build when newly introduced. INFO is advisory only.
const FAILING_LEVELS = new Set(["ERROR", "WARN"]);

const args = new Set(process.argv.slice(2));
const MODE = args.has("--update")
  ? "update"
  : args.has("--summary")
    ? "summary"
    : "check";

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function readEnvFile() {
  // Local convenience: pick the project ref out of .env without sourcing it.
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function resolveCredentials() {
  const env = readEnvFile();
  const ref = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF;
  let token = process.env.SUPABASE_ACCESS_TOKEN;

  if (!token) {
    // Local fallback: read the management PAT straight from 1Password so the
    // token never has to live in a dotfile.
    try {
      const raw = execFileSync(
        "op",
        ["item", "get", "Supabase - Focus: Forge", "--format", "json"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const item = JSON.parse(raw);
      token = (item.fields || []).find((f) => f.label === "Account Token")
        ?.value;
    } catch {
      /* op unavailable or locked — handled by the caller */
    }
  }
  return { ref, token };
}

async function fetchLints(ref, token, kind) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/advisors/${kind}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`advisors/${kind} returned ${res.status}`);
  }
  const body = await res.json();
  return body.lints || [];
}

function fingerprint(kind, lint) {
  return `${kind}:${lint.cache_key || `${lint.name}:${lint.detail}`}`;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return { findings: {} };
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

async function main() {
  const { ref, token } = resolveCredentials();
  if (!ref || !token) {
    log(
      "supabase-advisor: no credentials (need SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF, or 1Password) — skipping",
    );
    process.exit(2);
  }

  let all = [];
  try {
    for (const kind of KINDS) {
      const lints = await fetchLints(ref, token, kind);
      all.push(...lints.map((l) => ({ ...l, kind })));
    }
  } catch (error) {
    log(`supabase-advisor: could not reach the Advisor API — ${error.message}`);
    process.exit(2);
  }

  const counts = all.reduce((acc, l) => {
    const key = `${l.kind}/${l.level}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  log("Supabase Advisor:");
  for (const [key, n] of Object.entries(counts).sort()) log(`  ${key}: ${n}`);

  if (MODE === "summary") process.exit(0);

  if (MODE === "update") {
    const findings = {};
    for (const l of all) {
      findings[fingerprint(l.kind, l)] = {
        level: l.level,
        name: l.name,
        detail: l.detail,
      };
    }
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          note: "Known Supabase Advisor findings. CI fails on anything NEW, not on these. Shrink deliberately; regenerate with: node scripts/supabase-advisor.mjs --update",
          generated_at: new Date().toISOString(),
          total: all.length,
          findings,
        },
        null,
        2,
      )}\n`,
    );
    log(`Baseline updated: ${all.length} known findings.`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const known = new Set(Object.keys(baseline.findings || {}));
  const fresh = all.filter(
    (l) => !known.has(fingerprint(l.kind, l)) && FAILING_LEVELS.has(l.level),
  );
  const resolved = [...known].filter(
    (k) => !all.some((l) => fingerprint(l.kind, l) === k),
  );

  if (resolved.length > 0) {
    log(
      `\n${resolved.length} baselined finding(s) no longer present — run --update to shrink the baseline.`,
    );
  }

  if (fresh.length === 0) {
    log("\nNo new advisor findings.");
    process.exit(0);
  }

  log(`\n${fresh.length} NEW advisor finding(s):`);
  for (const l of fresh) {
    log(`  [${l.level}] ${l.kind}/${l.name}`);
    log(`      ${String(l.detail || "").replace(/\\`/g, "`")}`);
    if (l.remediation) log(`      ${l.remediation}`);
  }
  log(
    "\nFix them, or if intentional record them with: node scripts/supabase-advisor.mjs --update",
  );
  process.exit(1);
}

main().catch((error) => {
  log(`supabase-advisor: unexpected failure — ${error.message}`);
  process.exit(2);
});
