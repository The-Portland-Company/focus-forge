"use client";

import { useState } from "react";
import { Code2, Brain, BookOpen, History } from "lucide-react";
import type { Database, Mailbox } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmailRulesPanel } from "./email-rules-panel";
import AiMemoryTab from "./ai-memory-tab";
import AiPlaybookTab from "./ai-playbook-tab";
import AiDecisionHistoryTab from "./ai-decision-history-tab";

type AiRulesTabsProps = {
  data: Database;
  mailboxes: Mailbox[];
  currentUserId?: string;
  onRefresh: () => Promise<void> | void;
};

type TabKey = "code" | "memory" | "playbook" | "history";

const TABS: { key: TabKey; label: string; icon: typeof Code2 }[] = [
  { key: "code", label: "Code Rules", icon: Code2 },
  { key: "memory", label: "AI Memory", icon: Brain },
  { key: "playbook", label: "Playbook", icon: BookOpen },
  { key: "history", label: "Decision History", icon: History },
];

export default function AiRulesTabs({
  data,
  mailboxes,
  onRefresh,
}: AiRulesTabsProps) {
  const [active, setActive] = useState<TabKey>("code");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">AI Rules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Deterministic rules, learned memory, generalized playbook, and a full
          decision audit trail.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-[rgb(var(--theme-primary-rgb))] text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {active === "code" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
              These are deterministic rules. They execute as code and do not
              require AI interpretation.
            </div>
            <EmailRulesPanel
              rules={data.emailRules}
              mailboxes={mailboxes}
              onRefresh={onRefresh}
            />
          </div>
        )}
        {active === "memory" && <AiMemoryTab />}
        {active === "playbook" && <AiPlaybookTab />}
        {active === "history" && <AiDecisionHistoryTab />}
      </div>
    </div>
  );
}
