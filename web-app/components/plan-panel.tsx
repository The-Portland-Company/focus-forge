"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Plan, PlanOwnerType } from "@/lib/types";

// A Plan is a plan.md document attached to exactly ONE entity (org/project/
// goal/section). This panel is self-contained: it loads, creates, edits,
// deletes, exports (Markdown + JSON), and AI-reviews the plans for one owner.

const OWNER_LABEL: Record<PlanOwnerType, string> = {
  organization: "organization",
  project: "project",
  goal: "goal",
  section: "task list",
};

const OWNER_KEY: Record<PlanOwnerType, keyof Plan> = {
  organization: "organizationId",
  project: "projectId",
  goal: "goalId",
  section: "sectionId",
};

function planToJson(plan: Plan, ownerType: PlanOwnerType, ownerId: string) {
  return JSON.stringify(
    {
      id: plan.id,
      name: plan.name,
      owner: { type: ownerType, id: ownerId },
      contentMarkdown: plan.contentMarkdown,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    null,
    2,
  );
}

function downloadFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "plan"
  );
}

export function PlanPanel({
  ownerType,
  ownerId,
  className,
}: {
  ownerType: PlanOwnerType;
  ownerId: string;
  className?: string;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/plans?ownerType=${ownerType}&ownerId=${encodeURIComponent(ownerId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPlans(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? It can be restored from Trash.`))
      return;
    setPlans((prev) => prev.filter((p) => p.id !== plan.id));
    try {
      const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      void load();
    }
  };

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <FileText className="h-4 w-4 text-theme" />
          Plans
          <span className="text-xs font-normal text-zinc-500">
            for this {OWNER_LABEL[ownerType]}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-theme transition-colors hover:bg-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          New plan
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </div>
      ) : plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
          No plans yet. Create a plan.md for AI agents and yourself.
        </p>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              ownerType={ownerType}
              ownerId={ownerId}
              onEdit={() => setEditing(plan)}
              onDelete={() => handleDelete(plan)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <PlanEditorModal
          plan={editing === "new" ? null : editing}
          ownerType={ownerType}
          ownerId={ownerId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function PlanRow({
  plan,
  ownerType,
  ownerId,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  ownerType: PlanOwnerType;
  ownerId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState<"md" | "json" | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const copy = async (kind: "md" | "json") => {
    const text =
      kind === "md" ? plan.contentMarkdown : planToJson(plan, ownerType, ownerId);
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  const runReview = async () => {
    setReviewing(true);
    setReviewError(null);
    setReview(null);
    try {
      const res = await fetch(`/api/plans/${plan.id}/review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setReview(data.review);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "AI review failed");
    } finally {
      setReviewing(false);
    }
  };

  const base = slugify(plan.name);

  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white hover:text-theme"
          title={plan.name}
        >
          {plan.name}
        </button>
        <div className="flex items-center gap-1 text-zinc-400">
          <IconBtn label="Edit" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label="Copy Markdown"
            onClick={() => copy("md")}
            active={copied === "md"}
          >
            {copied === "md" ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </IconBtn>
          <IconBtn
            label="Copy JSON"
            onClick={() => copy("json")}
            active={copied === "json"}
          >
            <span className="text-[10px] font-bold">
              {copied === "json" ? "✓" : "{}"}
            </span>
          </IconBtn>
          <IconBtn
            label="Download .md"
            onClick={() =>
              downloadFile(`${base}.md`, plan.contentMarkdown, "text/markdown")
            }
          >
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label="Download .json"
            onClick={() =>
              downloadFile(
                `${base}.json`,
                planToJson(plan, ownerType, ownerId),
                "application/json",
              )
            }
          >
            <span className="text-[10px] font-bold">⤓{"{}"}</span>
          </IconBtn>
          <IconBtn label="AI review" onClick={runReview} disabled={reviewing}>
            {reviewing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </IconBtn>
          <IconBtn label="Delete" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-red-400/80" />
          </IconBtn>
        </div>
      </div>

      {reviewError && (
        <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {reviewError}
        </div>
      )}
      {review && (
        <div className="mt-2 rounded border border-theme/30 bg-zinc-950/60 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-theme">AI review</span>
            <button
              type="button"
              onClick={() => setReview(null)}
              className="text-zinc-500 hover:text-white"
              aria-label="Dismiss review"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">
            {review}
          </pre>
        </div>
      )}
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50 ${
        active ? "text-green-400" : ""
      }`}
    >
      {children}
    </button>
  );
}

function PlanEditorModal({
  plan,
  ownerType,
  ownerId,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  ownerType: PlanOwnerType;
  ownerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [content, setContent] = useState(plan?.contentMarkdown ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerBody = useMemo(
    () => ({ [OWNER_KEY[ownerType]]: ownerId }),
    [ownerType, ownerId],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = plan
        ? await fetch(`/api/plans/${plan.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed, contentMarkdown: content }),
          })
        : await fetch(`/api/plans`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: trimmed,
              contentMarkdown: content,
              ...ownerBody,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save plan");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {plan ? "Edit Plan" : "New Plan"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 transition-colors hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Plan name"
                className="w-full rounded bg-zinc-800 px-3 py-2 text-white transition-all focus:outline-none focus:ring-2 ring-theme"
                autoFocus
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-2 block text-sm font-medium text-zinc-400">
                plan.md (Markdown)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"# Plan\n\n## Objective\n\n## Steps\n1. …"}
                className="min-h-[300px] flex-1 resize-none rounded bg-zinc-800 px-3 py-2 font-mono text-sm text-white transition-all focus:outline-none focus:ring-2 ring-theme"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="btn-theme-primary flex items-center gap-2 rounded-lg px-4 py-2 text-white transition-all disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {plan ? "Save Changes" : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
