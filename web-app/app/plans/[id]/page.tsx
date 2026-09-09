import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// This page is per-user and auth-gated (middleware), so render dynamically.
export const dynamic = "force-dynamic";

type PlanRow = {
  id: string;
  name: string;
  content_markdown: string | null;
  organization_id: string | null;
  project_id: string | null;
  goal_id: string | null;
  section_id: string | null;
  created_at: string;
  updated_at: string;
};

async function loadPlan(id: string): Promise<PlanRow | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Auth is enforced by middleware, but guard here too so a missing session
  // reads as "not found" rather than leaking the query.
  if (!session?.user) return null;

  // RLS scopes this to plans the signed-in user can see.
  const { data } = await supabase
    .from("plans")
    .select(
      "id,name,content_markdown,organization_id,project_id,goal_id,section_id,created_at,updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return (data as PlanRow) ?? null;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const plan = await loadPlan(id);
  return { title: plan ? `${plan.name} · Plan` : "Plan" };
}

function ownerLink(plan: PlanRow): { href: string; label: string } | null {
  // Only goals have a standalone reader route today; other owners fall back to
  // the Focus Forge home breadcrumb.
  if (plan.goal_id) return { href: `/goals/${plan.goal_id}`, label: "goal" };
  return null;
}

export default async function PlanRoutePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const plan = await loadPlan(id);

  if (!plan) notFound();

  const updated = new Date(plan.updated_at).toLocaleString();
  const owner = ownerLink(plan);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            ← Focus Forge
          </Link>
          {owner && (
            <>
              <span aria-hidden>/</span>
              <Link
                href={owner.href}
                className="hover:text-foreground hover:underline"
              >
                {owner.label}
              </Link>
            </>
          )}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{plan.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan · updated {updated}
        </p>

        <article className="mt-8 rounded-lg border border-border bg-card p-6">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
            {plan.content_markdown ?? ""}
          </pre>
        </article>
      </div>
    </div>
  );
}
