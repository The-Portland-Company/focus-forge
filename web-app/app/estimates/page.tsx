"use client";

import { useCallback, useEffect, useState } from "react";
import { EstimateReviewModal } from "@/components/estimate-review-modal";
import { Hourglass, Play, Sparkles, Loader2 } from "lucide-react";

interface PreviewTask {
  id: string;
  name: string;
  priority?: number | null;
  dueDate?: string | null;
  projectName?: string | null;
  organizationName?: string | null;
}

const PRIORITY_DOT: Record<number, string> = {
  1: "bg-red-400",
  2: "bg-orange-400",
  3: "bg-blue-400",
  4: "bg-zinc-500",
};

export default function EstimatesPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-zinc-400 text-sm mb-2">
            <Hourglass className="w-4 h-4" /> Estimates
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
          className="inline-flex items-center gap-2 rounded-md bg-[rgb(var(--theme-primary-rgb))] text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
        >
          <Play className="w-4 h-4" /> Start review
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
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
      )}

      <EstimateReviewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCompleted={() => {
          setModalOpen(false);
          load();
        }}
        batchSize={20}
      />
    </div>
  );
}
