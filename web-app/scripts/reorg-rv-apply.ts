/**
 * RV cleanup APPLY (classification done by hand because every paid AI provider
 * in the org chain is out of credit and no local Cloudflare free-fallback token
 * is present). Each of the 89 open RV tasks is an infra/SaaS/marketing
 * notification mis-filed by the old substring guessProjectId — none is genuine
 * RV construction work. The mapping below routes each to a better-fit project.
 *
 * Still records a restorable task_reorg batch + moves so the whole run (or any
 * subset) can be rolled back via the rollback endpoint.
 *
 * Run: tsx scripts/reorg-rv-apply.ts            (dry-run: validate + counts)
 *      tsx scripts/reorg-rv-apply.ts --apply
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { applyReorgBatch, type ReorgMove } from "../lib/task-reorg/apply";

loadEnv({ path: "../.env" });

const RV_PROJECT_ID = "7b0c411a-15b5-4291-80b5-c27793dd92bc";
const PROPERTY_ORG_ID = "9ec51511-f279-41de-a77e-bb976fe9cc33";
const SPENCER_USER_ID = "f7c172d9-f2de-43a0-a984-8f6b7b17c70d";

// Destination projects (id → label, for the report).
const DEST = {
  ADMIN: "27d710f2-52ee-4b2f-a821-92b8625bbcd1", // TPC / Administrative
  FIN: "aeff59b6-34e5-45c1-8d5d-b3fe59ed9405", // TPC / Priorities - Financial
  SEO: "8b9689bc-c38a-4a2e-91d6-a05eac0e91e1", // TPC / SEO
  ANTISPAM: "ff9a9021-2422-4aea-808d-c8fd5f89c7c2", // TPC / TPC Anti-Spam
  STYLE: "bfa41674-91fa-4331-92df-2c9216b7996b", // TPC / Style Aesthetics
  NUERA: "bf55ac55-23c3-4d3e-810c-1686c05ef6e5", // TPC / Nu Era Heating
  STONE: "404bb831-52ee-44d1-8cac-474bce0c7817", // TPC / Stone Fabricators Market
  OMEGA: "75d1f914-72ef-4c3c-b494-c46d58692e6b", // TPC / Omega Athletics
  SALES: "7dbca6de-5fe7-4317-8f13-e9e412367b70", // TPC / Sales Organization
  AGENT: "4bf5bc87-92dc-460d-9b5e-308c326078db", // TPC / Agent Platform
  FFIOS: "981ce7f6-85c2-42a6-afb1-a78bf7b3ffa6", // TPC / Focus: Forge iOS
  KIDS: "15b384b8-4f0e-4979-a88a-1e5d46fef6c6", // TPC / Kids Cloud Club
  TINYHOUSE: "0bf2def2-bda5-4022-ac40-c77da5268523", // TPC / Tiny House
  SOLARKEN: "05ae05ef-aaa3-451d-a5d6-68ec8684cba7", // Solar Installation Company / Ken's Solar Installation
  PVD: "b73dcbec-f96e-48ed-80a4-60176c4f0e10", // Politogy: State Voter Data
  UVP: "d5cf1645-a659-453f-8dc6-cc6566c742b1", // Politogy: UVP
  PVRM: "ea2405f9-3deb-43ce-be56-fc2dae6f370c", // Politogy: VRM
  PCONTACTS: "3e27e2b6-3be2-4b94-9d0b-591f9d4a88bd", // Politogy: Contacts
  PPOLLS: "4269e5d9-3364-4145-a845-427b73735f28", // Politogy: Polls
  PPET: "c7d1d3fd-ee16-4cd0-8cc1-8a0656ca253b", // Politogy: Petitions
  INNER: "1a9a5be7-607f-456c-9050-e4aa95b30b65", // Personal / Inner Dialogue
  RENTALS: "7c0a858b-86c6-4d66-a2c0-ee8a9289a2fc", // Personal / Outdoor Rentals Business
} as const;

// taskId → destination project id. Reason category kept short.
const MAP: Record<string, string> = {
  "ee68101d-6d79-4415-858e-190c234ef960": DEST.PPET, // dunialabs/peta-core GitHub issue
  "d9b377cb-1d25-4896-8f79-f5a7a6f557ea": DEST.SEO, // Focus: SEO Supabase org invite
  "48e727a4-9dc7-4b97-9a28-5134660419ff": DEST.OMEGA, // Supabase invite from omegaathletics
  "47275c2d-e8af-422a-8e62-7d246c8aa44f": DEST.AGENT, // grok-cli PR review
  "b0e1f0fd-db20-4477-b12a-6b779abc1717": DEST.ADMIN, // Ageless login link
  "f6a8aec8-3c4d-4138-9724-fedf9b763429": DEST.PVD, // Supabase Pro upgrade — Statewide Voter Data
  "9367639a-992c-4b65-8e69-60c777f7f7cb": DEST.ADMIN, // Cloudflare case nameserver
  "e337fa4b-e28c-4fbf-87e8-33131095966f": DEST.NUERA, // Cloudflare nueraheat.net active
  "f76da4bf-5f43-461c-a84c-fa738dc39fb3": DEST.ADMIN, // Cloudflare product newsletter
  "9a4e8c7e-289a-4b03-9839-b017eedc7796": DEST.STYLE, // Style Aesthetics Meta ad photos
  "f2f0776a-d5f1-4cfd-bb0a-a64bb80d3aa1": DEST.ADMIN, // AWS suspended member account
  "00f4054d-b0d0-450c-92dd-4586173176f4": DEST.FIN, // Google Ads credit / refund
  "60f167f9-a331-4862-849d-122ba1a99e01": DEST.ADMIN, // Google Workspace security gaps
  "bdbf2150-e3c8-4562-8ccf-f495a7c72ca0": DEST.SALES, // inbound lead-gen pitch
  "17637053-86b9-4374-aeae-ba2a704773e4": DEST.STONE, // stonefabricatorsmarket.com downtime
  "e09a3e41-69da-4e0f-af6a-13a2b15ddda5": DEST.ADMIN, // generic follow-up fragment
  "9e922e3a-8df8-42c9-9241-c27dab25cd31": DEST.FIN, // money transfer notification
  "65e53ac1-583f-459c-a5ac-e2ba27e23e73": DEST.ADMIN, // scheduled services outage notice
  "d97e5d66-df44-40cb-aefd-9ec4590b0b0b": DEST.NUERA, // NuEra Heat order notification
  "4e25a317-b142-44e1-adbd-4f77ae570403": DEST.FIN, // overdue Railway invoice
  "299ba535-9ad5-4363-bee8-c18fd57894d1": DEST.ADMIN, // PayPal legal agreement changes
  "65bd093d-0a3f-4f23-8f6e-5788cbf264ec": DEST.FIN, // Plaid invoice paid
  "a0492350-b7d4-4978-a96b-2f826e4245e3": DEST.FIN, // card funds / invoice
  "e997a056-7a7d-4c69-bd7f-3d51e58b65a7": DEST.ADMIN, // "treat it as a priority" fragment
  "cd03647d-908d-43dc-91e2-f8560464c4ed": DEST.ADMIN, // Cloudflare product update
  "f5394699-f744-482d-9a4f-bc5e7df8d497": DEST.STYLE, // GitGuardian — style-aesthetics-clone
  "f68a8885-1b3f-4136-8501-47d5af2c9c22": DEST.ADMIN, // GitGuardian — tpc-umami-cloudflare
  "6189122b-5756-4098-971f-a31fd5165a08": DEST.PVD, // leaked PG creds — statewide-voter-data
  "979e6b21-6023-4669-ae19-363e45f40b7b": DEST.ADMIN, // reopen Cloudflare nameserver case
  "1b0f684d-8c79-473f-9c5d-43e644ef7e86": DEST.PVD, // Supabase quota — Statewide Voter Data
  "e3c7fe0f-cdf1-4c37-aef3-7ff7bb1ea182": DEST.ADMIN, // Cloudflare nameservers case
  "096bbb89-bb02-405d-af0a-463021c943b6": DEST.ADMIN, // Cloudflare nameservers 1asheds.com
  "f77430e3-e0b9-4600-9ec6-63f13acaa759": DEST.ADMIN, // Workspace phishing-detection newsletter
  "12cf5354-1829-4942-a2ec-a2d30135e313": DEST.FIN, // pay-by-date or services downgraded
  "2271481f-4906-44d5-ab4f-12c7d448d668": DEST.ADMIN, // Ageless Masterclass
  "cd650a34-743c-4cdb-9c6f-b434b94d8191": DEST.ADMIN, // spend cap configured
  "32b06640-1050-4ccd-97f1-3b1bae8da86b": DEST.ADMIN, // Google Ads passkey action
  "f7cd2a10-d22e-480e-97d4-7ef7c318ea7a": DEST.SALES, // PR/marketing pitch
  "352d9cc8-accf-43a4-83e2-3f8f946320d3": DEST.ADMIN, // platform free-tier/API announcement
  "7fea08eb-16d9-4929-bd7f-33fe349b54e1": DEST.ADMIN, // Google Ads targeting changes
  "b2c90587-550e-4817-9c5a-7a4501125813": DEST.PVD, // Supabase disk size — Statewide Voter Data
  "97a5d1f8-b498-414e-83ec-7ae9bcbfcb15": DEST.NUERA, // NuEra Heat set password
  "117064f7-1079-48b7-ae4f-1818b14309bf": DEST.ADMIN, // delivery status failure
  "658c5855-d514-442a-b0d9-20a4a9cd188e": DEST.SEO, // "why competitors rank higher"
  "d6c4582e-4884-4ddb-a1bc-82dd6c3888bb": DEST.ADMIN, // generic "getting started"
  "8434b9ac-e1f4-4d48-9cb4-4f003e03b9ca": DEST.ADMIN, // "is that you?" security check
  "893edaa2-aa11-456c-bf49-7946552ddf58": DEST.KIDS, // "new month for your Kid's Plan"
  "e050eeab-6da2-4c13-bd92-4142d60eb106": DEST.ANTISPAM, // moderator spam report
  "cf7ce6c8-30f5-4097-ba3e-749e97f312be": DEST.STONE, // Monitor DOWN — StoneFabricatorsAlliance.com
  "d2ecabb5-320a-4391-be6e-9a67e4643451": DEST.NUERA, // NuEra Heat set password
  "d70823a8-c5bd-4006-b196-8e068124c32b": DEST.PVRM, // point politogyvrm.com email to M365
  "9acf81d1-71fd-4805-a6b8-2bfd3ba0f89b": DEST.SALES, // partnership opportunity
  "824762b0-0a41-4f5e-9874-9a186d14aa85": DEST.ADMIN, // "question Spencer"
  "a1ba12d3-fded-4e97-9e04-c2f36b70a6ad": DEST.SEO, // white-label AI SEO
  "913eaec1-0300-4746-8f03-87ddb889929b": DEST.ADMIN, // bare "Spencer"
  "9f93bfa2-f779-4489-9567-8da45ce92598": DEST.INNER, // inner-dialogue-android incident
  "c5158ee2-eaa2-4491-8a26-8296d7b2a0d3": DEST.ADMIN, // politogy-costs-report incident
  "7cf25088-5036-41fb-b44c-8917b22dfdb6": DEST.PPOLLS, // politogy-polls incident
  "1c42acfe-40bb-4ade-8764-9fb1c799ced0": DEST.ADMIN, // TPC/shell repo incident
  "8c5e174d-bc17-4fae-b6d6-d921e1412720": DEST.ADMIN, // ToS/privacy update
  "9a4170a3-30b5-4fa1-9d1a-5f9bb69275e2": DEST.ADMIN, // Cloudflare Workflows billing notice
  "0ac29933-a4a0-440f-a6b2-28b7b38511c0": DEST.RENTALS, // Hostfully community (vacation rentals)
  "3bbfeca3-703f-43a3-9558-a3048c9b3538": DEST.UVP, // Supabase disk IO — politogy-uvp-prod
  "576da06b-c246-4f24-aa7c-8c1f2cea99ca": DEST.PVD, // Supabase disk IO — Statewide Voter Data
  "b756f0f5-049d-4c12-ac9a-17c4dbdc9ea6": DEST.SOLARKEN, // Supabase Solar Proposal System paused
  "9dd3d4c2-4c20-4f33-89e1-066a0f708f0f": DEST.SOLARKEN, // Supabase Solar Proposal System pausing
  "b89cb5fd-3e1e-49f9-9988-17657e9d0a8f": DEST.ADMIN, // "your thoughts?"
  "cf0746b0-c741-4d2b-a339-8cb7be8d5d2a": DEST.ANTISPAM, // held spam messages moderation queue
  "73a4e426-c894-48ee-99b1-18265a02a30f": DEST.ADMIN, // LastPass class-action settlement
  "05573e5d-30c5-4243-99d5-f17f8103fdf4": DEST.FIN, // Shopify Balance statements
  "d9ded7b2-e4b1-403a-a7c7-3e98180d7f32": DEST.PCONTACTS, // Contacts Dashboard UI mockup
  "cdf4cd84-9a70-4208-a3b6-9eab230b1672": DEST.PVRM, // Mailgun key — politogy-vrm
  "ef6e783e-3266-41cc-aae9-568045a97dbd": DEST.PCONTACTS, // PG creds — politogy-contacts
  "390c28a7-d0ff-4df4-bbfb-010b0dfc203c": DEST.ADMIN, // Zoho key — website-hosting-manager
  "9c0d19fd-6a8d-44fa-b070-8c9363e878f8": DEST.STYLE, // styleaesthetics.com active
  "c8b51ae3-6faf-4b66-b211-568908e0cbd0": DEST.ADMIN, // Supabase reset — remotedevelopmentserver
  "45997afe-9b71-46a3-ad82-1b78280d88fe": DEST.PVD, // Supabase Pro welcome — Statewide Voter Data
  "d748db03-d2bf-4de6-8bb2-427fbf43b8e4": DEST.ADMIN, // Supabase social-logins announcement
  "21885bed-8050-411b-a96b-4f0445882ba0": DEST.ANTISPAM, // supabas… phishing lookalike
  "61d9a1aa-a5a3-4261-bce7-2ac9de76629e": DEST.TINYHOUSE, // unpause Supabase — Tiny Homes
  "cc8e470c-7b57-4004-80cd-58b697349b2d": DEST.FIN, // Plaid invoice declined
  "4cb11e5e-d6a4-4837-9d24-774a32359e96": DEST.FIN, // Plaid payment method declined
  "108c1f86-ba89-43c8-bc28-697ebeab05f4": DEST.ADMIN, // verify email — Apify
  "2838dbc5-6f6a-452b-b03e-867ea8aa8929": DEST.ADMIN, // verify OAuth app — Supabase org
  "4d124b3b-bde7-4a44-9771-73828c36f637": DEST.ADMIN, // welcome email — Apify
  "b8004e9c-c85f-4873-8695-7828b8bd563e": DEST.ADMIN, // welcome to Supabase
  "41f09270-9065-4674-b1a7-17a92fe8eb99": DEST.FFIOS, // iOS SDK Apple support change
  "2bd7b2c8-e405-47b5-8725-7134264058f7": DEST.ADMIN, // "your service may continue" notice
  "7ae87e6d-4ee0-4048-be25-131e3e76d603": DEST.ADMIN, // "your service may continue" notice
};

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase service env");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: taskRows, error } = await db
    .from("tasks")
    .select("id,name,section_id")
    .eq("project_id", RV_PROJECT_ID)
    .eq("completed", false)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const tasks = (taskRows || []) as Array<{
    id: string;
    name: string;
    section_id: string | null;
  }>;

  const unmapped = tasks.filter((t) => !MAP[t.id]);
  if (unmapped.length) {
    console.log(`Unmapped tasks (${unmapped.length}):`);
    for (const t of unmapped) console.log(`  ${t.id}  ${t.name}`);
    throw new Error("Every open RV task must be mapped before applying.");
  }

  const idToLabel = new Map(
    Object.entries(DEST).map(([label, id]) => [id, label]),
  );
  const byDest = new Map<string, number>();
  const moves: ReorgMove[] = tasks.map((t) => {
    const dest = MAP[t.id];
    byDest.set(dest, (byDest.get(dest) || 0) + 1);
    return {
      taskId: t.id,
      beforeProjectId: RV_PROJECT_ID,
      beforeSectionId: t.section_id,
      afterProjectId: dest,
      afterSectionId: null,
      reason: "Mis-filed into 2-char RV project by old substring matcher",
      confidence: 0.9,
    };
  });

  console.log(`Mapped ${moves.length} tasks. Destinations:`);
  for (const [id, n] of [...byDest.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${idToLabel.get(id)}`);
  }

  if (!apply) {
    console.log("\nDry-run. Re-run with --apply.");
    return;
  }

  const { batchId, movedCount } = await applyReorgBatch(db, {
    organizationId: PROPERTY_ORG_ID,
    projectId: RV_PROJECT_ID,
    createdBy: SPENCER_USER_ID,
    summary: {
      sourceProjectName: "RV",
      note: "Manual classification (paid AI chain out of credit)",
      movedCount: moves.length,
      destinations: [...byDest.entries()].map(([id, count]) => ({
        project_id: id,
        label: idToLabel.get(id),
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
