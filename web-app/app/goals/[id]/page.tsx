import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// This page is per-user and auth-gated (middleware), so render dynamically.
export const dynamic = "force-dynamic";

type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  section_id: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

type PlanRow = { id: string; name: string; updated_at: string };
type TaskRow = { id: string; name: string; completed: boolean };

async function loadGoal(id: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return null;

  // RLS scopes each query to what the signed-in user can see.
  const { data: goal } = await supabase
    .from("goals")
    .select(
      "id,name,description,project_id,section_id,completed,created_at,updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!goal) return null;

  const [{ data: plans }, { data: tasks }] = await Promise.all([
    supabase
      .from("plans")
      .select("id,name,updated_at")
      .eq("goal_id", id)
      .is("deleted_at", null)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,name,completed")
      .eq("goal_id", id)
      .is("deleted_at", null)
      .order("order_index", { ascending: true }),
  ]);

  return {
    goal: goal as GoalRow,
    plans: (plans as PlanRow[]) ?? [],
    tasks: (tasks as TaskRow[]) ?? [],
  };
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const loaded = await loadGoal(id);
  return { title: loaded ? `${loaded.goal.name} · Goal` : "Goal" };
}

export default async function GoalRoutePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const loaded = await loadGoal(id);

  if (!loaded) notFound();

  const { goal, plans, tasks } = loaded;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            ← Focus Forge
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {goal.completed ? "✓ " : ""}
          {goal.name}
        </h1>
        {goal.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {goal.description}
          </p>
        )}

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Plans
          </h2>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plans yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {plans.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/plans/${p.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent"
                  >
                    <span className="text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span aria-hidden>{t.completed ? "☑" : "☐"}</span>
                  <span className={t.completed ? "text-muted-foreground line-through" : ""}>
                    {t.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
