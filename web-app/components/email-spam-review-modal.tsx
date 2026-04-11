"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { EmailRulesPanel } from "@/components/email-rules-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildExistingSpamReviewRuleGroups,
  buildSpamReviewSessionItems,
  removeCreatedSpamReviewRule,
  shouldConfirmSpamRuleUndo,
  summarizeEmailRuleActions,
  summarizeEmailRuleConditions,
  type CreatedSpamReviewRule,
  upsertCreatedSpamReviewRule,
} from "@/lib/email-inbox/spam-review";
import type {
  EmailRule,
  EmailSpamExceptionResult,
  InboxItem,
  Mailbox,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  formatEmailSubject,
  formatParticipantLine,
  shouldShowSecondaryActionTitle,
} from "@/components/email-work-list";

type EmailSpamReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: InboxItem[];
  mailboxes: Mailbox[];
  rules: EmailRule[];
  mailboxFilterId?: string | null;
  onRefresh?: () => Promise<void> | void;
};

type SpamReviewTab = "created" | "existing";

async function parseResponse<T>(response: Response, fallbackError: string) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallbackError;

    throw new Error(message);
  }

  return payload as T;
}

type SpamReviewThreadCardAnimation = {
  cancel: () => void;
};

type SpamReviewThreadCardElement = {
  animate: (
    keyframes: Keyframe[],
    options?: KeyframeAnimationOptions,
  ) => unknown;
  getAnimations: () => SpamReviewThreadCardAnimation[];
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
};

