/**
 * TPC "RV" (4147c3e4) cleanup. This project holds the user's GENUINE RV
 * construction / weatherization / maintenance tasks, but the old substring
 * guessProjectId also mis-filed ~35 infra/SaaS/marketing notifications into it
 * (the 2-char name "RV" matched inside "service", "server", "reserve", etc.).
 *
 * Classification done by Claude (Claude Code session) since the org's paid AI
 * provider chain is out of credit. ONLY clearly-misfiled notifications are
 * moved; every genuine RV task is left in place. Recorded as a restorable
 * task_reorg batch + moves.
 *
 * Run: tsx scripts/reorg-tpc-rv-apply.ts            (dry-run)
 *      tsx scripts/reorg-tpc-rv-apply.ts --apply
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { applyReorgBatch, type ReorgMove } from "../lib/task-reorg/apply";

loadEnv({ path: "../.env" });

const SRC_PROJECT_ID = "4147c3e4-8cfb-4ffc-b3c9-f421e8cfbf34"; // TPC / RV
const TPC_ORG_ID = "182e953a-7fa1-4b75-b070-30edd3776154";
const SPENCER_USER_ID = "f7c172d9-f2de-43a0-a984-8f6b7b17c70d";

const DEST = {
  ADMIN: "27d710f2-52ee-4b2f-a821-92b8625bbcd1", // TPC / Administrative
  FIN: "aeff59b6-34e5-45c1-8d5d-b3fe59ed9405", // TPC / Priorities - Financial
  SEO: "8b9689bc-c38a-4a2e-91d6-a05eac0e91e1", // TPC / SEO
  NUERA: "bf55ac55-23c3-4d3e-810c-1686c05ef6e5", // TPC / Nu Era Heating
  SALES: "7dbca6de-5fe7-4317-8f13-e9e412367b70", // TPC / Sales Organization
  OMEGA: "75d1f914-72ef-4c3c-b494-c46d58692e6b", // TPC / Omega Athletics
  FFWEB: "f0010ce0-cd95-45e7-9db7-ed9443b6634b", // TPC / Focus: Forge Web
  PVD: "b73dcbec-f96e-48ed-80a4-60176c4f0e10", // Politogy: State Voter Data
  PVRM: "ea2405f9-3deb-43ce-be56-fc2dae6f370c", // Politogy: VRM
  PSPECS: "9b1c13ce-d74e-4636-89d9-8d9ed26b8fbd", // Politogy: Specs
  DANCLEMENS: "130961af-dd18-4029-a586-951afd64a17d", // TPC / Dan Clemens Multisite
} as const;

// taskId → [destination, short reason]. Only clearly-misfiled tasks appear;
// every genuine RV construction/maintenance task is intentionally omitted.
const MAP: Record<string, [string, string]> = {
  c2ba78fd: [DEST.ADMIN, "Forwarded business-contact message fragment"],
  "5af22d6b": [DEST.NUERA, "NuEra Heat new-website announcement"],
  "2eee28e1": [DEST.ADMIN, "Amazon SES verified-address settings notice"],
  "721b8272": [DEST.ADMIN, "Amazon SES DKIM domain notice"],
  "8c3b6705": [DEST.ADMIN, "AWS support case correspondence"],
  faf7d9e2: [DEST.ADMIN, "Amazon SES use-case review"],
  "92474f34": [DEST.ADMIN, "AWS support case details"],
  "48777010": [DEST.ADMIN, "Verified Email Senders Program notice"],
  "76bc417c": [DEST.ADMIN, "GEO Conference invitation"],
  "2b94a363": [DEST.ADMIN, "Google Merchant Center AI-agent notice"],
  "4fb39064": [DEST.ADMIN, "Vague 'Spencer.' notification"],
  "016e2854": [DEST.NUERA, "Heater/boiler service lead (Ron)"],
  "99c5d782": [DEST.ADMIN, "DigitalOcean Spaces maintenance notice"],
  df12fc82: [DEST.ADMIN, "Google unused-OAuth-clients advisory"],
  "47abba8b": [DEST.ADMIN, "Google unused-OAuth-clients advisory"],
  "29751edc": [DEST.ADMIN, "Paid video-task interview invite"],
  "1c23ac93": [DEST.PVD, "Statewide Voter List / VRM"],
  "27d4cc6f": [DEST.ADMIN, "DigitalOcean Spaces maintenance notice"],
  edba1912: [DEST.DANCLEMENS, "Zadun Reserve Residence / Dan thread"],
  "7a590d2c": [DEST.SALES, "Cole Building construction pricing invite"],
  "5dc42d2c": [DEST.FFWEB, "Focus Forge bug: Import Contacts"],
  "6a3ef355": [DEST.SEO, "seo-tools repo incident"],
  "847d3b9f": [DEST.ADMIN, "Email delivery-status notification"],
  "65e67498": [DEST.ADMIN, "Google Ads account notice"],
  "42d1c495": [DEST.ADMIN, "Bug: error creating new users (unattributed)"],
  cdde9bca: [DEST.PVRM, "A2P spec / API documentation review (VRM messaging)"],
  c65f9ac1: [DEST.ADMIN, "Merchant Center access notice"],
  c6011b32: [DEST.NUERA, "NuEra Heat contact-form submission"],
  fdc60205: [DEST.ADMIN, "Server outage notice"],
  "9f4fc178": [DEST.PSPECS, "Spec-sheet rebuild task"],
  fff9777f: [DEST.FIN, "Billing details verification"],
  "603a4762": [DEST.PVRM, "Politogy VRM-Verified matching writeup"],
  "01ad1f5c": [DEST.ADMIN, "Railway HA Static IP migration (infra)"],
  "5e86dd83": [DEST.ADMIN, "Juneteenth holiday notice"],
  "15b95591": [DEST.OMEGA, "GitGuardian leak in omega-athletics repo"],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: taskRows, error } = await db
    .from("tasks")
    .select("id,name,section_id")
    .eq("project_id", SRC_PROJECT_ID)
    .eq("completed", false)
    .is("deleted_at", null);
  if (error) throw error;

  // Match by 8-char id prefix (that's what the MAP keys use).
  const moves: ReorgMove[] = [];
  const byDest = new Map<string, number>();
  const kept: string[] = [];
  for (const t of taskRows || []) {
    const key = (t.id as string).slice(0, 8);
    const entry = MAP[key];
    if (!entry) {
      kept.push(t.name as string);
      continue;
    }
    const [dest, reason] = entry;
    byDest.set(dest, (byDest.get(dest) || 0) + 1);
    moves.push({
      taskId: t.id as string,
      beforeProjectId: SRC_PROJECT_ID,
      beforeSectionId: (t.section_id as string) ?? null,
      afterProjectId: dest,
      afterSectionId: null,
      reason,
      confidence: 0.9,
    });
  }

  const labelById = Object.fromEntries(
    Object.entries(DEST).map(([l, id]) => [id, l]),
  );
  console.log(`Matched ${moves.length} misfiled tasks; keeping ${kept.length}.`);
  console.log("Destinations:");
  for (const [id, n] of [...byDest.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${labelById[id]}`);
  }
  console.log("\nKept (sample, first 20):");
  kept.slice(0, 20).forEach((n) => console.log("  · " + n.slice(0, 70)));

  if (!apply) {
    console.log("\nDry-run. Re-run with --apply.");
    return;
  }

  const { batchId, movedCount } = await applyReorgBatch(db, {
    organizationId: TPC_ORG_ID,
    projectId: SRC_PROJECT_ID,
    createdBy: SPENCER_USER_ID,
    summary: {
      sourceProjectName: "RV (TPC)",
      note: "Classified by Claude Code session (paid AI chain out of credit); genuine RV tasks kept",
      movedCount: moves.length,
      keptCount: kept.length,
      destinations: [...byDest.entries()].map(([id, count]) => ({
        project_id: id,
        label: labelById[id],
        count,
      })),
    },
    moves,
  });
  console.log(`\nApplied. batchId=${batchId} movedCount=${movedCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
