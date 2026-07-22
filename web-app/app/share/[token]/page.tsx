import { cookies } from "next/headers";
import { Lock } from "lucide-react";
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
import { ShareCollapsibleView } from "@/components/share-collapsible-view";

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
  let onHandSupplies: Array<{
    id: string;
    name: string;
    quantity: number | string | null;
    unit: string | null;
    note: string | null;
    section_id: string | null;
    task_id: string | null;
    order_index: number | null;
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

    const [sectionRes, taskRes, onHandRes] = await Promise.all([
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
      (admin as any)
        .from("on_hand_supplies")
        .select("id,name,quantity,unit,note,section_id,task_id,order_index")
        .eq("project_id", project.id)
        .order("order_index", { ascending: true }),
    ]);
    sections = sectionRes.data;
    tasks = taskRes.data;
    onHandSupplies = (onHandRes.data || []) as any;
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
        // Read-only: collapsible view. Everything starts collapsed with an
        // expand/collapse-all control and per-section / per-task toggles.
        <ShareCollapsibleView
          groups={groups}
          tasks={allTasks}
          onHandSupplies={(onHandSupplies || []).map((s) => ({
            id: s.id,
            name: s.name,
            quantity: s.quantity == null ? null : Number(s.quantity),
            unit: s.unit,
            note: s.note,
            sectionId: s.section_id,
            taskId: s.task_id,
          }))}
          sectionNames={Object.fromEntries(
            (sections || []).map((s) => [s.id, s.name]),
          )}
          taskNames={Object.fromEntries(
            allTasks.map((t) => [t.id, t.name]),
          )}
        />
      )}
    </Shell>
  );
}
