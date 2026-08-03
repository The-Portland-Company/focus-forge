"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  MAX_AI_INTENT_PROMPT_LENGTH,
  INBOX_TAB_FIELD_OPTIONS,
  INBOX_TAB_OPERATOR_OPTIONS,
  conditionMatchesItem,
  deriveTabConditionForItem,
  type EmailInboxTab,
  type InboxTabCondition,
} from "@/lib/email-inbox/inbox-tabs";
import type { InboxItem } from "@/lib/types";
import {
  ModalMinimizeButton,
  useModalWindow,
} from "@/components/ui/modal-window";

const CLASSIFICATIONS = [
  "actionable",
  "transactional",
  "newsletter",
  "reference",
  "waiting",
  "spam",
  "unknown",
];

/**
 * Append newly-authored conditions to a tab's existing ones, trimming values
 * and skipping exact duplicates (case-insensitive on value). Pure so the
 * multi-condition merge can be tested without rendering the modal.
 */
export function mergeTabConditions(
  existing: InboxTabCondition[],
  added: InboxTabCondition[],
): InboxTabCondition[] {
  const next = [...existing];
  for (const condition of added) {
    const trimmed = { ...condition, value: condition.value.trim() };
    const alreadyPresent = next.some(
      (c) =>
        c.field === trimmed.field &&
        c.operator === trimmed.operator &&
        c.value.trim().toLowerCase() === trimmed.value.toLowerCase(),
    );
    if (!alreadyPresent) next.push(trimmed);
  }
  return next;
}

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
  /** Notified when an overlapping tab's rules change (delete), so the parent
   *  can keep its own tab list in sync. */
  onTabsChanged?: (tab: EmailInboxTab) => void;
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
  onTabsChanged,
}: DragToTabModalProps) {
  const modalWindow = useModalWindow({
    title: `Move to ${targetTab.name}`,
    onRequestClose: onClose,
  });
  const initial = useMemo(
    () =>
      deriveTabConditionForItem(item) ?? {
        field: "sender_email" as const,
        operator: "equals" as const,
        value: "",
      },
    [item],
  );
  // The rule being created can have several conditions; `matchMode` is the
  // and/or operator between them. It is a property of the whole tab rule set
  // (the API stores one matchMode per tab), so changing it here also changes
  // how the tab's pre-existing conditions combine — called out in the UI.
  const [conditions, setConditions] = useState<InboxTabCondition[]>([initial]);
  const [matchMode, setMatchMode] = useState<"all" | "any">(
    targetTab.rules?.matchMode ?? "any",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local editable copy of the tabs so deleting an overlapping rule updates the
  // list in place without waiting on the parent to refetch.
  const [localTabs, setLocalTabs] = useState<EmailInboxTab[]>(allTabs);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  // An overlapping rule the user chose to view in a layered modal on top.
  const [viewing, setViewing] = useState<{
    tab: EmailInboxTab;
    condition: InboxTabCondition;
  } | null>(null);

  const overlapKey = (tabId: string, c: InboxTabCondition) =>
    `${tabId}:${c.field}:${c.operator}:${c.value}`;

  // Existing conditions (across ALL tabs) that already match this item.
  const overlaps = useMemo(() => {
    const out: { tab: EmailInboxTab; condition: InboxTabCondition }[] = [];
    for (const tab of localTabs) {
      for (const cond of tab.rules?.conditions || []) {
        if (conditionMatchesItem(item, cond)) {
          out.push({ tab, condition: cond });
        }
      }
    }
    return out;
  }, [localTabs, item]);

  // Delete an overlapping rule: drop that condition from its tab and persist.
  const deleteOverlap = async (
    tab: EmailInboxTab,
    cond: InboxTabCondition,
  ) => {
    const key = overlapKey(tab.id, cond);
    setDeletingKey(key);
    try {
      const nextConditions = (tab.rules?.conditions || []).filter(
        (c) =>
          !(
            c.field === cond.field &&
            c.operator === cond.operator &&
            c.value === cond.value
          ),
      );
      const res = await fetch(`/api/email/inbox-tabs/${tab.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rules: {
            matchMode: tab.rules?.matchMode ?? "any",
            conditions: nextConditions,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete rule");
      }
      const saved = (await res.json()).tab as EmailInboxTab;
      setLocalTabs((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      onTabsChanged?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
    } finally {
      setDeletingKey(null);
    }
  };

  const update = (index: number, patch: Partial<InboxTabCondition>) =>
    setConditions((list) =>
      list.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );

  const addCondition = () =>
    setConditions((list) => [
      ...list,
      { field: "sender_domain", operator: "contains", value: "" },
    ]);

  const removeCondition = (index: number) =>
    setConditions((list) =>
      list.length === 1 ? list : list.filter((_, i) => i !== index),
    );

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
    if (
      conditions.some(
        (c) => c.field !== "known_contact" && !c.value.trim(),
      )
    ) {
      setError("Give every condition a value (or remove the empty one).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextConditions = mergeTabConditions(
        targetTab.rules?.conditions || [],
        conditions,
      );
      const res = await fetch(`/api/email/inbox-tabs/${targetTab.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rules: {
            matchMode,
            conditions: nextConditions,
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

  const existingCount = targetTab.rules?.conditions?.length ?? 0;
  const matchModeChanged = matchMode !== (targetTab.rules?.matchMode ?? "any");

  if (modalWindow.minimized) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div
        style={modalWindow.panelStyle}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
      >
        <div
          {...modalWindow.dragHandleProps}
          className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <span className="text-zinc-400">{sourceTab?.name ?? "Inbox"}</span>
            <ArrowRight className="h-4 w-4 text-zinc-500" />
            <span>{targetTab.name}</span>
          </h2>
          <div className="flex items-center gap-1">
            <ModalMinimizeButton
              onMinimize={modalWindow.minimize}
              className="p-1.5 hover:bg-zinc-800"
            />
            <button
              onClick={onClose}
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-zinc-400">
            This creates a rule so this email — and future mail like it — files
            under <span className="text-zinc-200">{targetTab.name}</span>.
            Verify the rule before it runs.
          </p>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Rule to create
              </div>
              <button
                type="button"
                onClick={addCondition}
                title="Add another condition"
                aria-label="Add another condition"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              >
                <Plus className="h-3 w-3" />
                Add condition
              </button>
            </div>
            <div className="space-y-1.5">
              {conditions.map((condition, index) => {
                const isClassification = condition.field === "classification";
                const isKnownContact = condition.field === "known_contact";
                const isAiIntent = condition.field === "ai_intent";
                return (
                  <div key={index}>
                    {index > 0 ? (
                      // Operator between conditions. One matchMode governs the
                      // whole tab, so every connector edits the same value.
                      <div className="my-1.5 flex items-center gap-2">
                        <span className="h-px flex-1 bg-zinc-800" />
                        <select
                          value={matchMode}
                          onChange={(e) =>
                            setMatchMode(e.target.value as "all" | "any")
                          }
                          aria-label="Operator between conditions"
                          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-white"
                        >
                          <option value="all">and</option>
                          <option value="any">or</option>
                        </select>
                        <span className="h-px flex-1 bg-zinc-800" />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={condition.field}
                        onChange={(e) =>
                          update(index, {
                            field: e.target.value as InboxTabCondition["field"],
                            operator:
                              e.target.value === "ai_intent"
                                ? "matches"
                                : e.target.value === "classification" ||
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
                        <span className="flex-1 px-2 text-xs text-zinc-500">
                          sender is a saved contact
                        </span>
                      ) : isAiIntent ? (
                        // Plain-English question the AI answers per email.
                        <input
                          value={condition.value}
                          onChange={(e) =>
                            update(index, {
                              operator: "matches",
                              value: e.target.value,
                            })
                          }
                          maxLength={MAX_AI_INTENT_PROMPT_LENGTH}
                          placeholder="the email is about a client invoice"
                          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                        />
                      ) : isClassification ? (
                        <select
                          value={condition.value}
                          onChange={(e) =>
                            update(index, {
                              operator: "is",
                              value: e.target.value,
                            })
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
                              update(index, {
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
                            onChange={(e) =>
                              update(index, { value: e.target.value })
                            }
                            placeholder="value"
                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                          />
                        </>
                      )}
                      {conditions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeCondition(index)}
                          title="Remove this condition"
                          aria-label="Remove this condition"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition-colors hover:border-red-800 hover:text-red-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {conditions.length > 1 || matchModeChanged ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                Email files under {targetTab.name} when{" "}
                <span className="text-zinc-300">
                  {matchMode === "all" ? "all" : "any"}
                </span>{" "}
                of its conditions match.
                {existingCount > 0 ? (
                  <>
                    {" "}
                    This tab already has {existingCount} condition
                    {existingCount === 1 ? "" : "s"}, and that and/or applies to{" "}
                    {matchModeChanged ? "them too" : "all of them"}.
                  </>
                ) : null}
              </p>
            ) : null}
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
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewing({ tab, condition: c })}
                        title="View rule"
                        aria-label="View rule"
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:text-white"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditTab(tab)}
                        title="Edit rule"
                        aria-label="Edit rule"
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:text-white"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteOverlap(tab, c)}
                        disabled={deletingKey === overlapKey(tab.id, c)}
                        title="Delete rule"
                        aria-label="Delete rule"
                        className="inline-flex items-center gap-1 rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:text-white disabled:opacity-50"
                      >
                        {deletingKey === overlapKey(tab.id, c) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </div>
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

      {viewing ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-white">
                {viewing.tab.name} — rule
              </h3>
              <button
                onClick={() => setViewing(null)}
                className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Matches{" "}
                {viewing.tab.rules?.matchMode === "all" ? "all of" : "any of"}
              </div>
              <ul className="space-y-1.5">
                {(viewing.tab.rules?.conditions || []).map((c, idx) => {
                  const isMatch =
                    c.field === viewing.condition.field &&
                    c.operator === viewing.condition.operator &&
                    c.value === viewing.condition.value;
                  return (
                    <li
                      key={idx}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        isMatch
                          ? "border-amber-700/60 bg-amber-950/30 text-amber-100"
                          : "border-zinc-800 bg-zinc-950/50 text-zinc-300"
                      }`}
                    >
                      {describeCondition(c)}
                      {isMatch ? (
                        <span className="ml-2 text-[10px] uppercase text-amber-300">
                          matches this email
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3.5">
              <button
                type="button"
                onClick={() => {
                  const tab = viewing.tab;
                  const cond = viewing.condition;
                  setViewing(null);
                  void deleteOverlap(tab, cond);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete rule
              </button>
              <button
                type="button"
                onClick={() => {
                  const tab = viewing.tab;
                  setViewing(null);
                  onEditTab(tab);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit rule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
