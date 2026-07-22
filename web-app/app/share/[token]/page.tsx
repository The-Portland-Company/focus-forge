import { Fragment } from "react";
import { cookies } from "next/headers";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  canWriteShare,
  isShareActive,
  isValidShareCookie,
  shareCookieName,
} from "@/lib/project-share";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { hasRichTextContent } from "@/lib/rich-text";
import { ShareTaskBoard } from "@/components/share-task-board";
import { SupplyTotal } from "@/components/supply-total";
import { SupplyLine } from "@/components/supply-line";
import { taskDisplayName, hasSupplies, type SupplyLike } from "@/lib/supply";
import { ShareSupplyPanel } from "@/components/share-supply-panel";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-5 py-10 sm:px-8">{children}</div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        Shared via Focus Forge
      </footer>
    </div>
  );
}

function Unavailable() {
  return (
    <Shell>
      <div className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-white">
          This link is no longer available
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          The share link may have been revoked or has expired.
        </p>
      </div>
    </Shell>
  );
}

function PasscodeGate({
  token,
  error,
}: {
  token: string;
  error?: boolean;
}) {
  return (
    <Shell>
      <div className="mx-auto max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-4 flex items-center gap-2 text-zinc-200">
          <Lock className="h-5 w-5" />
          <h1 className="text-base font-semibold">Passcode required</h1>
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Enter the passcode to view this project.
        </p>
        <form method="POST" action={`/api/share/${token}/verify`}>
          <input
            type="password"
            name="passcode"
            autoFocus
            placeholder="Passcode"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[rgb(var(--theme-primary-rgb))] focus:outline-none"
          />
          {error && (
            <p className="mt-2 text-xs text-red-400">
              Incorrect passcode. Please try again.
            </p>
          )}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-theme-gradient px-3 py-2 text-sm font-medium text-white"
          >
            View project
          </button>
        </form>
      </div>
    </Shell>
  );
}

