import { cookies } from "next/headers";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  isShareActive,
  isValidShareCookie,
  shareCookieName,
} from "@/lib/project-share";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { hasRichTextContent } from "@/lib/rich-text";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-5 py-10">{children}</div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        Shared via Focus Forge
      </footer>
    </div>
  );
}

function Unavailable() {
  return (
    <Shell>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
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
  } | null = null;

  let admin: ReturnType<typeof getAdminClient>;
  try {
    admin = getAdminClient();
    // Cap wait — hung PostgREST must not leave the public share route open forever.
    const query = admin
      .from("project_shares")
      .select("id,project_id,passcode_hash,revoked_at,expires_at,allow_public")
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
        .select("id,name,completed,section_id,todoist_order,parent_id")
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
  }>;

  const tasksBySection = (sectionId: string | null) =>
    allTasks.filter((t) => (t.section_id || null) === sectionId);

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
        <h1 className="text-2xl font-bold text-white">{project.name}</h1>
        {project.goal && (
          <p className="mt-2 text-sm text-zinc-400">{project.goal}</p>
        )}
        {hasRichTextContent(project.description || "") && (
          <div className="mt-4 text-sm text-zinc-300">
            <RichTextContent html={project.description || ""} />
          </div>
        )}
      </header>

      <div className="space-y-6">
        {groups.map((group) => {
          const groupTasks = tasksBySection(group.id);
          if (groupTasks.length === 0) return null;
          return (
            <section key={group.id ?? "no-section"}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {group.name}
              </h2>
              <ul className="space-y-1.5">
                {groupTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
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
                      {task.name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {allTasks.length === 0 && (
          <p className="text-sm text-zinc-500">
            This project has no tasks yet.
          </p>
        )}
      </div>
    </Shell>
  );
}
