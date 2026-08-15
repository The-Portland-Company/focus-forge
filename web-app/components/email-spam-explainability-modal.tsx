"use client";

import {
  ArrowRight,
  BrainCircuit,
  Database,
  ListChecks,
  Settings2,
  Sparkles,
} from "lucide-react";

import { FloatingPanel } from "@/components/floating-panel";
import { SpamAssessmentPanel } from "@/components/spam-assessment-panel";

import type {
  EmailRule,
  EmailRuleAction,
  EmailRuleCondition,
  InboxItem,
} from "@/lib/types";

/**
 * Explainability modal for the inbox spam-confidence indicator.
 *
 * Opened by clicking the "{pct}%" badge on an inbox row, it walks the user
 * through, step by step, how *this* email's spam score was produced:
 *   1. which of their email Rules matched (resolved from `matchedRuleIds`),
 *   2. where the AI classifier ran relative to those rules,
 *   3. what the classifier is trained on, and
 *   4. where that training is stored and how to change it.
 *
 * Every fact rendered here is grounded in the real pipeline
 * (`lib/email-inbox/server.ts` → `lib/email-inbox/ai.ts`, plus the
 * `email_rules`, `ai_playbooks`, and `ai_memories` tables) — nothing is
 * invented. Keep it that way when editing.
 */

/** Human-readable label for a rule condition field. */
const CONDITION_FIELD_LABEL: Record<EmailRuleCondition["field"], string> = {
  sender_email: "sender email",
  sender_domain: "sender domain",
  subject: "subject",
  body: "body",
  mailbox: "mailbox",
  participant: "participant",
};

/** Human-readable label for a rule condition operator. */
const CONDITION_OPERATOR_LABEL: Record<
  EmailRuleCondition["operator"],
  string
> = {
  contains: "contains",
  equals: "equals",
  ends_with: "ends with",
  starts_with: "starts with",
  matches: "matches pattern",
};

/** Human-readable label for a rule action type. */
const ACTION_LABEL: Record<EmailRuleAction["type"], string> = {
  quarantine: "Move to quarantine",
  always_delete: "Always delete",
  mark_read: "Mark as read",
  archive: "Archive",
  spam: "Mark as spam",
  never_spam: "Never mark as spam",
  assign_mailbox_owner: "Assign to mailbox owner",
  require_project: "Require a project",
  generate_tasks: "Generate tasks",
};

function describeCondition(condition: EmailRuleCondition): string {
  const field = CONDITION_FIELD_LABEL[condition.field] ?? condition.field;
  const operator =
    CONDITION_OPERATOR_LABEL[condition.operator] ?? condition.operator;
  return `${field} ${operator} “${condition.value}”`;
}

