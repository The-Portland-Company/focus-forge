"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckSquare,
  FolderKanban,
  History,
  ListTodo,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type TrashRow = Record<string, any>;

type TrashPayload = {
  organizations: TrashRow[];
  projects: TrashRow[];
  sections: TrashRow[];
  tasks: TrashRow[];
};

type EntityType = "organization" | "project" | "section" | "task";

type TrashBatch = {
  batchId: string;
  deletedAt: string;
  root: { type: EntityType; row: TrashRow };
  counts: Record<EntityType, number>;
  totalItems: number;
};

const TYPE_ORDER: EntityType[] = ["organization", "project", "section", "task"];

const TYPE_ICON: Record<EntityType, typeof Building2> = {
  organization: Building2,
  project: FolderKanban,
  section: ListTodo,
  task: CheckSquare,
};

function buildBatches(payload: TrashPayload): TrashBatch[] {
  const byBatch = new Map<string, Partial<Record<EntityType, TrashRow[]>>>();

  const add = (type: EntityType, rows: TrashRow[]) => {
    for (const row of rows) {
      const batchId = row.delete_batch_id || `solo-${row.id}`;
      const bucket = byBatch.get(batchId) || {};
      bucket[type] = [...(bucket[type] || []), row];
      byBatch.set(batchId, bucket);
    }
  };

  add("organization", payload.organizations);
  add("project", payload.projects);
  add("section", payload.sections);
  add("task", payload.tasks);

  const batches: TrashBatch[] = [];
  for (const [batchId, bucket] of byBatch) {
    let root: TrashBatch["root"] | null = null;
    const counts = {
      organization: 0,
      project: 0,
      section: 0,
      task: 0,
    } as Record<EntityType, number>;
    let totalItems = 0;
    let deletedAt = "";

    for (const type of TYPE_ORDER) {
      const rows = bucket[type] || [];
      counts[type] = rows.length;
      totalItems += rows.length;
      if (!root && rows.length > 0) {
        // Highest entity type in hierarchy is the batch root. For tasks,
        // prefer the row with no parent in the same batch (subtask cascades).
        let rootRow = rows[0];
        if (type === "task" && rows.length > 1) {
          const ids = new Set(rows.map((row) => row.id));
          rootRow = rows.find((row) => !row.parent_id || !ids.has(row.parent_id)) || rows[0];
        }
        root = { type, row: rootRow };
        deletedAt = rootRow.deleted_at;
      }
    }

    if (root) {
      batches.push({ batchId, deletedAt, root, counts, totalItems });
    }
  }

  return batches.sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
  );
}

function describeContents(batch: TrashBatch): string {
  const parts: string[] = [];
  const labels: Record<EntityType, [string, string]> = {
    organization: ["organization", "organizations"],
    project: ["project", "projects"],
    section: ["task list", "task lists"],
    task: ["task", "tasks"],
  };
  for (const type of TYPE_ORDER) {
    const count = batch.counts[type];
    if (count > 0) {
      parts.push(`${count} ${labels[type][count === 1 ? 0 : 1]}`);
    }
  }
  return parts.join(", ");
}

export default function TrashPage() {
  const [trash, setTrash] = useState<TrashPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashBatch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    try {
      const response = await fetch("/api/trash", { credentials: "include" });
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => null))?.error ||
            "Failed to load trash",
        );
      }
      setTrash(await response.json());
      setError(null);
    } catch (fetchError: any) {
      setError(fetchError.message);
    }
  }, []);

  useEffect(() => {
    void fetchTrash();
  }, [fetchTrash]);

  const batches = useMemo(
    () => (trash ? buildBatches(trash) : []),
    [trash],
  );

  const handleRestore = async (batch: TrashBatch) => {
    if (batch.batchId.startsWith("solo-")) return;
    setBusyBatch(batch.batchId);
    setNotice(null);
    try {
      const response = await fetch("/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batchId: batch.batchId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Restore failed");
      }
      setNotice(
        `Restored ${payload?.restored ?? batch.totalItems} item(s) from “${batch.root.row.name}”.`,
      );
      await fetchTrash();
    } catch (restoreError: any) {
      setError(restoreError.message);
    } finally {
      setBusyBatch(null);
    }
  };

  const handlePurge = async (batch: TrashBatch) => {
    setBusyBatch(batch.batchId);
    setNotice(null);
    try {
      const response = await fetch("/api/trash/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entityType: batch.root.type,
          entityId: batch.root.row.id,
          confirm: true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Permanent delete failed");
      }
      setNotice(`Permanently deleted “${batch.root.row.name}”.`);
      setPurgeTarget(null);
      await fetchTrash();
    } catch (purgeError: any) {
      setError(purgeError.message);
    } finally {
      setBusyBatch(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/today"
            className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Trash2 className="h-5 w-5 text-zinc-400" />
            Trash
          </h1>
        </div>

        <p className="mb-4 flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Deleted organizations, projects, task lists, and tasks are kept here.
          Restore brings everything back exactly as it was — including all
          nested items deleted with it. Permanently Delete cannot be undone.
        </p>

        {notice && (
          <p className="mb-4 rounded-lg border border-green-900/60 bg-green-950/40 px-3 py-2 text-sm text-green-300">
            {notice}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {trash === null && !error && (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 shrink-0 rounded" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                  <Skeleton className="h-3 w-56" />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Skeleton className="h-7 w-20 rounded-md" />
                  <Skeleton className="h-7 w-36 rounded-md" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {trash !== null && batches.length === 0 && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-8 text-center text-sm text-zinc-500">
            Trash is empty.
          </p>
        )}

        <ul className="space-y-2">
          {batches.map((batch) => {
            const Icon = TYPE_ICON[batch.root.type];
            const busy = busyBatch === batch.batchId;
            return (
              <li
                key={batch.batchId}
                className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid="trash-batch"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="truncate font-medium">
                      {batch.root.row.name || "(unnamed)"}
                    </span>
                    <span className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                      {batch.root.type === "section"
                        ? "task list"
                        : batch.root.type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {describeContents(batch)} · deleted{" "}
                    {batch.deletedAt
                      ? format(new Date(batch.deletedAt), "MMM d, yyyy h:mm a")
                      : "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => void handleRestore(batch)}
                    disabled={busy || batch.batchId.startsWith("solo-")}
                    className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                    data-testid="restore-button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                  <button
                    onClick={() => setPurgeTarget(batch)}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                    data-testid="purge-button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Permanently Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {purgeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Permanently delete?
              </h2>
              <p className="mb-4 text-sm text-zinc-400">
                “{purgeTarget.root.row.name}” and everything inside it (
                {describeContents(purgeTarget)}) will be erased forever. This
                cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setPurgeTarget(null)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handlePurge(purgeTarget)}
                  disabled={busyBatch === purgeTarget.batchId}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  data-testid="confirm-purge"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
