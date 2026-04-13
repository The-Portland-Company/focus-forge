"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  Check,
  ChevronDown,
  ExternalLink,
  FolderSearch,
  Loader2,
  MailCheck,
  MailPlus,
  Search,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { EmailThreadAttachments } from "@/components/email-thread-attachments";
import { Tooltip } from "@/components/tooltip";
import { EmailSignatureContent } from "@/components/email-signature-content";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatEmailSubject,
  shouldShowSecondaryActionTitle,
} from "@/components/email-work-list";
import { FloatingFieldLabel } from "@/components/ui/floating-field-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterInboxProjects,
  getThreadProjectId,
  sortInboxProjects,
} from "@/lib/email-thread-projects";
import {
  getConversationEntriesExcludingPrimary,
  getDisplayableThreadAttachments,
  getEmailActorGradient,
  getEmailActorInitials,
  getEmailActorName,
  getPrimaryThreadRenderEntry,
} from "@/lib/email-thread-ui";
import {
  clampEmailDeleteUndoSeconds,
  DEFAULT_THREAD_ACTION_QUEUE_SECONDS,
  getQueuedThreadActionMessage,
  getThreadActionLabel,
  requiresThreadActionConfirmation,
  type ThreadAction,
} from "@/lib/email-inbox/thread-actions";
import { useUserPreferences, useUserProfile } from "@/lib/supabase/hooks";
import {
  DEFAULT_EMAIL_REPLY_SETTINGS,
  EMAIL_REPLY_CONCISENESS_OPTIONS,
  EMAIL_REPLY_PERSONALITY_OPTIONS,
  EMAIL_REPLY_TONE_OPTIONS,
  normalizeEmailReplySettings,
  type EmailReplySettings,
} from "@/lib/email-inbox/reply-settings";
import type {
  ConversationEntry,
  EmailReplyDraft,
  InboxItem,
  Project,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type EmailThreadDetail = InboxItem & {
  conversation?: ConversationEntry[];
  linkedTasks?: Array<{
    id: string;
    name: string;
  }>;
  activeReplyDraft?: EmailReplyDraft | null;
  project_id?: string | null;
  projectId?: string | null;
};

type EmailThreadModalProps = {
  open: boolean;
  threadId: string | null;
  projects: Project[];
  hideEmailSignatures?: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => Promise<void> | void;
};

export function shouldCloseEmailThreadModalAfterAction(action: ThreadAction) {
  return (
    action === "quarantine" ||
    action === "archive" ||
    action === "spam" ||
    action === "delete" ||
    action === "always_delete_sender"
  );
}

export function canMarkThreadAsRead(
  thread: Pick<InboxItem, "isUnread"> | null | undefined,
) {
  return Boolean(thread?.isUnread);
}

async function parseApiResponse<T>(response: Response, fallbackError: string) {
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

async function fetchThreadDetail(threadId: string) {
  const response = await fetch(`/api/email/threads/${threadId}`, {
    credentials: "include",
  });

  return await parseApiResponse<EmailThreadDetail>(
    response,
    "Failed to load thread",
  );
}

function EmailActorAvatar({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ background: getEmailActorGradient(name, email) }}
      aria-hidden="true"
    >
      {getEmailActorInitials(name, email)}
    </div>
  );
}