/** Small numbered step wrapper so the modal reads as a scannable checklist. */
function Step({
  index,
  icon,
  title,
  children,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
          {icon}
          {title}
        </h3>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-zinc-400">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Inline code / path pill for referencing real files and DB tables. */
function CodeRef({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[12px] text-zinc-200">
      {children}
    </code>
  );
}

export function EmailSpamExplainabilityModal({
  item,
  rules,
  onClose,
  onEditRules,
  onEditAiProfile,
}: {
  /** Thread whose score is being explained. `null` keeps the modal closed. */
  item: InboxItem | null;
  /** All email rules, used to resolve `matchedRuleIds` → names/conditions. */
  rules?: EmailRule[];
  onClose: () => void;
  /** Optional deep-link into the Rules panel. Hidden when not provided. */
  onEditRules?: () => void;
  /** Optional deep-link into Email AI Lab (the AI instruction profile /
   *  training-doc editor). Hidden when not provided. */
  onEditAiProfile?: () => void;
}) {
  const pct =
    item && item.actionConfidence != null
      ? Math.round(item.actionConfidence * 100)
      : null;

  // Resolve matched rule ids to their full rule objects where possible so we
  // can show names + conditions; unresolved ids fall back to the raw id.
  const matchedEntries = (item?.matchedRuleIds ?? []).map((id) => ({
    id,
    rule: rules?.find((rule) => rule.id === id) ?? null,
  }));
  const matchedRuleObjects = matchedEntries
    .map((entry) => entry.rule)
    .filter((rule): rule is EmailRule => rule != null);

  // A `never_spam` rule tells the classifier not to flag this sender and any
  // spam verdict it returns is overridden after the fact. A spam/quarantine/
  // delete rule forces the classification regardless of the AI.
  const neverSpamRule = matchedRuleObjects.find((rule) =>
    rule.actions.some((action) => action.type === "never_spam"),
  );
  const forcingRule = matchedRuleObjects.find((rule) =>
    rule.actions.some((action) =>
      ["spam", "quarantine", "always_delete"].includes(action.type),
    ),
  );

  // Draggable + minimizable floating panel (shared with the Linked Tasks
  // pop-out). No backdrop — it floats on top and the page stays usable.
  if (item === null) return null;

  return (
    <FloatingPanel
      open
      onClose={onClose}
      resetKey={item.id}
      title="How this spam score was determined"
      icon={<Sparkles className="h-4 w-4 shrink-0 text-amber-300" />}
    >
        <div className="px-6 pb-6 pt-4">
        {/* The live verdict for THIS email sits above the description of how
            the pipeline works — what it decided matters more than how. */}
        <SpamAssessmentPanel threadId={item.id} />
        <p className="text-sm text-zinc-400">
          {pct != null ? (
            <>
              Our classifier rated this email{" "}
              <span className="font-semibold text-amber-300">
                {pct}% chance of being spam
              </span>
              . Here is exactly how that number was reached.
            </>
          ) : (
            "Here is how this email's spam score was reached."
          )}
        </p>

        <div className="mt-4 space-y-5">
          {/* STEP 1 — Which rules matched? */}
          <Step
            index={1}
            icon={<ListChecks className="h-4 w-4 text-zinc-400" />}
            title="Which of your rules matched?"
          >
            {matchedEntries.length === 0 ? (
              <p>
                No rules matched — this email was evaluated by the AI
                classifier.
              </p>
            ) : (
              <ul className="space-y-2">
                {matchedEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-zinc-100">
                      {entry.rule?.name ?? "Rule"}
                    </div>
                    {entry.rule ? (
                      <div className="mt-1 space-y-0.5 text-xs sm:text-[12px] text-zinc-500">
                        <div>
                          Matches{" "}
                          {entry.rule.matchMode === "all" ? "all of" : "any of"}
                          :{" "}
                          {entry.rule.conditions
                            .map(describeCondition)
                            .join(entry.rule.matchMode === "all" ? " and " : " or ")}
                        </div>
                        <div>
                          Action
                          {entry.rule.actions.length === 1 ? "" : "s"}:{" "}
                          {entry.rule.actions
                            .map(
                              (action) =>
                                ACTION_LABEL[action.type] ?? action.type,
                            )
                            .join(", ")}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 font-mono text-xs sm:text-[11px] text-zinc-500">
                        {entry.id}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Step>

          {/* STEP 2 — When did the AI analyze it? */}
          <Step
            index={2}
            icon={<BrainCircuit className="h-4 w-4 text-zinc-400" />}
            title="When did the AI analyze it?"
          >
            <p>
              Your rules always run <span className="text-zinc-200">first</span>
              . The AI classifier then reads the message&rsquo;s sender, subject,
              and body and produces the confidence score
              {pct != null ? <> shown above ({pct}%)</> : null}.
            </p>
            {neverSpamRule ? (
              <p>
                Because the rule{" "}
                <span className="text-zinc-200">
                  &ldquo;{neverSpamRule.name}&rdquo;
                </span>{" "}
                has a <span className="text-zinc-200">Never mark as spam</span>{" "}
                action, the classifier was told not to treat this sender as spam
                and any spam verdict it returned was overridden.
              </p>
            ) : forcingRule ? (
              <p>
                The rule{" "}
                <span className="text-zinc-200">
                  &ldquo;{forcingRule.name}&rdquo;
                </span>{" "}
                forced this email&rsquo;s classification, overriding the
                AI&rsquo;s own verdict.
              </p>
            ) : (
              <p>
                No matched rule overrode the result, so the AI classifier&rsquo;s
                verdict stands.
              </p>
            )}
          </Step>

          {/* STEP 3 — How the AI was trained. */}
          <Step
            index={3}
            icon={<Sparkles className="h-4 w-4 text-zinc-400" />}
            title="How was the AI trained?"
          >
            <p>
              The model (OpenAI <CodeRef>gpt-4.1</CodeRef>) is not fine-tuned on
              your data — instead, four inputs are assembled into its prompt at
              classification time:
            </p>
            <ul className="ml-1 list-disc space-y-1.5 pl-4">
              <li>
                <span className="text-zinc-200">A classifier system prompt</span>{" "}
                — fixed instructions telling the model how to triage email into
                actionable work vs. spam.{" "}
                <span className="text-zinc-500">
                  Edited in app code: <CodeRef>lib/email-inbox/ai.ts</CodeRef>.
                </span>
              </li>
              <li>
                <span className="text-zinc-200">Your AI instruction profile</span>{" "}
                — free-text guidance you write about how your email should be
                handled.{" "}
                <span className="text-zinc-500">
                  <CodeRef>email_ai_profiles.instructionText</CodeRef>, edited in
                  Email AI Lab.
                </span>
                {onEditAiProfile ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onEditAiProfile}
                      className="inline-flex items-center gap-1 font-medium text-amber-300 underline-offset-2 transition-colors hover:text-amber-200 hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </button>
                  </>
                ) : null}
              </li>
              <li>
                <span className="text-zinc-200">Your email Rules</span> — run
                before the AI and can override its verdict (Step 1).{" "}
                <span className="text-zinc-500">
                  <CodeRef>email_rules</CodeRef>, edited in the Rules panel.
                </span>
                {onEditRules ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onEditRules}
                      className="inline-flex items-center gap-1 font-medium text-amber-300 underline-offset-2 transition-colors hover:text-amber-200 hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </button>
                  </>
                ) : null}
              </li>
              <li>
                <span className="text-zinc-200">AI memory</span> — a decision
                playbook plus learned precedents distilled from how you&rsquo;ve
                triaged past email.{" "}
                <span className="text-zinc-500">
                  <CodeRef>components/ai-memory-tab.tsx</CodeRef> (AI Memory tab);
                  shaped by correcting classifications.
                </span>
              </li>
            </ul>
          </Step>

          {/* STEP 4 — Where the training lives & how to edit it. */}
          <Step
            index={4}
            icon={<Database className="h-4 w-4 text-zinc-400" />}
            title="Where is that training stored, and how do you change it?"
          >
            <p>
              There is no on-disk &ldquo;training file&rdquo; — everything is
              data injected into the prompt at runtime. Three sources are yours
              to shape:
            </p>
            <ul className="space-y-2.5">
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  <span className="text-zinc-200">
                    AI instruction profile
                  </span>{" "}
                  — the main training doc. Stored in the{" "}
                  <CodeRef>email_ai_profiles.instructionText</CodeRef> column and
                  edited in <span className="text-zinc-200">Email AI Lab</span>{" "}
                  (saved via <CodeRef>/api/email/ai-profiles</CodeRef>).
                  {onEditAiProfile ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={onEditAiProfile}
                        className="inline-flex items-center gap-1 font-medium text-amber-300 underline-offset-2 transition-colors hover:text-amber-200 hover:underline"
                      >
                        Open Email AI Lab
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
              <li className="flex gap-2">
                <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  <span className="text-zinc-200">Rules</span> live in the{" "}
                  <CodeRef>email_rules</CodeRef> table and are edited in the{" "}
                  <span className="text-zinc-200">Rules panel</span> (
                  <CodeRef>components/email-rules-panel.tsx</CodeRef>, saved via{" "}
                  <CodeRef>/api/email/rules</CodeRef>).
                  {onEditRules ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={onEditRules}
                        className="inline-flex items-center gap-1 font-medium text-amber-300 underline-offset-2 transition-colors hover:text-amber-200 hover:underline"
                      >
                        Open Rules
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
              <li className="flex gap-2">
                <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                <span>
                  <span className="text-zinc-200">AI memory</span> is
                  database-backed (a versioned decision playbook plus learned
                  precedents), generated automatically from how you triage email
                  and reviewed in the{" "}
                  <span className="text-zinc-200">AI Memory</span> tab (
                  <CodeRef>components/ai-memory-tab.tsx</CodeRef>). You shape it
                  by correcting classifications, not by hand-editing.
                </span>
              </li>
            </ul>
            <p className="text-xs sm:text-[12px] text-zinc-500">
              The fixed classifier system prompt (model{" "}
              <CodeRef>gpt-4.1</CodeRef>) is app code in{" "}
              <CodeRef>lib/email-inbox/ai.ts</CodeRef>, orchestrated by{" "}
              <CodeRef>lib/email-inbox/server.ts</CodeRef> — changed by a
              developer, not in the UI.
            </p>
          </Step>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            Done
          </button>
        </div>
        </div>
    </FloatingPanel>
  );
}
