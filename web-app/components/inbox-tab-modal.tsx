"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import {
  MAX_AI_INTENT_PROMPT_LENGTH,
  INBOX_TAB_FIELD_OPTIONS,
  INBOX_TAB_OPERATOR_OPTIONS,
  type EmailInboxTab,
  type InboxTabCondition,
} from "@/lib/email-inbox/inbox-tabs";

interface InboxTabModalProps {
  isOpen: boolean;
  tab: EmailInboxTab | null; // null = create
  onClose: () => void;
  onSaved: (tab: EmailInboxTab) => void;
  onDeleted?: (tabId: string) => void;
}

const CLASSIFICATIONS = [
  "actionable",
  "transactional",
  "newsletter",
  "reference",
  "waiting",
  "spam",
  "unknown",
];

export function InboxTabModal({
  isOpen,
  tab,
  onClose,
  onSaved,
  onDeleted,
}: InboxTabModalProps) {
  const [name, setName] = useState("");
  const [matchMode, setMatchMode] = useState<"all" | "any">("any");
  const [conditions, setConditions] = useState<InboxTabCondition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(tab?.name ?? "");
    setMatchMode(tab?.rules?.matchMode ?? "any");
    setConditions(
      tab?.rules?.conditions?.length
        ? tab.rules.conditions
        : [{ field: "subject", operator: "contains", value: "" }],
    );
    setError(null);
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const update = (i: number, patch: Partial<InboxTabCondition>) =>
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );

  const save = async () => {
    if (!name.trim()) {
      setError("Give the tab a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rules = {
        matchMode,
        conditions: conditions.filter(
          (c) => c.field === "known_contact" || c.value.trim(),
        ),
      };
      const res = await fetch(
        tab ? `/api/email/inbox-tabs/${tab.id}` : "/api/email/inbox-tabs",
        {
          method: tab ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name.trim(), rules }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save tab");
      onSaved(data.tab);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tab");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tab) return;
    if (!confirm(`Delete the "${tab.name}" tab?`)) return;
    await fetch(`/api/email/inbox-tabs/${tab.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    onDeleted?.(tab.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">
            {tab ? "Edit tab" : "New tab"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Tab name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Receipts"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-300">
            Match
            <select
              value={matchMode}
              onChange={(e) => setMatchMode(e.target.value as "all" | "any")}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white"
            >
              <option value="any">any</option>
              <option value="all">all</option>
            </select>
            of these rules:
          </div>

          <div className="space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={c.field}
                  onChange={(e) =>
                    update(i, { field: e.target.value as any })
                  }
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                >
                  {INBOX_TAB_FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {c.field === "known_contact" ? (
                  <span className="flex-1 px-2 text-xs text-zinc-500">
                    sender is a saved contact
                  </span>
                ) : c.field === "ai_intent" ? (
                  // Free-text question answered by the AI, once per email.
                  <input
                    value={c.value}
                    onChange={(e) =>
                      update(i, { operator: "matches", value: e.target.value })
                    }
                    maxLength={MAX_AI_INTENT_PROMPT_LENGTH}
                    placeholder="the email is about a client invoice"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                  />
                ) : c.field === "classification" ? (
                  <select
                    value={c.value}
                    onChange={(e) =>
                      update(i, { operator: "is", value: e.target.value })
                    }
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Choose…</option>
                    {CLASSIFICATIONS.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      value={c.operator}
                      onChange={(e) =>
                        update(i, { operator: e.target.value as any })
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                    >
                      {INBOX_TAB_OPERATOR_OPTIONS.filter(
                        (o) => o.value !== "is",
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={c.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                      placeholder="value"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setConditions((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-300"
                  aria-label="Remove rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setConditions((prev) => [
                  ...prev,
                  { field: "subject", operator: "contains", value: "" },
                ])
              }
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add rule
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-5 py-4">
          {tab && !tab.isDefault ? (
            <button
              onClick={remove}
              className="text-sm text-rose-400 hover:text-rose-300"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
