"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailRule, Mailbox } from "@/lib/types";
import { cn } from "@/lib/utils";

type EmailRulesPanelProps = {
  rules: EmailRule[];
  mailboxes: Mailbox[];
  onRefresh?: () => Promise<void> | void;
  onRuleSaved?: (rule: EmailRule) => void;
  showHeader?: boolean;
  className?: string;
};

const DEFAULT_RULE_CONDITIONS = JSON.stringify(
  [{ field: "sender_domain", operator: "contains", value: "example.com" }],
  null,
  2,
);
const DEFAULT_RULE_ACTIONS = JSON.stringify([{ type: "quarantine" }], null, 2);

function parseJsonValue<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function createEmptyRuleForm() {
  return {
    name: "",
    description: "",
    mailboxId: "all",
    priority: "100",
    matchMode: "all",
    stopProcessing: true,
    isActive: true,
    conditionsJson: DEFAULT_RULE_CONDITIONS,
    actionsJson: DEFAULT_RULE_ACTIONS,
  };
}

function sortRulesByPriority(rules: EmailRule[]) {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

function computeRuleStats(rules: EmailRule[]) {
  return {
    active: rules.filter((rule) => rule.isActive).length,
    quarantine: rules.filter((rule) =>
      rule.actions.some((action) => action.type === "quarantine"),
    ).length,
    alwaysDelete: rules.filter((rule) =>
      rule.actions.some((action) => action.type === "always_delete"),
    ).length,
  };
}

export function EmailRulesPanel({
  rules,
  mailboxes,
  onRefresh,
  onRuleSaved,
  showHeader = true,
  className,
}: EmailRulesPanelProps) {
  const [editingRule, setEditingRule] = useState<EmailRule | null>(null);
  const [ruleForm, setRuleForm] = useState(createEmptyRuleForm);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localRules, setLocalRules] = useState(sortRulesByPriority(rules));

  useEffect(() => {
    setLocalRules(sortRulesByPriority(rules));
  }, [rules]);

  const ruleStats = useMemo(() => computeRuleStats(localRules), [localRules]);

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const resetRuleForm = () => {
    setEditingRule(null);
    setRuleForm(createEmptyRuleForm());
  };

  const startEditingRule = (rule: EmailRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || "",
      mailboxId: rule.mailboxId || "all",
      priority: String(rule.priority),
      matchMode: rule.matchMode,
      stopProcessing: rule.stopProcessing,
      isActive: rule.isActive,
      conditionsJson: JSON.stringify(rule.conditions, null, 2),
      actionsJson: JSON.stringify(rule.actions, null, 2),
    });
  };

  const handleSaveRule = async () => {
    setIsSaving(true);

    try {
      const response = await fetch(
        editingRule ? `/api/email/rules/${editingRule.id}` : "/api/email/rules",
        {
          method: editingRule ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: ruleForm.name,
            description: ruleForm.description || null,
            mailboxId: ruleForm.mailboxId !== "all" ? ruleForm.mailboxId : null,
            priority: Number(ruleForm.priority || 100),
            matchMode: ruleForm.matchMode,
            stopProcessing: ruleForm.stopProcessing,
            isActive: ruleForm.isActive,
            conditions: parseJsonValue(ruleForm.conditionsJson, []),
            actions: parseJsonValue(ruleForm.actionsJson, []),
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save rule");
      }

      setLocalRules((prev) =>
        sortRulesByPriority([
          payload,
          ...prev.filter((rule) => rule.id !== payload.id),
        ]),
      );
      resetRuleForm();
      await onRefresh?.();
      onRuleSaved?.(payload);
      updateStatus("Rule saved.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to save rule",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Email Rules</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Deterministic triage runs before AI classification.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-400">
            {ruleStats.active} active · {ruleStats.quarantine} quarantine ·{" "}
            {ruleStats.alwaysDelete} always delete
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {localRules.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
              No rules yet.
            </div>
          ) : (
            localRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => startEditingRule(rule)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-zinc-200">
                    {rule.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Priority {rule.priority}
                  </div>
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {rule.description || "No description"}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{rule.matchMode.toUpperCase()}</span>
                  <span>·</span>
                  <span>
                    {rule.actions.map((action) => action.type).join(", ")}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              {editingRule ? "Edit Rule" : "New Rule"}
            </h2>
            {editingRule ? (
              <button
                type="button"
                onClick={resetRuleForm}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                New Rule
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={ruleForm.name}
              onChange={(event) =>
                setRuleForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Rule name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={ruleForm.description}
              onChange={(event) =>
                setRuleForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              placeholder="Description"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                value={ruleForm.mailboxId}
                onValueChange={(value) =>
                  setRuleForm((prev) => ({ ...prev, mailboxId: value }))
                }
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                  <SelectValue placeholder="Mailbox scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accessible mailboxes</SelectItem>
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                value={ruleForm.priority}
                onChange={(event) =>
                  setRuleForm((prev) => ({
                    ...prev,
                    priority: event.target.value,
                  }))
                }
                placeholder="Priority"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <textarea
              value={ruleForm.conditionsJson}
              onChange={(event) =>
                setRuleForm((prev) => ({
                  ...prev,
                  conditionsJson: event.target.value,
                }))
              }
              rows={8}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300"
            />
            <textarea
              value={ruleForm.actionsJson}
              onChange={(event) =>
                setRuleForm((prev) => ({
                  ...prev,
                  actionsJson: event.target.value,
                }))
              }
              rows={6}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={ruleForm.stopProcessing}
                  onChange={(event) =>
                    setRuleForm((prev) => ({
                      ...prev,
                      stopProcessing: event.target.checked,
                    }))
                  }
                />
                Stop processing after match
              </label>
              <button
                type="button"
                onClick={handleSaveRule}
                disabled={isSaving || !ruleForm.name.trim()}
                className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="text-sm text-zinc-400">{statusMessage}</div>
      ) : null}
    </div>
  );
}
