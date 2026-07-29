"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Pencil, X } from "lucide-react";
import {
  INBOX_TAB_FIELD_OPTIONS,
  INBOX_TAB_OPERATOR_OPTIONS,
  conditionMatchesItem,
  deriveTabConditionForItem,
  type EmailInboxTab,
  type InboxTabCondition,
} from "@/lib/email-inbox/inbox-tabs";
import type { InboxItem } from "@/lib/types";

const CLASSIFICATIONS = [
  "actionable",
  "transactional",
  "newsletter",
  "reference",
  "waiting",
  "spam",
  "unknown",
];

interface DragToTabModalProps {
  item: InboxItem;
  sourceTab: EmailInboxTab | null;
  targetTab: EmailInboxTab;
  /** All tabs, used to detect overlapping rules that already match this item. */
  allTabs: EmailInboxTab[];
  onClose: () => void;
  onSaved: (tab: EmailInboxTab) => void;
  /** Open the full tab editor for an overlapping tab so the user can expand or
   *  narrow its rule. */
  onEditTab: (tab: EmailInboxTab) => void;
}

/**
 * Confirmation step for "drag an email onto a tab". Proposes a rule (editable)
 * that will file this sender under the target tab, surfaces any existing tab
 * rule that already matches the same item (overlap), and lets the user either
 * create the rule anyway or jump to edit the overlapping rule instead.
 */
export function DragToTabModal({
  item,
  sourceTab,
  targetTab,
  allTabs,
  onClose,
  onSaved,
  onEditTab,
}: DragToTabModalProps) {
  const initial = useMemo(
    () =>
      deriveTabConditionForItem(item) ?? {
        field: "sender_email" as const,
        operator: "equals" as const,
        value: "",
      },
    [item],
  );
  const [condition, setCondition] = useState<InboxTabCondition>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing conditions (across ALL tabs) that already match this item.
  const overlaps = useMemo(() => {
    const out: { tab: EmailInboxTab; condition: InboxTabCondition }[] = [];
    for (const tab of allTabs) {
      for (const cond of tab.rules?.conditions || []) {
        if (conditionMatchesItem(item, cond)) {
          out.push({ tab, condition: cond });
        }
      }
    }
    return out;
  }, [allTabs, item]);

  const update = (patch: Partial<InboxTabCondition>) =>
    setCondition((c) => ({ ...c, ...patch }));

  const describeCondition = (c: InboxTabCondition) => {
    const field =
      INBOX_TAB_FIELD_OPTIONS.find((o) => o.value === c.field)?.label ?? c.field;
    if (c.field === "known_contact") return field;
    const op =
      INBOX_TAB_OPERATOR_OPTIONS.find((o) => o.value === c.operator)?.label ??
      c.operator;
    return `${field} ${op} "${c.value}"`;
  };

  const save = async () => {
    if (condition.field !== "known_contact" && !condition.value.trim()) {
      setError("Give the rule a value.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const existing = targetTab.rules?.conditions || [];
      const alreadyPresent = existing.some(
        (c) =>
          c.field === condition.field &&
          c.operator === condition.operator &&
          c.value.trim().toLowerCase() === condition.value.trim().toLowerCase(),
      );
      const conditions = alreadyPresent
        ? existing
        : [...existing, { ...condition, value: condition.value.trim() }];
      const res = await fetch(`/api/email/inbox-tabs/${targetTab.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rules: {
            matchMode: targetTab.rules?.matchMode ?? "any",
            conditions,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save rule");
      onSaved(data.tab);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const isClassification = condition.field === "classification";
  const isKnownContact = condition.field === "known_contact";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-zinc-400">{sourceTab?.name ?? "Inbox"}</span>
            <ArrowRight className="h-4 w-4 text-zinc-500" />
            <span>{targetTab.name}</span>
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
          <p className="text-sm text-zinc-400">
            This creates a rule so this email — and future mail like it — files
            under <span className="text-zinc-200">{targetTab.name}</span>.
            Verify the rule before it runs.
          </p>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Rule to create
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={condition.field}
                onChange={(e) =>
                  update({
                    field: e.target.value as InboxTabCondition["field"],
                    operator:
                      e.target.value === "classification" ||
                      e.target.value === "known_contact"
                        ? "is"
                        : condition.operator,
                    value: "",
                  })
                }
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
              >
                {INBOX_TAB_FIELD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {isKnownContact ? (
                <span className="px-2 text-xs text-zinc-500">
                  sender is a saved contact
                </span>
              ) : isClassification ? (
                <select
                  value={condition.value}
                  onChange={(e) =>
                    update({ operator: "is", value: e.target.value })
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
                    value={condition.operator}
                    onChange={(e) =>
                      update({
                        operator: e.target
                          .value as InboxTabCondition["operator"],
                      })
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
                    value={condition.value}
                    onChange={(e) => update({ value: e.target.value })}
                    placeholder="value"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                  />
                </>
              )}
            </div>
          </div>

          {overlaps.length > 0 ? (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                This email already matches {overlaps.length} existing rule
                {overlaps.length === 1 ? "" : "s"}
              </div>
              <p className="mb-2 text-xs text-amber-200/80">
                It will show under those tabs too. Expand or narrow one of them,
                or just create the separate rule above.
              </p>
              <div className="space-y-1.5">
                {overlaps.map(({ tab, condition: c }, i) => (
                  <div
                    key={`${tab.id}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-900/50 bg-zinc-950/50 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate text-xs text-zinc-300">
                      <span className="font-medium text-zinc-100">
                        {tab.name}
                      </span>{" "}
                      — {describeCondition(c)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditTab(tab)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit rule
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
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
            {saving ? "Creating…" : "Create rule & move"}
          </button>
        </div>
      </div>
    </div>
  );
}