const spamReviewThreadCardPulseKeyframes: Keyframe[] = [
  {
    opacity: 1,
    boxShadow: "0 0 0 0 rgba(251, 191, 36, 0)",
    backgroundColor: "rgba(24, 24, 27, 0.5)",
    borderColor: "rgba(63, 63, 70, 1)",
  },
  {
    opacity: 0.84,
    boxShadow: "0 0 0 10px rgba(251, 191, 36, 0.12)",
    backgroundColor: "rgba(120, 53, 15, 0.18)",
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  {
    opacity: 1,
    boxShadow: "0 0 0 0 rgba(251, 191, 36, 0)",
    backgroundColor: "rgba(24, 24, 27, 0.5)",
    borderColor: "rgba(63, 63, 70, 1)",
  },
];

const spamReviewThreadCardPulseOptions: KeyframeAnimationOptions = {
  duration: 640,
  easing: "ease-in-out",
  iterations: 2,
};

export function scrollAndPulseSpamReviewThreadCard(
  element: SpamReviewThreadCardElement | null,
) {
  if (!element) {
    return false;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate(
    spamReviewThreadCardPulseKeyframes,
    spamReviewThreadCardPulseOptions,
  );

  return true;
}

export function EmailSpamReviewModal({
  open,
  onOpenChange,
  items,
  mailboxes,
  rules,
  mailboxFilterId,
  onRefresh,
}: EmailSpamReviewModalProps) {
  const [sessionItems, setSessionItems] = useState<InboxItem[]>([]);
  const [keepSpamByThreadId, setKeepSpamByThreadId] = useState<
    Record<string, boolean>
  >({});
  const [createdRules, setCreatedRules] = useState<CreatedSpamReviewRule[]>([]);
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  const [confirmingThreadId, setConfirmingThreadId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<SpamReviewTab>("created");
  const [expandedCreatedRuleThreadId, setExpandedCreatedRuleThreadId] =
    useState<string | null>(null);
  const [expandedExistingRuleId, setExpandedExistingRuleId] = useState<
    string | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const previousMailboxFilterIdRef = useRef<string | null | undefined>(
    mailboxFilterId,
  );
  const threadCardRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const filterChanged =
      previousMailboxFilterIdRef.current !== mailboxFilterId;

    if (!open) {
      setStatusMessage(null);
      setBusyThreadId(null);
      setConfirmingThreadId(null);
      setExpandedCreatedRuleThreadId(null);
      setExpandedExistingRuleId(null);
      wasOpenRef.current = false;
      previousMailboxFilterIdRef.current = mailboxFilterId;
      return;
    }

    if (!wasOpenRef.current || filterChanged) {
      const initialSessionItems = buildSpamReviewSessionItems(
        items,
        mailboxFilterId,
      ).map((entry) => entry.item);

      setSessionItems(initialSessionItems);
      setKeepSpamByThreadId(
        Object.fromEntries(
          initialSessionItems.map((item) => [item.id, true] as const),
        ),
      );
      setCreatedRules([]);
      setBusyThreadId(null);
      setConfirmingThreadId(null);
      setExpandedCreatedRuleThreadId(null);
      setExpandedExistingRuleId(null);
      setStatusMessage(null);
      setActiveTab("created");
    }

    wasOpenRef.current = true;
    previousMailboxFilterIdRef.current = mailboxFilterId;
  }, [items, mailboxFilterId, open]);

  useEffect(() => {
    if (!open) return;

    setSessionItems((previousItems) =>
      previousItems.map(
        (item) => items.find((candidate) => candidate.id === item.id) || item,
      ),
    );
  }, [items, open]);

  const createdRulesByThreadId = useMemo(
    () =>
      new Map(createdRules.map((entry) => [entry.threadId, entry] as const)),
    [createdRules],
  );

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const focusThreadCard = (threadId: string) => {
    scrollAndPulseSpamReviewThreadCard(
      threadCardRefs.current.get(threadId) ?? null,
    );
  };

  const handleCreateRule = async (thread: InboxItem) => {
    setBusyThreadId(thread.id);

    try {
      const response = await fetch("/api/email/spam-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threadId: thread.id }),
      });
      const payload = await parseResponse<EmailSpamExceptionResult>(
        response,
        "Failed to create spam exception",
      );

      setKeepSpamByThreadId((prev) => ({ ...prev, [thread.id]: false }));
      setCreatedRules((prev) =>
        upsertCreatedSpamReviewRule(prev, {
          threadId: thread.id,
          rule: payload.rule,
          rationale: payload.rationale,
        }),
      );
      setConfirmingThreadId(null);
      setActiveTab("created");
      setExpandedCreatedRuleThreadId(thread.id);
      await onRefresh?.();
      updateStatus("Spam exception saved.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to create rule",
      );
    } finally {
      setBusyThreadId(null);
    }
  };

  const handleRevertRule = async (thread: InboxItem, ruleId: string) => {
    setBusyThreadId(thread.id);

    try {
      const response = await fetch(
        `/api/email/spam-exceptions/${ruleId}/revert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ threadId: thread.id }),
        },
      );

      await parseResponse<EmailSpamExceptionResult>(
        response,
        "Failed to revert spam exception",
      );

      setKeepSpamByThreadId((prev) => ({ ...prev, [thread.id]: true }));
      setCreatedRules((prev) => removeCreatedSpamReviewRule(prev, thread.id));
      setConfirmingThreadId(null);
      setExpandedCreatedRuleThreadId((current) =>
        current === thread.id ? null : current,
      );
      await onRefresh?.();
      updateStatus("Spam detection restored.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to revert rule",
      );
    } finally {
      setBusyThreadId(null);
    }
  };

  const handleToggle = (thread: InboxItem) => {
    if (busyThreadId === thread.id) {
      return;
    }

    const keepSpam = keepSpamByThreadId[thread.id] ?? true;
    const createdRule = createdRulesByThreadId.get(thread.id);

    if (keepSpam) {
      void handleCreateRule(thread);
      return;
    }

    if (
      shouldConfirmSpamRuleUndo({
        createdRuleId: createdRule?.rule.id,
        nextKeepSpam: true,
      })
    ) {
      setConfirmingThreadId(thread.id);
      return;
    }

    setKeepSpamByThreadId((prev) => ({ ...prev, [thread.id]: true }));
  };

  const { ruleGroups: existingRuleGroups, unmatchedItems } = useMemo(
    () =>
      buildExistingSpamReviewRuleGroups({
        items: sessionItems,
        rules,
        keepSpamByThreadId,
      }),
    [keepSpamByThreadId, rules, sessionItems],
  );

  const keptSpamCount = useMemo(
    () =>
      sessionItems.filter((item) => keepSpamByThreadId[item.id] ?? true).length,
    [keepSpamByThreadId, sessionItems],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1440px)] max-w-[96vw] overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-white">
        <div className="border-b border-zinc-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl text-white">
                AI + Spam Review
              </DialogTitle>
              <DialogDescription className="mt-2 text-zinc-400">
                Review detected spam, keep trusted threads out of spam, and
                inspect the rules being created in real time.
              </DialogDescription>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-400">
              {sessionItems.length} detected spam thread
              {sessionItems.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="grid h-[calc(92vh-112px)] min-h-0 grid-rows-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:grid-rows-1">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-zinc-800 xl:border-b-0 xl:border-r">
            <div className="border-b border-zinc-800 px-6 py-4">
              <div className="inline-flex items-center gap-2 text-sm text-zinc-300">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                Detected Spam
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Toggle a thread off to create a rule that keeps future messages
                out of spam.
              </p>
            </div>

            <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {sessionItems.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
                  No detected spam matches this view.
                </div>
              ) : (
                sessionItems.map((thread) => {
                  const keepSpam = keepSpamByThreadId[thread.id] ?? true;
                  const createdRule = createdRulesByThreadId.get(thread.id);
                  const mailbox = mailboxes.find(
                    (candidate) => candidate.id === thread.mailboxId,
                  );
                  const fromLine = formatParticipantLine(
                    thread.participants,
                    "from",
                  );
                  const isBusy = busyThreadId === thread.id;
                  const isConfirming = confirmingThreadId === thread.id;
                  const showSecondaryActionTitle =
                    shouldShowSecondaryActionTitle(
                      thread.actionTitle,
                      thread.subject,
                    );

                  return (
                    <div
                      key={thread.id}
                      ref={(node) => {
                        if (node) {
                          threadCardRefs.current.set(thread.id, node);
                          return;
                        }

                        threadCardRefs.current.delete(thread.id);
                      }}
                      data-thread-id={thread.id}
                      className={cn(
                        "rounded-2xl border px-4 py-4 transition-colors",
                        keepSpam
                          ? "border-zinc-800 bg-zinc-900/50"
                          : "border-emerald-700/40 bg-emerald-950/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                            <ShieldAlert className="h-4 w-4 text-amber-400" />
                            {!keepSpam && createdRule ? (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                                Allowed
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-sm font-medium text-white">
                            {formatEmailSubject(thread.subject)}
                          </div>
                          {showSecondaryActionTitle ? (
                            <div className="mt-1 text-sm text-zinc-400">
                              {thread.actionTitle}
                            </div>
                          ) : null}
                          {fromLine ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {fromLine}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={keepSpam}
                            onClick={() => handleToggle(thread)}
                            disabled={isBusy}
                            className={cn(
                              "relative inline-flex h-7 w-14 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                              keepSpam
                                ? "border-amber-500/40 bg-amber-500/20"
                                : "border-emerald-500/40 bg-emerald-500/20",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-zinc-900 transition-transform",
                                keepSpam ? "translate-x-1" : "translate-x-8",
                              )}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : keepSpam ? (
                                <ShieldAlert className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </button>
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                            {keepSpam ? "Keep as spam" : "Allow future mail"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-zinc-400">
                        {thread.summaryText ||
                          thread.previewText ||
                          "No summary available yet."}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {mailbox?.name || thread.mailboxName || "Mailbox"}
                        </span>
                        {thread.actionConfidence ? (
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            {Math.round(thread.actionConfidence * 100)}%
                            confidence
                          </span>
                        ) : null}
                      </div>

                      {isConfirming && createdRule ? (
                        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/80 p-3">
                          <div className="text-sm text-zinc-300">
                            Re-enable spam detection for this thread and
                            deactivate the created rule?
                          </div>
                          <div className="mt-3 flex gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                void handleRevertRule(
                                  thread,
                                  createdRule.rule.id,
                                )
                              }
                              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingThreadId(null)}
                              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="border-b border-zinc-800 px-6 py-4">
              <div className="grid w-full max-w-md grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("created")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-center text-sm font-medium leading-tight transition-colors",
                    activeTab === "created"
                      ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                      : "text-zinc-400 hover:text-white",
                  )}
                >
                  Created This Review
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("existing")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-center text-sm font-medium leading-tight transition-colors",
                    activeTab === "existing"
                      ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                      : "text-zinc-400 hover:text-white",
                  )}
                >
                  Existing Rules
                </button>
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-4">
              {activeTab === "created" ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">
                          Rules Keeping These Threads In Spam
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Expand a rule to see every kept-as-spam thread linked
                          to it in this review.
                        </div>
                      </div>
                      <div className="rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
                        {keptSpamCount} kept as spam
                      </div>
                    </div>

                    {existingRuleGroups.length === 0 ? (
                      unmatchedItems.length === 0 ? (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
                          No saved spam rules match the threads you are keeping
                          in spam right now.
                        </div>
                      ) : null
                    ) : (
                      <div className="space-y-3">
                        {existingRuleGroups.map((group) => {
                          const isExpanded =
                            expandedExistingRuleId === group.rule.id;

                          return (
                            <div
                              key={group.rule.id}
                              className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
                                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                                    {group.rule.name}
                                  </div>
                                  <div className="mt-2 text-sm text-zinc-400">
                                    {group.rule.description || "No description"}
                                  </div>
                                  <div className="mt-3 text-xs text-zinc-500">
                                    {summarizeEmailRuleConditions(group.rule)}
                                  </div>
                                  <div className="mt-2 text-xs text-zinc-500">
                                    {summarizeEmailRuleActions(group.rule)}
                                  </div>
                                </div>
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                                  {group.threads.length} linked thread
                                  {group.threads.length === 1 ? "" : "s"}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedExistingRuleId((current) =>
                                    current === group.rule.id
                                      ? null
                                      : group.rule.id,
                                  )
                                }
                                className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white"
                              >
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 transition-transform",
                                    isExpanded ? "rotate-180" : "",
                                  )}
                                />
                                {isExpanded
                                  ? "Hide linked threads"
                                  : "Show linked threads"}
                              </button>

                              {isExpanded ? (
                                <div className="mt-3 space-y-2">
                                  {group.threads.map((thread) => {
                                    const fromLine = formatParticipantLine(
                                      thread.participants,
                                      "from",
                                    );
                                    const showSecondaryActionTitle =
                                      shouldShowSecondaryActionTitle(
                                        thread.actionTitle,
                                        thread.subject,
                                      );

                                    return (
                                      <button
                                        type="button"
                                        key={`${group.rule.id}-${thread.id}`}
                                        onClick={() =>
                                          focusThreadCard(thread.id)
                                        }
                                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-left transition-colors hover:border-amber-400/35 hover:bg-amber-500/10 focus-visible:border-amber-400/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
                                        aria-label={`Jump to ${thread.actionTitle}`}
                                      >
                                        <div className="text-sm font-medium text-white">
                                          {formatEmailSubject(thread.subject)}
                                        </div>
                                        {showSecondaryActionTitle ? (
                                          <div className="mt-1 text-sm text-zinc-400">
                                            {thread.actionTitle}
                                          </div>
                                        ) : null}
                                        {fromLine ? (
                                          <div className="mt-1 text-xs text-zinc-500">
                                            {fromLine}
                                          </div>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {unmatchedItems.length > 0 ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-4">
                        <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
                          <Bot className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                          AI-Classified Spam Without a Saved Rule
                        </div>
                        <div className="mt-2 text-sm text-zinc-400">
                          These threads are still being kept as spam, but there
                          is no saved rule attached to them yet.
                        </div>
                        <div className="mt-3 space-y-2">
                          {unmatchedItems.map((thread) => {
                            const showSecondaryActionTitle =
                              shouldShowSecondaryActionTitle(
                                thread.actionTitle,
                                thread.subject,
                              );

                            return (
                              <button
                                type="button"
                                key={`unmatched-${thread.id}`}
                                onClick={() => focusThreadCard(thread.id)}
                                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-left transition-colors hover:border-amber-400/35 hover:bg-amber-500/10 focus-visible:border-amber-400/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
                                aria-label={`Jump to ${thread.actionTitle}`}
                              >
                                <div className="text-sm font-medium text-white">
                                  {formatEmailSubject(thread.subject)}
                                </div>
                                {showSecondaryActionTitle ? (
                                  <div className="mt-1 text-sm text-zinc-400">
                                    {thread.actionTitle}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Rules Created This Review
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Exception rules appear here as you turn spam items off.
                      </div>
                    </div>

                    {createdRules.length === 0 ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
                        AI-created spam exception rules will appear here as you
                        turn spam items off.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {createdRules.map((entry) => {
                          const isExpanded =
                            expandedCreatedRuleThreadId === entry.threadId;
                          const isCurrent =
                            keepSpamByThreadId[entry.threadId] === false;

                          return (
                            <div
                              key={`${entry.threadId}-${entry.rule.id}`}
                              className={cn(
                                "rounded-2xl border px-4 py-4",
                                isCurrent
                                  ? "border-emerald-500/35 bg-emerald-500/10"
                                  : "border-zinc-800 bg-zinc-900/50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
                                    <Bot className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                                    {entry.rule.name}
                                  </div>
                                  <div className="mt-2 text-sm text-zinc-400">
                                    {entry.rule.description || "No description"}
                                  </div>
                                  <div className="mt-3 text-xs text-zinc-500">
                                    {summarizeEmailRuleConditions(entry.rule)}
                                  </div>
                                </div>
                                {isCurrent ? (
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                                    Active
                                  </span>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCreatedRuleThreadId((current) =>
                                    current === entry.threadId
                                      ? null
                                      : entry.threadId,
                                  )
                                }
                                className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white"
                              >
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 transition-transform",
                                    isExpanded ? "rotate-180" : "",
                                  )}
                                />
                                Why this rule was created
                              </button>

                              {isExpanded ? (
                                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-400">
                                  {entry.rationale}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmailRulesPanel
                  rules={rules}
                  mailboxes={mailboxes}
                  onRefresh={onRefresh}
                  compact
                  showHeader={false}
                  className="min-w-0"
                />
              )}
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className="border-t border-zinc-800 px-6 py-3 text-sm text-zinc-400">
            {statusMessage}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
