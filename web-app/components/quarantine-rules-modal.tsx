"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, ShieldAlert, X } from "lucide-react";
import {
  RULE_PATTERN_HELP,
  templateHasPattern,
} from "@/lib/email-inbox/rule-pattern";
import type { EmailRule, EmailRuleCondition, InboxItem } from "@/lib/types";
import {
  ModalMinimizeButton,
  useModalWindow,
} from "@/components/ui/modal-window";

const FIELD_OPTIONS: Array<{ value: EmailRuleCondition["field"]; label: string }> =
  [
    { value: "sender_email", label: "Sender email" },
    { value: "sender_domain", label: "Sender domain" },
    { value: "subject", label: "Subject" },
    { value: "body", label: "Body" },
  ];

const OPERATOR_OPTIONS: Array<{
  value: EmailRuleCondition["operator"];
  label: string;
}> = [
  { value: "equals", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "matches", label: "matches pattern" },
];

const ACTION_LABEL: Record<string, string> = {
  quarantine: "Quarantine",
  spam: "Mark as spam",
  always_delete: "Always delete",
  archive: "Archive",
  never_spam: "Never mark as spam",
  mark_read: "Mark as read",
  require_project: "Require project",
  generate_tasks: "Generate tasks",
  assign_mailbox_owner: "Assign to mailbox owner",
};

function senderEmailOf(item: InboxItem): string {
  const from = (item.participants || []).find(
    (p) => p.participantRole === "from",
  );
  return (from?.emailAddress || "").trim().toLowerCase();
}

/**
 * The value from THIS email that a given rule field should be matched against.
 *
 * Picking a field is really picking which part of the email to match on, so the
 * value box should follow it. Leaving the previous field's value behind meant
 * choosing "Subject" left a sender address sitting in the box — a rule that
 * matches nothing, one click away from being saved.
 */
export function ruleValueForField(
  item: InboxItem,
  field: EmailRuleCondition["field"],
): string {
  const sender = senderEmailOf(item);
  switch (field) {
    case "sender_email":
      return sender;
    case "sender_domain":
      return sender.split("@")[1] || "";
    case "subject":
      return item.subject || "";
    case "body":
      return (item.previewText || item.summaryText || "").trim();
    default:
      return "";
  }
}

function describeCondition(c: EmailRuleCondition): string {
  const field = FIELD_OPTIONS.find((o) => o.value === c.field)?.label ?? c.field;
  const op = OPERATOR_OPTIONS.find((o) => o.value === c.operator)?.label ??
    c.operator;
  return `${field} ${op} "${c.value}"`;
}

interface QuarantineRulesModalProps {
  item: InboxItem;
  /** All email rules, to resolve which already match this email. */
  emailRules?: EmailRule[];
  onClose: () => void;
  /**
   * Confirm the quarantine. When `rule` is provided the parent also creates it
   * (a quarantine Rule) so future mail like this is auto-quarantined.
   */
  onConfirm: (rule: {
    name: string;
    condition: EmailRuleCondition;
  } | null) => void;
  /** Open the full Rules panel to edit rules directly. */
  onEditRules?: () => void;
}

/**
 * Shown when the user quarantines an email. Lists the Rules already applied to
 * it and offers an editable "quarantine future mail like this" Rule. Saving
 * confirms the quarantine (and creates the Rule if kept); mirrors the
 * drag-to-tab verification pattern.
 */
export function QuarantineRulesModal({
  item,
  emailRules,
  onClose,
  onConfirm,
  onEditRules,
}: QuarantineRulesModalProps) {
  const modalWindow = useModalWindow({
    title: "Quarantine rules",
    onRequestClose: onClose,
  });
  const sender = senderEmailOf(item);
  const [createRule, setCreateRule] = useState(true);
  const [condition, setCondition] = useState<EmailRuleCondition>(
    sender
      ? { field: "sender_email", operator: "equals", value: sender }
      : { field: "subject", operator: "contains", value: item.subject || "" },
  );
  const [saving, setSaving] = useState(false);
  // Once the value has been typed into by hand, the dropdowns stop rewriting
  // it — auto-fill is a convenience, not something that eats your input.
  const [valueEdited, setValueEdited] = useState(false);

  // Rules already matching this email (informational).
  const matchedRules = useMemo(() => {
    const ids = new Set(item.matchedRuleIds ?? []);
    return (emailRules ?? []).filter((r) => ids.has(r.id));
  }, [emailRules, item.matchedRuleIds]);

  const update = (patch: Partial<EmailRuleCondition>) =>
    setCondition((c) => ({ ...c, ...patch }));

  const save = () => {
    setSaving(true);
    if (createRule && condition.value.trim()) {
      const label =
        condition.field === "sender_email"
          ? `Quarantine mail from ${condition.value.trim()}`
          : `Quarantine: ${describeCondition(condition)}`;
      onConfirm({
        name: label,
        condition: { ...condition, value: condition.value.trim() },
      });
    } else {
      onConfirm(null);
    }
  };

  if (modalWindow.minimized) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div
        style={{ ...modalWindow.panelStyle, position: "relative" }} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div
          {...modalWindow.dragHandleProps}
          aria-hidden
          className="absolute inset-x-0 top-0 z-0 h-12 rounded-t-xl"
        />
        <ModalMinimizeButton
          onMinimize={modalWindow.minimize}
          className="absolute right-12 top-4 z-20"
        />
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
            Quarantine this email?
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
          {/* Rules already applied */}
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Rules applied to this email
            </div>
            {matchedRules.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No rules currently match this email — quarantining is a one-off
                unless you add a rule below.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {matchedRules.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-zinc-100">
                      {r.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {r.conditions
                        .map(describeCondition)
                        .join(r.matchMode === "all" ? " and " : " or ")}
                      {" → "}
                      {r.actions
                        .map((a) => ACTION_LABEL[a.type] ?? a.type)
                        .join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Proposed quarantine rule */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                className="h-4 w-4 accent-amber-400"
              />
              Also quarantine future mail like this (create a rule)
            </label>
            {createRule ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <select
                  value={condition.field}
                  onChange={(e) => {
                    const field = e.target
                      .value as EmailRuleCondition["field"];
                    update({
                      field,
                      // Follow the field with the matching value off this email
                      // unless the box has been hand-edited.
                      ...(valueEdited
                        ? {}
                        : { value: ruleValueForField(item, field) }),
                    });
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                >
                  {FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    update({
                      operator: e.target
                        .value as EmailRuleCondition["operator"],
                      ...(valueEdited
                        ? {}
                        : {
                            value: ruleValueForField(item, condition.field),
                          }),
                    })
                  }
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                >
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  value={condition.value}
                  onChange={(e) => {
                    setValueEdited(true);
                    update({ value: e.target.value });
                  }}
                  placeholder="value"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white"
                />
              </div>
            ) : null}
            {createRule &&
            (condition.operator === "matches" ||
              templateHasPattern(condition.value)) ? (
              <p className="mt-2 text-xs text-zinc-500">{RULE_PATTERN_HELP}</p>
            ) : null}
            {createRule && !condition.value.trim() ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Give the rule a value, or uncheck to quarantine just this email.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-5 py-4">
          {onEditRules ? (
            <button
              type="button"
              onClick={onEditRules}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit rules
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
              disabled={saving || (createRule && !condition.value.trim())}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {createRule ? "Save & quarantine" : "Quarantine"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
