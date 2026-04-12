"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Plus, Sparkles, Wand2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailRule, Mailbox } from "@/lib/types";
import {
  EMAIL_RULE_ACTION_OPTIONS,
  EMAIL_RULE_FIELD_OPTIONS,
} from "@/lib/email-inbox/rule-assistant";
import { cn } from "@/lib/utils";

type EmailRulesPanelProps = {
  rules: EmailRule[];
  mailboxes: Mailbox[];
  onRefresh?: () => Promise<void> | void;
  onRuleSaved?: (rule: EmailRule) => void;
  initialEditingRule?: EmailRule | null;
  showHeader?: boolean;
  compact?: boolean;
  className?: string;
};

export type EmailRuleFormState = ReturnType<typeof createEmptyRuleForm>;

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

export function createRuleFormFromRule(rule: EmailRule): EmailRuleFormState {
  return {
    name: rule.name,
    description: rule.description || "",
    mailboxId: rule.mailboxId || "all",
    priority: String(rule.priority),
    matchMode: rule.matchMode,
    stopProcessing: rule.stopProcessing,
    isActive: rule.isActive,
    conditionsJson: JSON.stringify(rule.conditions, null, 2),
    actionsJson: JSON.stringify(rule.actions, null, 2),
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

function extractSampleLabel(value: string) {
  return `${value.slice(0, 44).trimEnd()}${value.length > 44 ? "..." : ""}`;
}

export function EmailRulesPanel({
  rules,
  mailboxes,
  onRefresh,
  onRuleSaved,
  initialEditingRule,
  showHeader = true,
  compact = false,
  className,
}: EmailRulesPanelProps) {
  const [editingRule, setEditingRule] = useState<EmailRule | null>(null);
  const [ruleForm, setRuleForm] = useState(createEmptyRuleForm);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localRules, setLocalRules] = useState(sortRulesByPriority(rules));
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<string | null>(
    null,
  );
  const [assistantRationale, setAssistantRationale] = useState<string | null>(
    null,
  );
  const [isGeneratingRule, setIsGeneratingRule] = useState(false);

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

  const hydrateRuleFormFromDraft = (draft: {
    name: string;
    description: string;
    mailboxScope: "mailbox" | "user";
    priority: number;
    matchMode: "all" | "any";
    stopProcessing: boolean;
    conditions: unknown;
    actions: unknown;
  }) => {
    setEditingRule(null);
    setRuleForm((prev) => ({
      name: draft.name,
      description: draft.description,
      mailboxId:
        draft.mailboxScope === "mailbox" &&
        prev.mailboxId !== "all" &&
        mailboxes.some((mailbox) => mailbox.id === prev.mailboxId)
          ? prev.mailboxId
          : "all",
      priority: String(draft.priority),
      matchMode: draft.matchMode,
      stopProcessing: draft.stopProcessing,
      isActive: true,
      conditionsJson: JSON.stringify(draft.conditions, null, 2),
      actionsJson: JSON.stringify(draft.actions, null, 2),
    }));
  };

  const startEditingRule = (rule: EmailRule) => {
    setIsAssistantOpen(false);
    setEditingRule(rule);
    setRuleForm(createRuleFormFromRule(rule));
  };

  useEffect(() => {
    if (!initialEditingRule?.id) {
      return;
    }

    startEditingRule(initialEditingRule);
  }, [initialEditingRule]);

  const handleOpenAssistant = () => {
    resetRuleForm();
    setAssistantPrompt("");
    setAssistantResponse(
      "What should this rule do? Describe it in plain English and I will draft the rule JSON for you.",
    );
    setAssistantRationale(null);
    setIsAssistantOpen(true);
  };

  const handleGenerateRuleDraft = async () => {
    if (!assistantPrompt.trim()) {
      updateStatus("Enter what you want the rule to do.");
      return;
    }

    setIsGeneratingRule(true);

    try {
      const response = await fetch("/api/email/rules/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: assistantPrompt,
          mailboxId: ruleForm.mailboxId !== "all" ? ruleForm.mailboxId : null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate rule draft");
      }

      hydrateRuleFormFromDraft(payload);
      setAssistantResponse(payload.assistantMessage || "Rule draft generated.");
      setAssistantRationale(payload.rationale || null);
      updateStatus("AI rule draft generated.");
    } catch (error) {
      updateStatus(
        error instanceof Error
          ? error.message
          : "Failed to generate rule draft",
      );
    } finally {
      setIsGeneratingRule(false);
    }
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
    <div className={cn("min-w-0 space-y-6", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Email Rules</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Deterministic triage runs before AI classification.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-400">
              {ruleStats.active} active · {ruleStats.quarantine} quarantine ·{" "}
              {ruleStats.alwaysDelete} always delete
            </div>
            <button
              type="button"
              onClick={handleOpenAssistant}
              className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Bot className="h-4 w-4" />
              Create a Rule
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-6",
          compact ? "grid-cols-1" : "lg:grid-cols-[1.1fr_0.9fr]",
        )}
      >
        <div className="min-w-0 space-y-3">
          {isAssistantOpen ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    <Sparkles className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                    AI Rule Composer
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    Describe the rule in plain English. The editable rule draft
                    appears on the right.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAssistantOpen(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  Close
                </button>
              </div>

              {assistantResponse ? (
                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-200">
                  <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <Bot className="h-3.5 w-3.5" />
                    AI Says
                  </div>
                  <div>{assistantResponse}</div>
                  {assistantRationale ? (
                    <div className="mt-3 text-xs text-zinc-500">
                      Why this draft: {assistantRationale}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                <textarea
                  value={assistantPrompt}
                  onChange={(event) => setAssistantPrompt(event.target.value)}
                  placeholder='Ex. When receipts from Stripe come in, archive them and mark them as read. Ex. Never send payroll emails to spam.'
                  rows={5}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    "When receipts from Stripe come in, archive them and mark them as read.",
                    "If a sender domain contains example.com and the subject mentions proposal, require a project.",
                    "Never send emails from my accountant to spam.",
                  ].map((samplePrompt) => (
                    <button
                      key={samplePrompt}
                      type="button"
                      onClick={() => setAssistantPrompt(samplePrompt)}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                    >
                      {extractSampleLabel(samplePrompt)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">
                    Unsupported actions like moving to an arbitrary mailbox
                    folder are called out instead of being faked.
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRuleDraft}
                    disabled={isGeneratingRule || !assistantPrompt.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Wand2 className="h-4 w-4" />
                    {isGeneratingRule ? "Generating…" : "Generate Rule"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <Plus className="h-3.5 w-3.5" />
                    Variables
                  </div>
                  <div className="space-y-2">
                    {EMAIL_RULE_FIELD_OPTIONS.map((option) => (
                      <div
                        key={option.field}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                      >
                        <div className="text-sm font-medium text-zinc-200">
                          {option.label}
                        </div>
                        <div className="text-xs text-zinc-500">
                          `{option.field}` · {option.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <Plus className="h-3.5 w-3.5" />
                    Actions
                  </div>
                  <div className="space-y-2">
                    {EMAIL_RULE_ACTION_OPTIONS.map((option) => (
                      <div
                        key={option.action}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                      >
                        <div className="text-sm font-medium text-zinc-200">
                          {option.label}
                        </div>
                        <div className="text-xs text-zinc-500">
                          `{option.action}` · {option.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

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

        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              {editingRule
                ? "Edit Rule"
                : isAssistantOpen
                  ? "Rule Draft"
                  : "New Rule"}
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