export default async function SharePage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await props.params;
  const { error } = await props.searchParams;

  let share: {
    id: string;
    project_id: string;
    passcode_hash: string | null;
    revoked_at: string | null;
    expires_at: string | null;
    allow_public: boolean | null;
    permission: string | null;
  } | null = null;

  let admin: ReturnType<typeof getAdminClient>;
  try {
    admin = getAdminClient();
    // Cap wait — hung PostgREST must not leave the public share route open forever.
    const query = admin
      .from("project_shares")
      .select(
        "id,project_id,passcode_hash,revoked_at,expires_at,allow_public,permission",
      )
      .eq("token", token)
      .maybeSingle();
    const timed = await Promise.race([
      query,
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: { message: "share lookup timed out" } }),
          5_000,
        ),
      ),
    ]);
    if (timed.error) {
      console.error("Share lookup failed:", timed.error);
      return <Unavailable />;
    }
    share = timed.data;
  } catch (error) {
    console.error("Share page error:", error);
    return <Unavailable />;
  }

  if (!share || !isShareActive(share) || share.allow_public === false) {
    return <Unavailable />;
  }

  // Passcode gate.
  if (share.passcode_hash) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(shareCookieName(token))?.value;
    if (!isValidShareCookie(token, cookieVal)) {
      return <PasscodeGate token={token} error={error === "1"} />;
    }
  }

  // Load ONLY the single project tied to this token.
  let project: { id: string; name: string; goal: string | null; description: string | null } | null =
    null;
  let sections: Array<{ id: string; name: string; todoist_order: number | null }> | null = null;
  let tasks: Array<{
    id: string;
    name: string;
    completed: boolean | null;
    section_id: string | null;
    parent_id: string | null;
    is_supply: boolean | null;
    supply_quantity: number | string | null;
    supply_price: number | string | null;
    supply_vendor: string | null;
    supply_make: string | null;
    supply_model: string | null;
    supply_type: string | null;
  }> | null = null;

  try {
    const projectRes = await admin
      .from("projects")
      .select("id,name,goal,description")
      .eq("id", share.project_id)
      .is("deleted_at", null)
      .maybeSingle();
    project = projectRes.data;
    if (!project) {
      return <Unavailable />;
    }

    const [sectionRes, taskRes] = await Promise.all([
      admin
        .from("sections")
        .select("id,name,todoist_order")
        .eq("project_id", project.id)
        .is("deleted_at", null)
        .order("todoist_order", { ascending: true }),
      admin
        .from("tasks")
        .select(
          "id,name,completed,section_id,todoist_order,parent_id,is_supply,supply_quantity,supply_price,supply_vendor,supply_make,supply_model,supply_type",
        )
        .eq("project_id", project.id)
        .is("deleted_at", null)
        .order("todoist_order", { ascending: true }),
    ]);
    sections = sectionRes.data;
    tasks = taskRes.data;
  } catch (loadError) {
    console.error("Share project load failed:", loadError);
    return <Unavailable />;
  }

  if (!project) {
    return <Unavailable />;
  }

  const allTasks = (tasks || []) as Array<{
    id: string;
    name: string;
    completed: boolean | null;
    section_id: string | null;
    parent_id: string | null;
    is_supply: boolean | null;
    supply_quantity: number | string | null;
    supply_price: number | string | null;
    supply_vendor: string | null;
    supply_make: string | null;
    supply_model: string | null;
    supply_type: string | null;
  }>;

  // Subtasks nest under their parent rather than sitting beside it. A child
  // may carry a different section_id (or none) from its parent, so grouping is
  // driven by ROOT tasks only and children follow their parent wherever it
  // lands — otherwise a subtask surfaces as a stray top-level row in the
  // unsectioned "Tasks" group.
  const childrenByParent = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    const parentId = task.parent_id;
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(task);
    else childrenByParent.set(parentId, [task]);
  }

  const knownIds = new Set(allTasks.map((t) => t.id));
  // A task whose parent was deleted or lies outside this project would never
  // render if it were treated as a child, so it is promoted to a root.
  const isRoot = (task: (typeof allTasks)[number]) =>
    !task.parent_id || !knownIds.has(task.parent_id);

  const rootTasksBySection = (sectionId: string | null) =>
    allTasks.filter(
      (t) => isRoot(t) && (t.section_id || null) === sectionId,
    );

  /** A task plus every descendant, so a section's supplies include subtasks. */
  const withDescendants = (
    roots: typeof allTasks,
  ): typeof allTasks => {
    const out: typeof allTasks = [];
    const walk = (task: (typeof allTasks)[number]) => {
      out.push(task);
      for (const child of childrenByParent.get(task.id) || []) walk(child);
    };
    roots.forEach(walk);
    return out;
  };

  const renderTask = (
    task: (typeof allTasks)[number],
    depth = 0,
  ): React.ReactNode => {
    const children = childrenByParent.get(task.id) || [];
    return (
      <li key={task.id}>
        <div
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
          style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
        >
          {task.completed ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-zinc-600" />
          )}
          <span
            className={
              task.completed
                ? "text-sm text-zinc-500 line-through"
                : "text-sm text-zinc-200"
            }
          >
            {taskDisplayName(task, task.name)}
          </span>
          <SupplyLine task={task} />
        </div>
        {children.length > 0 && (
          <ul className="mt-1.5 space-y-1.5">
            {children.map((child) => renderTask(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  // Re-derived from the row on every request, so revoking or downgrading a link
  // takes effect on the next load rather than being baked into the markup.
  const canWrite = canWriteShare(share);

  const groups: Array<{ id: string | null; name: string }> = [
    { id: null, name: "Tasks" },
    ...((sections || []) as Array<{ id: string; name: string }>).map((s) => ({
      id: s.id,
      name: s.name,
    })),
  ];

  return (
    <Shell>
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <span className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {canWrite ? "Can edit" : "View only"}
          </span>
        </div>
        {project.goal && (
          <p className="mt-2 text-sm text-zinc-400">{project.goal}</p>
        )}
        {hasRichTextContent(project.description || "") && (
          <div className="mt-4 text-sm text-zinc-300">
            <RichTextContent html={project.description || ""} />
          </div>
        )}
      </header>

      {canWrite ? (
        <ShareTaskBoard
          token={token}
          groups={groups}
          initialTasks={allTasks}
        />
      ) : (
      /*
        One grid, two columns: tasks left, that section's supplies right. Each
        section is its own grid row, so the supplies panel always starts level
        with the section it belongs to no matter how tall either side grows —
        two independently-flowing columns would drift apart. Below `lg` the
        grid collapses to one column and each supplies panel stacks directly
        under its own section.
      */
      <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        {groups.map((group) => {
          const roots = rootTasksBySection(group.id);
          if (roots.length === 0) return null;
          // Supplies count the whole subtree, not just top-level rows.
          const groupTasks = withDescendants(roots);
          return (
            <Fragment key={group.id ?? "no-section"}>
              <section className="lg:col-start-1">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  {group.name}
                </h2>
                <ul className="space-y-1.5">
                  {roots.map((task) => renderTask(task))}
                </ul>
              </section>
              {/* The section heading has no counterpart in this column, so the
                  panel is pushed down by its height (text-sm line box + mb-2)
                  to sit level with the first task rather than the title. */}
              <div className="lg:col-start-2 lg:pt-[1.75rem]">
                <ShareSupplyPanel items={groupTasks} />
              </div>
            </Fragment>
          );
        })}
        {allTasks.length === 0 && (
          <p className="text-sm text-zinc-500 lg:col-start-1">
            This project has no tasks yet.
          </p>
        )}
        {/* Grand total, kept in view: sticks to the bottom of the viewport
            while scrolling the list, then settles at the end. Only rendered
            when there are supplies to total, so a project without any does not
            show an empty bar. */}
        {hasSupplies(allTasks as SupplyLike[]) && (
          <div className="sticky bottom-0 z-10 -mx-5 mt-2 border-t border-zinc-800 bg-zinc-950/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:col-start-2 lg:mx-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <SupplyTotal
              items={allTasks}
              label="Supplies total"
              variant="total"
            />
          </div>
        )}
      </div>
      )}
    </Shell>
  );
}