export function EmailThreadModal({
  open,
  threadId,
  projects,
  hideEmailSignatures = true,
  onOpenChange,
  onRefresh,
}: EmailThreadModalProps) {
  const [thread, setThread] = useState<EmailThreadDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [selectedReplyDraftId, setSelectedReplyDraftId] = useState<
    string | null
  >(null);
  const [scheduledReplyAt, setScheduledReplyAt] = useState("");
  const [replyStyleOverrideEnabled, setReplyStyleOverrideEnabled] =
    useState(false);
  const [replyStyleOverrides, setReplyStyleOverrides] =
    useState<EmailReplySettings>(DEFAULT_EMAIL_REPLY_SETTINGS);
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<ThreadAction | null>(null);
  const [queuedAction, setQueuedAction] = useState<ThreadAction | null>(null);
  const [isQueuedActionNoticeVisible, setIsQueuedActionNoticeVisible] =
    useState(false);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  const { profile } = useUserProfile();
  const { preferences } = useUserPreferences();
  const deleteUndoSeconds = clampEmailDeleteUndoSeconds(
    profile?.email_delete_undo_seconds,
  );

  const sortedInboxProjects = useMemo(
    () => sortInboxProjects(projects),
    [projects],
  );
  const filteredInboxProjects = useMemo(
    () => filterInboxProjects(sortedInboxProjects, projectSearchQuery),
    [projectSearchQuery, sortedInboxProjects],
  );
  const selectedProjectId = getThreadProjectId(thread);
  const selectedProject = useMemo(
    () =>
      sortedInboxProjects.find((project) => project.id === selectedProjectId) ||
      null,
    [selectedProjectId, sortedInboxProjects],
  );
  const primaryThreadEntry = getPrimaryThreadRenderEntry(thread?.conversation);
  const primaryThreadAttachments =
    getDisplayableThreadAttachments(primaryThreadEntry);
  const conversationEntries = getConversationEntriesExcludingPrimary(
    thread?.conversation,
  );

  useEffect(() => {
    setReplyStyleOverrides(
      normalizeEmailReplySettings(preferences?.email_reply_settings),
    );
  }, [preferences?.email_reply_settings]);

  useEffect(() => {
    if (!open || !threadId) {
      setThread(null);
      setLoadingThread(false);
      setBusyState(null);
      setStatusMessage(null);
      setPendingConfirmAction(null);
      setQueuedAction(null);
      setIsQueuedActionNoticeVisible(false);
      setReplyContent("");
      setReplyMode("reply_all");
      setIsProjectPickerOpen(false);
      setProjectSearchQuery("");
      return;
    }

    let cancelled = false;
    setLoadingThread(true);
    setStatusMessage(null);

    fetchThreadDetail(threadId)
      .then((payload) => {
        if (!cancelled) {
          setThread(payload);
          if (payload.activeReplyDraft) {
            setSelectedReplyDraftId(payload.activeReplyDraft.id);
            setReplyMode(payload.activeReplyDraft.replyMode);
            setReplyContent(
              payload.activeReplyDraft.contentHtml ||
                payload.activeReplyDraft.contentText ||
                "",
            );
            setScheduledReplyAt(
              payload.activeReplyDraft.scheduledFor
                ? new Date(payload.activeReplyDraft.scheduledFor)
                    .toISOString()
                    .slice(0, 16)
                : "",
            );
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setThread(null);
          setStatusMessage(
            error instanceof Error ? error.message : "Failed to load thread",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingThread(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  useEffect(() => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
    setReplyContent("");
    setSelectedReplyDraftId(null);
    setScheduledReplyAt("");
    setReplyMode("reply_all");
    setPendingConfirmAction(null);
    setQueuedAction(null);
    setIsQueuedActionNoticeVisible(false);
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (queuedActionTimeoutRef.current !== null) {
        window.clearTimeout(queuedActionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isProjectPickerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        projectPickerRef.current &&
        !projectPickerRef.current.contains(event.target as Node)
      ) {
        setIsProjectPickerOpen(false);
        setProjectSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isProjectPickerOpen]);

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const clearQueuedAction = () => {
    if (queuedActionTimeoutRef.current !== null) {
      window.clearTimeout(queuedActionTimeoutRef.current);
      queuedActionTimeoutRef.current = null;
    }
    setQueuedAction(null);
    setIsQueuedActionNoticeVisible(false);
  };

  const refreshParent = async () => {
    await onRefresh?.();
  };

  const reloadThread = async (targetThreadId: string) => {
    setLoadingThread(true);

    try {
      const payload = await fetchThreadDetail(targetThreadId);
      setThread(payload);
      if (payload.activeReplyDraft) {
        setSelectedReplyDraftId(payload.activeReplyDraft.id);
        setReplyMode(payload.activeReplyDraft.replyMode);
        setReplyContent(
          payload.activeReplyDraft.contentHtml ||
            payload.activeReplyDraft.contentText ||
            "",
        );
        setScheduledReplyAt(
          payload.activeReplyDraft.scheduledFor
            ? new Date(payload.activeReplyDraft.scheduledFor)
                .toISOString()
                .slice(0, 16)
            : "",
        );
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to load thread",
      );
    } finally {
      setLoadingThread(false);
    }
  };

  const closeProjectPicker = () => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
  };

  const handleProjectAssign = async (projectId: string) => {
    if (!threadId) return;

    setBusyState("project");

    try {
      const response = await fetch(`/api/email/threads/${threadId}/project`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId }),
      });

      await parseApiResponse(response, "Failed to assign project");
      closeProjectPicker();
      await refreshParent();
      await reloadThread(threadId);
      updateStatus("Project assigned.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to assign project",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleProjectPickerSelect = (projectId: string) => {
    closeProjectPicker();

    if (projectId !== selectedProjectId) {
      void handleProjectAssign(projectId);
    }
  };

  const handleGenerateTasks = async () => {
    if (!threadId) return;

    setBusyState("tasks");

    try {
      const response = await fetch(`/api/email/threads/${threadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProjectId || null,
        }),
      });

      const payload = await parseApiResponse<any[]>(
        response,
        "Failed to generate tasks",
      );

      await refreshParent();
      await reloadThread(threadId);
      updateStatus(
        `Generated ${payload.length || 0} task${payload.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to generate tasks",
      );
    } finally {
      setBusyState(null);
    }
  };

  const ensureComposerDraft = async () => {
    if (!threadId) {
      throw new Error("Choose a thread before saving a draft.");
    }

    const payload = {
      source: "manual",
      replyMode,
      subject: "",
      contentText: replyContent,
      contentHtml: replyContent,
    };

    if (selectedReplyDraftId) {
      const response = await fetch(
        `/api/email/reply-drafts/${selectedReplyDraftId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      return parseApiResponse<EmailReplyDraft>(
        response,
        "Failed to update reply draft",
      );
    }

    const response = await fetch(
      `/api/email/threads/${threadId}/reply-drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );

    return parseApiResponse<EmailReplyDraft>(response, "Failed to save draft");
  };

  const handleReply = async () => {
    if (!threadId || !replyContent.trim()) return;

    setBusyState("reply");

    try {
      const draft = await ensureComposerDraft();
      const response = await fetch(`/api/email/reply-drafts/${draft.id}/send`, {
        method: "POST",
        credentials: "include",
      });

      await parseApiResponse(response, "Failed to send reply");
      setReplyContent("");
      setSelectedReplyDraftId(null);
      setScheduledReplyAt("");
      await refreshParent();
      await reloadThread(threadId);
      updateStatus(
        replyMode === "internal_note" ? "Internal note saved." : "Reply sent.",
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to send reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleScheduleReply = async () => {
    if (!threadId || !replyContent.trim() || !scheduledReplyAt) return;

    setBusyState("reply_schedule");

    try {
      const draft = await ensureComposerDraft();
      const response = await fetch(
        `/api/email/reply-drafts/${draft.id}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            scheduledFor: new Date(scheduledReplyAt).toISOString(),
          }),
        },
      );

      const payload = await parseApiResponse<EmailReplyDraft>(
        response,
        "Failed to schedule reply",
      );
      setSelectedReplyDraftId(payload.id);
      await refreshParent();
      await reloadThread(threadId);
      updateStatus("Reply scheduled.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to schedule reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleGenerateAiReply = async () => {
    if (!threadId) return;

    setBusyState("reply_ai");

    try {
      const response = await fetch(
        `/api/email/threads/${threadId}/reply/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            override: replyStyleOverrideEnabled ? replyStyleOverrides : null,
          }),
        },
      );

      const payload = await parseApiResponse<EmailReplyDraft>(
        response,
        "Failed to generate AI reply",
      );
      setSelectedReplyDraftId(payload.id);
      setReplyMode(payload.replyMode);
      setReplyContent(payload.contentHtml || payload.contentText || "");
      setScheduledReplyAt(
        payload.scheduledFor
          ? new Date(payload.scheduledFor).toISOString().slice(0, 16)
          : "",
      );
      await refreshParent();
      await reloadThread(threadId);
      updateStatus("AI reply drafted.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to generate AI reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const executeThreadAction = async (action: ThreadAction) => {
    if (!threadId) return;

    setBusyState(action);

    try {
      const response = await fetch(`/api/email/threads/${threadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });

      await parseApiResponse(response, "Failed to apply thread action");
      await refreshParent();

      if (shouldCloseEmailThreadModalAfterAction(action)) {
        onOpenChange(false);
        return;
      }

      await reloadThread(threadId);
      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to apply action",
      );
    } finally {
      setBusyState(null);
    }
  };

  const queueThreadAction = (action: ThreadAction) => {
    const undoSeconds =
      action === "delete"
        ? deleteUndoSeconds
        : DEFAULT_THREAD_ACTION_QUEUE_SECONDS;

    clearQueuedAction();
    setPendingConfirmAction(null);
    setQueuedAction(action);
    setIsQueuedActionNoticeVisible(true);
    setStatusMessage(getQueuedThreadActionMessage(action, undoSeconds));
    queuedActionTimeoutRef.current = window.setTimeout(() => {
      queuedActionTimeoutRef.current = null;
      setQueuedAction(null);
      setIsQueuedActionNoticeVisible(false);
      void executeThreadAction(action);
    }, undoSeconds * 1000);
  };

  const handleUndoQueuedAction = () => {
    const action = queuedAction;
    clearQueuedAction();
    setPendingConfirmAction(null);
    if (action) {
      updateStatus(`${getThreadActionLabel(action)} canceled.`);
    }
  };

  const handleDismissQueuedAction = () => {
    setIsQueuedActionNoticeVisible(false);
  };

  const handleThreadAction = (action: ThreadAction) => {
    if (queuedAction) {
      return;
    }

    if (requiresThreadActionConfirmation(action)) {
      setPendingConfirmAction((current) =>
        current === action ? null : action,
      );
      return;
    }

    void executeThreadAction(action);
  };

  const renderThreadActionButton = (
    action: ThreadAction,
    options: {
      icon: ReactNode;
      label?: string;
      destructive?: boolean;
    },
  ) => {
    const isPendingConfirm = pendingConfirmAction === action;
    const isQueued = queuedAction === action;
    const isBusy = busyState === action;
    const label = options.label ?? getThreadActionLabel(action);
    const baseClassName = options.destructive
      ? "inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
      : "inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50";

    if (isPendingConfirm) {
      return (
        <div key={action} className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => queueThreadAction(action)}
            disabled={Boolean(busyState) || Boolean(queuedAction)}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/15 px-3 py-2 text-sm text-white transition-colors hover:border-[rgb(var(--theme-primary-rgb))]/70 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setPendingConfirmAction(null)}
            disabled={Boolean(busyState) || Boolean(queuedAction)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      );
    }

    return (
      <button
        key={action}
        type="button"
        onClick={() => handleThreadAction(action)}
        disabled={Boolean(busyState) || Boolean(queuedAction)}
        className={baseClassName}
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : options.icon}
        {isQueued ? `${label} queued` : label}
      </button>
    );
  };

  const handleOpenThreadWindow = () => {
    if (!threadId || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.searchParams.set("threadId", threadId);
    url.searchParams.set("emailPopout", "1");

    window.open(
      url.toString(),
      `email-thread-${threadId}`,
      "popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes",
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,72rem)] max-w-[72rem] overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-white sm:max-h-[92vh] sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {thread?.subject
            ? formatEmailSubject(thread.subject)
            : "Email thread"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Review an email thread from Today in a modal.
        </DialogDescription>

        <div className="max-h-[92vh] overflow-y-auto p-6">
          {loadingThread ? (
            <div className="flex min-h-[420px] items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : thread ? (
            <div className="space-y-5">
              <div className="border-b border-zinc-800 pb-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      {thread.status}
                      {canMarkThreadAsRead(thread) ? (
                        <span className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/35 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-[10px] tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-xl font-semibold text-white">
                      {formatEmailSubject(thread.subject)}
                    </h2>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                      <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>AI Summary:</span>
                      </div>
                      {shouldShowSecondaryActionTitle(
                        thread.actionTitle,
                        thread.subject,
                      ) && thread.actionTitle ? (
                        <div className="mb-3 break-words text-sm text-zinc-400">
                          {thread.actionTitle}
                        </div>
                      ) : null}
                      {primaryThreadEntry?.contentHtml ||
                      primaryThreadEntry?.content ? (
                        <EmailSignatureContent
                          html={primaryThreadEntry?.contentHtml}
                          text={primaryThreadEntry?.content}
                          hideSignatures={hideEmailSignatures}
                          contentClassName="break-words text-sm leading-6 text-zinc-200"
                          signatureClassName="break-words text-sm leading-6 text-zinc-200 opacity-90"
                        />
                      ) : (
                        <div className="break-words text-sm text-zinc-400">
                          {thread.summaryText ||
                            thread.previewText ||
                            "No message body available yet."}
                        </div>
                      )}
                      <EmailThreadAttachments
                        attachments={primaryThreadAttachments}
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-2 xl:max-w-[240px]">
                    {renderThreadActionButton("quarantine", {
                      icon: <ShieldAlert className="h-4 w-4" />,
                    })}
                    {renderThreadActionButton("archive", {
                      icon: <Archive className="h-4 w-4" />,
                    })}
                    {renderThreadActionButton("spam", {
                      icon: <ShieldAlert className="h-4 w-4" />,
                    })}
                    {renderThreadActionButton("delete", {
                      icon: <Trash2 className="h-4 w-4" />,
                      destructive: true,
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div ref={projectPickerRef} className="relative pt-2">
                  <FloatingFieldLabel label="Project" />
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={projectSearchQuery}
                      onFocus={() => setIsProjectPickerOpen(true)}
                      onChange={(event) => {
                        setProjectSearchQuery(event.target.value);
                        setIsProjectPickerOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          closeProjectPicker();
                          return;
                        }

                        if (
                          event.key === "Enter" &&
                          filteredInboxProjects.length > 0
                        ) {
                          event.preventDefault();
                          handleProjectPickerSelect(
                            filteredInboxProjects[0].id,
                          );
                        }
                      }}
                      placeholder={
                        selectedProject
                          ? `Search projects… Current: ${selectedProject.name}`
                          : "Search projects..."
                      }
                      disabled={busyState === "project"}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setIsProjectPickerOpen((current) => !current)
                      }
                      className="absolute inset-y-0 right-3 inline-flex items-center text-zinc-500 transition-colors hover:text-zinc-300"
                      aria-label="Toggle project search"
                    >
                      {busyState === "project" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isProjectPickerOpen ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>
                  </div>
                  {selectedProject ? (
                    <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-300">
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: selectedProject.color }}
                      />
                      <span className="truncate">{selectedProject.name}</span>
                    </div>
                  ) : null}
                  {isProjectPickerOpen ? (
                    <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                      {filteredInboxProjects.length > 0 ? (
                        filteredInboxProjects.map((project) => {
                          const isSelected = project.id === selectedProjectId;

                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() =>
                                handleProjectPickerSelect(project.id)
                              }
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                                  : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                              }`}
                            >
                              <div
                                className="h-3 w-3 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="flex-1 truncate">
                                {project.name}
                              </span>
                              {isSelected ? (
                                <Check className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No matching projects
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleGenerateTasks}
                  disabled={busyState === "tasks"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  <FolderSearch className="h-4 w-4" />
                  Generate Tasks
                </button>
              </div>

              <div className="flex justify-end pt-1">
                {pendingConfirmAction === "delete" ? (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => queueThreadAction("delete")}
                      disabled={Boolean(busyState) || Boolean(queuedAction)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:border-red-700 hover:text-white disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingConfirmAction(null)}
                      disabled={Boolean(busyState) || Boolean(queuedAction)}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleThreadAction("delete")}
                    disabled={Boolean(busyState) || Boolean(queuedAction)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Email
                  </button>
                )}
              </div>

              {queuedAction && isQueuedActionNoticeVisible ? (
                <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--theme-primary-rgb))]/30 bg-[rgb(var(--theme-primary-rgb))]/10 px-3 py-2 text-sm text-zinc-200">
                  <span>
                    {getQueuedThreadActionMessage(
                      queuedAction,
                      queuedAction === "delete"
                        ? deleteUndoSeconds
                        : DEFAULT_THREAD_ACTION_QUEUE_SECONDS,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleUndoQueuedAction}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:border-zinc-600"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissQueuedAction}
                    className="rounded-md border border-zinc-700/80 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              {thread.linkedTasks?.length ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                    Linked Tasks
                  </div>
                  <div className="space-y-2">
                    {thread.linkedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                      >
                        {task.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setReplyStyleOverrideEnabled((current) => !current)
                    }
                    className={cn(
                      "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
                      replyStyleOverrideEnabled
                        ? "border-theme-primary bg-zinc-800 text-white"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white",
                    )}
                  >
                    AI Style Override
                  </button>
                  <Tooltip content="Generate AI reply" className="w-auto">
                    <button
                      type="button"
                      onClick={() => void handleGenerateAiReply()}
                      disabled={Boolean(busyState) || !threadId}
                      title="Generate AI reply"
                      aria-label="Generate AI reply"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {busyState === "reply_ai" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content="Separate window" className="w-auto">
                    <button
                      type="button"
                      onClick={handleOpenThreadWindow}
                      disabled={!threadId}
                      title="Open thread in separate window"
                      aria-label="Open thread in separate window"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Mark read" className="w-auto">
                    <button
                      type="button"
                      onClick={() => void handleThreadAction("mark_read")}
                      disabled={
                        Boolean(busyState) || !canMarkThreadAsRead(thread)
                      }
                      title={
                        canMarkThreadAsRead(thread)
                          ? "Mark thread as read"
                          : "Thread already read"
                      }
                      aria-label={
                        canMarkThreadAsRead(thread)
                          ? "Mark thread as read"
                          : "Thread already read"
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {busyState === "mark_read" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MailCheck className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                  {selectedReplyDraftId ? (
                    <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
                      Draft active
                    </div>
                  ) : null}
                  <div className="relative pt-2">
                    <FloatingFieldLabel label="Reply Mode" />
                    <Select
                      value={replyMode}
                      onValueChange={(value) =>
                        setReplyMode(value as "reply_all" | "internal_note")
                      }
                    >
                      <SelectTrigger className="h-9 w-[180px] border-zinc-700 bg-zinc-900 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reply_all">Reply All</SelectItem>
                        <SelectItem value="internal_note">
                          Internal Note
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {replyStyleOverrideEnabled ? (
                  <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                      Reply Style Override
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Conciseness
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_CONCISENESS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  conciseness: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.conciseness === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Tone
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_TONE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  tone: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.tone === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Personality
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_PERSONALITY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  personality: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.personality === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="space-y-3">
                  <textarea
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    rows={5}
                    placeholder={
                      replyMode === "internal_note"
                        ? "Write an internal note for linked Forge tasks…"
                        : "Reply to all participants…"
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white transition-[height] duration-200"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {replyMode === "reply_all" ? (
                      <div className="relative min-w-[220px] flex-1 pt-2">
                        <FloatingFieldLabel label="Send Later" />
                        <input
                          type="datetime-local"
                          value={scheduledReplyAt}
                          onChange={(event) =>
                            setScheduledReplyAt(event.target.value)
                          }
                          className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                        />
                      </div>
                    ) : null}
                    {replyMode === "reply_all" ? (
                      <button
                        type="button"
                        onClick={() => void handleScheduleReply()}
                        disabled={
                          busyState === "reply_schedule" || !replyContent.trim()
                        }
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                      >
                        {busyState === "reply_schedule" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MailPlus className="h-4 w-4" />
                        )}
                        <span>Schedule</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleReply}
                      disabled={busyState === "reply" || !replyContent.trim()}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-theme-gradient px-3 text-sm text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busyState === "reply" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="h-4 w-4" />
                      )}
                      <span>Send Now</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                  Conversation
                </div>
                <div className="space-y-3">
                  {conversationEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <EmailActorAvatar
                          name={entry.authorName}
                          email={entry.authorEmail}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-zinc-100">
                                {getEmailActorName(
                                  entry.authorName,
                                  entry.authorEmail,
                                )}
                              </div>
                              {entry.authorEmail &&
                              entry.authorEmail !== entry.authorName ? (
                                <div className="truncate text-xs text-zinc-500">
                                  {entry.authorEmail}
                                </div>
                              ) : null}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {new Date(entry.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="mt-3">
                            <EmailSignatureContent
                              html={entry.contentHtml}
                              text={entry.content}
                              hideSignatures={hideEmailSignatures}
                              contentClassName="break-words text-sm leading-6 text-zinc-300"
                              signatureClassName="break-words text-sm leading-6 text-zinc-300 opacity-90"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-zinc-500">
              {statusMessage || "Select an email thread to inspect it."}
            </div>
          )}

          {thread && statusMessage ? (
            <div className="mt-5 text-sm text-zinc-400">{statusMessage}</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
