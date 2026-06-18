"use client";

import { useCallback, useEffect, useState } from "react";
import { EstimateReviewModal } from "@/components/estimate-review-modal";
import {
  EstimateHelpButton,
  EstimateHelpModal,
} from "@/components/estimate-help-modal";
import { Hourglass, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserProfile } from "@/lib/supabase/hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface PreviewTask {
  id: string;
  name: string;
  priority?: number | null;
  dueDate?: string | null;
  projectName?: string | null;
  organizationName?: string | null;
}

interface CalibrationExample {
  id: string;
  taskName: string;
  taskDescription?: string | null;
  projectName?: string | null;
  aiSuggestedMinutes?: number | null;
  aiConfidence?: string | null;
  acceptedMinutes: number;
  source?: string | null;
  createdAt: string;
}

/** Editor state for the add/edit example modal. `id` null = creating. */
interface ExampleDraft {
  id: string | null;
  taskName: string;
  taskDescription: string;
  projectName: string;
  acceptedMinutes: string;
}

const PRIORITY_DOT: Record<number, string> = {
  1: "bg-red-400",
  2: "bg-orange-400",
  3: "bg-blue-400",
  4: "bg-zinc-500",
};

type Tab = "queue" | "rules";

export function EstimatesView() {
  const [total, setTotal] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [examples, setExamples] = useState<CalibrationExample[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [editor, setEditor] = useState<ExampleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const { profile, updateProfile } = useUserProfile();
  const [contributing, setContributing] = useState(false);

  useEffect(() => {
    if (profile) setContributing(Boolean(profile.contributes_training_data));
  }, [profile]);

  const toggleContribute = useCallback(
    async (next: boolean) => {
      setContributing(next); // optimistic
      const res = await updateProfile?.({ contributes_training_data: next });
      if (res?.error) setContributing((prev) => !prev); // revert on failure
    },
    [updateProfile],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/unestimated?limit=50", {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setTotal(json.total ?? 0);
        setPreview(json.tasks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExamples = useCallback(async () => {
    setExamplesLoading(true);
    try {
      const res = await fetch("/api/tasks/estimate/examples?limit=100", {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setExamples(json.examples ?? []);
      }
    } finally {
      setExamplesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "rules") loadExamples();
  }, [tab, loadExamples]);

  const deleteExample = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/tasks/estimate/examples?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) setExamples((rows) => rows.filter((r) => r.id !== id));
    },
    [],
  );

  const openCreate = useCallback(() => {
    setEditorError(null);
    setEditor({
      id: null,
      taskName: "",
      taskDescription: "",
      projectName: "",
      acceptedMinutes: "",
    });
  }, []);

  const openEdit = useCallback((ex: CalibrationExample) => {
    setEditorError(null);
    setEditor({
      id: ex.id,
      taskName: ex.taskName,
      taskDescription: ex.taskDescription ?? "",
      projectName: ex.projectName ?? "",
      acceptedMinutes: String(ex.acceptedMinutes),
    });
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editor) return;
    const name = editor.taskName.trim();
    const minutes = Number(editor.acceptedMinutes);
    if (!name) {
      setEditorError("Task name is required.");
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) {
      setEditorError("Minutes must be a number between 1 and 480.");
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const payload = {
        taskName: name,
        taskDescription: editor.taskDescription.trim() || null,
        projectName: editor.projectName.trim() || null,
        acceptedMinutes: Math.round(minutes),
      };
      const res = await fetch(
        editor.id
          ? `/api/tasks/estimate/examples?id=${editor.id}`
          : "/api/tasks/estimate/examples",
        {
          method: editor.id ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Save failed (${res.status})`);
      }
      const { example } = (await res.json()) as { example: CalibrationExample };
      setExamples((rows) => {
        const without = rows.filter((r) => r.id !== example.id);
        return [example, ...without].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
      setEditor(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [editor]);

  return (
    <div className="text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <Hourglass className="w-4 h-4" /> Estimates
            <EstimateHelpButton onClick={() => setHelpOpen(true)} />
          </div>
          <h1 className="text-2xl text-white font-semibold">
            {total == null
              ? "Estimate review"
              : total === 0
                ? "All caught up"
                : `${total} task${total === 1 ? "" : "s"} need an estimate`}
          </h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-prose">
            The AI suggests a duration for each task and you confirm with one
            click. Every confirmation calibrates the model to your pace, so
            future suggestions get sharper.
          </p>
        </div>
        <button
          type="button"
          disabled={!total}
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-theme-gradient text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
        >
          <Play className="w-4 h-4" /> Start review
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 mb-6">
        <button
          type="button"
          onClick={() => setTab("queue")}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
            tab === "queue"
              ? "border-[rgb(var(--theme-primary-rgb))] text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Queue
        </button>
        <button
          type="button"
          onClick={() => setTab("rules")}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
            tab === "rules"
              ? "border-[rgb(var(--theme-primary-rgb))] text-white"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          AI Rules
        </button>
      </div>

      {tab === "queue" ? (
        loading && preview.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Task</th>
                  <th className="text-left px-4 py-2">Project</th>
                  <th className="text-left px-4 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-2 h-2 rounded-full" />
                        <Skeleton className="h-4 w-48" />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-4 w-12" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : preview.length === 0 ? (
          <div className="py-16 text-center text-zinc-400">
            <Sparkles className="w-6 h-6 mx-auto mb-3 text-zinc-500" />
            Nothing left to estimate. New tasks will appear here automatically.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Task</th>
                  <th className="text-left px-4 py-2">Project</th>
                  <th className="text-left px-4 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900/40"
                  >
                    <td className="px-4 py-2 text-zinc-200">
                      <span className="inline-flex items-center gap-2">
                        {t.priority != null && (
                          <span
                            className={`w-2 h-2 rounded-full ${
                              PRIORITY_DOT[t.priority] ?? "bg-zinc-500"
                            }`}
                          />
                        )}
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-400">
                      {t.organizationName ? `${t.organizationName} · ` : ""}
                      {t.projectName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <p className="text-xs text-zinc-500 max-w-prose">
              These are AI calibration rules — one is recorded each time you
              approve an estimate, and you can add or edit your own. They&rsquo;re
              replayed to the AI as examples of your pace (and are the training
              set for your model), so future suggestions match how long things
              actually take you. They are private to your account.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="shrink-0 inline-flex items-center gap-2 rounded-md border border-zinc-700 text-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-800"
            >
              <Plus className="w-4 h-4" /> Add example
            </button>
          </div>

          <label className="mb-6 flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={contributing}
              onChange={(e) => toggleContribute(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--theme-primary-rgb))]"
            />
            <span className="text-xs text-zinc-400">
              <span className="text-zinc-200 font-medium">
                Help improve the shared estimator model.
              </span>{" "}
              When on, your approved examples may be included (pooled with other
              opted-in users) to train Focus Forge&rsquo;s shared fine-tuned
              estimator. Your examples remain private to your account either way —
              this only controls whether they contribute to the shared model. You
              can turn it off anytime.
            </span>
          </label>
          {examplesLoading && examples.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Task</th>
                    <th className="text-left px-4 py-2">Project</th>
                    <th className="text-right px-4 py-2">AI suggested</th>
                    <th className="text-right px-4 py-2">You approved</th>
                    <th className="text-left px-4 py-2">When</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-zinc-800">
                      <td className="px-4 py-2"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-12 ml-auto" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-10 ml-auto" /></td>
                      <td className="px-4 py-2"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-4 w-4 ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : examples.length === 0 ? (
            <div className="py-16 text-center text-zinc-400">
              <Sparkles className="w-6 h-6 mx-auto mb-3 text-zinc-500" />
              No rules yet. Approve estimates in a review session and
              they&rsquo;ll appear here.
            </div>
          ) : (
            <div className="relative rounded-lg border border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="sticky left-0 z-10 bg-zinc-900 text-left px-4 py-2">Task</th>
                    <th className="text-left px-4 py-2">Project</th>
                    <th className="text-right px-4 py-2">AI suggested</th>
                    <th className="text-right px-4 py-2">You approved</th>
                    <th className="text-left px-4 py-2">When</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {examples.map((ex) => (
                    <tr
                      key={ex.id}
                      className="border-t border-zinc-800 hover:bg-zinc-900/40"
                    >
                      <td className="sticky left-0 z-10 bg-zinc-950 px-4 py-2 text-zinc-200">{ex.taskName}</td>
                      <td className="px-4 py-2 text-zinc-400">
                        {ex.projectName ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-400">
                        {ex.aiSuggestedMinutes != null
                          ? `${ex.aiSuggestedMinutes}m`
                          : "—"}
                        {ex.aiConfidence ? (
                          <span className="text-zinc-600"> · {ex.aiConfidence}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-200 font-medium">
                        {ex.acceptedMinutes}m
                      </td>
                      <td className="px-4 py-2 text-zinc-500">
                        {new Date(ex.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(ex)}
                          className="text-zinc-600 hover:text-zinc-200 p-1"
                          title="Edit this example"
                          aria-label={`Edit rule for ${ex.taskName}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteExample(ex.id)}
                          className="text-zinc-600 hover:text-red-400 p-1"
                          title="Remove from AI training"
                          aria-label={`Delete rule for ${ex.taskName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-zinc-950 to-transparent"
              />
            </div>
          )}
        </div>
      )}

      <EstimateReviewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCompleted={() => {
          setModalOpen(false);
          load();
          if (tab === "rules") loadExamples();
        }}
        batchSize={20}
      />

      <EstimateHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? "Edit example" : "Add training example"}
            </DialogTitle>
            <DialogDescription>
              Teach the estimator how long a kind of task takes you. This example
              is private to your account.
            </DialogDescription>
          </DialogHeader>

          {editor ? (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Task name
                </label>
                <input
                  type="text"
                  value={editor.taskName}
                  onChange={(e) =>
                    setEditor({ ...editor, taskName: e.target.value })
                  }
                  placeholder="e.g. Draft a customer outreach email"
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgb(var(--theme-primary-rgb))]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Project (optional)
                  </label>
                  <input
                    type="text"
                    value={editor.projectName}
                    onChange={(e) =>
                      setEditor({ ...editor, projectName: e.target.value })
                    }
                    placeholder="e.g. Marketing"
                    className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgb(var(--theme-primary-rgb))]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Minutes (1–480)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={editor.acceptedMinutes}
                    onChange={(e) =>
                      setEditor({ ...editor, acceptedMinutes: e.target.value })
                    }
                    placeholder="30"
                    className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgb(var(--theme-primary-rgb))]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Description / notes (optional)
                </label>
                <textarea
                  value={editor.taskDescription}
                  onChange={(e) =>
                    setEditor({ ...editor, taskDescription: e.target.value })
                  }
                  rows={3}
                  placeholder="Any context that affects how long it takes…"
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgb(var(--theme-primary-rgb))]"
                />
              </div>
              {editorError ? (
                <p className="text-sm text-red-400">{editorError}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditor(null)}
              className="rounded-md px-4 py-2 text-sm text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEditor}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-theme-gradient text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : editor?.id ? "Save changes" : "Add example"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
