"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Archive,
  ArrowDownUp,
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderSearch,
  GripVertical,
  LayoutTemplate,
  Loader2,
  Mail,
  MailCheck,
  MailPlus,
  Maximize2,
  Minimize2,
  PanelBottom,
  PanelRight,
  Pencil,
  Search,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { EmailThreadAttachments } from "@/components/email-thread-attachments";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tooltip } from "@/components/tooltip";
import { EmailSignatureContent } from "@/components/email-signature-content";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
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
import {
  formatEmailTimestamp,
  formatRelativeEmailDate,
} from "@/lib/email-inbox/format-timestamp";
import {
  DEFAULT_EMAIL_CONVERSATION_ORDER,
  normalizeEmailConversationOrder,
  type EmailConversationOrder,
} from "@/lib/email-inbox/panel-width";
import {
  areAllThreadMessagesExpanded,
  isThreadMessageExpanded,
  loadThreadExpandState,
  saveThreadExpandState,
  toggleThreadMessageExpanded,
  type ThreadExpandState,
} from "@/lib/email-inbox/thread-expand-state";
import { stripQuotedAndSignature } from "@/lib/email-inbox/strip-quoted";
import { useUserPreferences, useUserProfile } from "@/lib/supabase/hooks";
import {
  DEFAULT_EMAIL_REPLY_SETTINGS,
  EMAIL_REPLY_CONCISENESS_OPTIONS,
  EMAIL_REPLY_PERSONALITY_OPTIONS,
  EMAIL_REPLY_TONE_OPTIONS,
  normalizeEmailReplySettings,
  type EmailReplySettings,
} from "@/lib/email-inbox/reply-settings";
import {
  getEmailHtmlRenderModeToggleLabel,
  normalizeEmailHtmlRenderMode,
  type EmailHtmlRenderMode,
} from "@/lib/email-html-render-mode";
import {
  EMAIL_THREAD_DISPLAY_MODE_OPTIONS,
  isDockedEmailThreadDisplayMode,
  loadEmailThreadDisplayMode,
  saveEmailThreadDisplayMode,
  type EmailThreadDisplayMode,
} from "@/lib/email-thread-display-mode";
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
  /**
   * Opens the full task edit modal for a linked task. Wired by the parent view
   * (it owns the TaskModal/EditTaskModal). When omitted, the Edit button on a
   * linked task is hidden.
   */
  onEditTask?: (taskId: string) => void | Promise<void>;
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

/** Collapse a message body to a single-line preview for the collapsed row. */
function getThreadEntryPreview(
  entry: Pick<ConversationEntry, "content" | "contentHtml">,
  maxLength = 140,
): string {
  const source = entry.contentHtml || entry.content || "";
  const asText = source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<blockquote[^>]*>/gi, "\n>")
    .replace(/<[^>]+>/g, " ");
  const flattened = stripQuotedAndSignature(asText)
    .replace(/\s+/g, " ")
    .trim();

  if (!flattened) {
    return "No preview available.";
  }

  return flattened.length <= maxLength
    ? flattened
    : `${flattened.slice(0, maxLength).trimEnd()}…`;
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
  onEditTask,
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
  const [emailHtmlRenderMode, setEmailHtmlRenderMode] =
    useState<EmailHtmlRenderMode>("preserve");
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // Sticky error for reply send/schedule failures. Unlike transient
  // status toasts (auto-cleared after 2.4s), this stays visible until the
  // user retries or edits, so SMTP/auth failures are never silently lost.
  const [replyError, setReplyError] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<ThreadAction | null>(null);
  const [queuedAction, setQueuedAction] = useState<ThreadAction | null>(null);
  const [isQueuedActionNoticeVisible, setIsQueuedActionNoticeVisible] =
    useState(false);
  const [displayMode, setDisplayMode] =
    useState<EmailThreadDisplayMode>("centered");
  // Which tab the AI Summary panel shows: the AI summary text or linked tasks.
  const [summaryPanelTab, setSummaryPanelTab] = useState<
    "summary" | "linked_tasks"
  >("summary");
  // Linked task delete confirmation + per-row busy state.
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(
    null,
  );
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  // Per-thread collapse memory: which conversation messages are expanded.
  // Restored from (and persisted to) localStorage keyed by thread id.
  const [threadExpandState, setThreadExpandState] = useState<ThreadExpandState>(
    () => new Set<string>(),
  );
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  const { profile, updateProfile } = useUserProfile();
  const { preferences } = useUserPreferences();
  // Per-user Conversation ordering. Persisted on the profiles row; falls back
  // to the classic "oldest first" default before the profile loads.
  const conversationOrder: EmailConversationOrder = profile
    ? normalizeEmailConversationOrder(profile.email_conversation_order)
    : DEFAULT_EMAIL_CONVERSATION_ORDER;
  const handleToggleConversationOrder = () => {
    if (!updateProfile) return;
    const next: EmailConversationOrder =
      conversationOrder === "oldest_first" ? "newest_first" : "oldest_first";
    void updateProfile({ email_conversation_order: next });
  };
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
  // Ordered, de-duped list of project ids associated with this thread. The
  // server is the source of truth (thread.projectIds, backed by the
  // email_thread_projects join table); the primary project_id is always first.
  const associatedProjectIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedProjectId) ids.push(selectedProjectId);
    for (const id of thread?.projectIds || []) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [selectedProjectId, thread?.projectIds]);
  const associatedProjects = useMemo(
    () =>
      associatedProjectIds
        .map((id) => sortedInboxProjects.find((project) => project.id === id))
        .filter((project): project is Project => Boolean(project)),
    [associatedProjectIds, sortedInboxProjects],
  );
  // The reply composer now emits HTML, so "empty" is e.g. "<p></p>". Strip tags
  // and entities to decide whether there is real content to send/schedule.
  const hasReplyText = useMemo(() => {
    const text = replyContent
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
    return text.length > 0;
  }, [replyContent]);
  const primaryThreadEntry = getPrimaryThreadRenderEntry(thread?.conversation);
  const primaryThreadAttachments =
    getDisplayableThreadAttachments(primaryThreadEntry);
  const conversationEntries = getConversationEntriesExcludingPrimary(
    thread?.conversation,
  );
  // Real AI summary for the thread. Prefer the AI-generated summaryText; fall
  // back to the secondary action title when it adds info beyond the subject.
  const aiSummaryText =
    thread?.summaryText?.trim() ||
    (thread &&
    shouldShowSecondaryActionTitle(thread.actionTitle, thread.subject) &&
    thread.actionTitle?.trim()
      ? thread.actionTitle.trim()
      : "");

  const conversationEntryIds = useMemo(
    () => conversationEntries.map((entry) => entry.id),
    [conversationEntries],
  );
  // Entries in the order the user wants to read them. "Newest First" simply
  // reverses the chronological (oldest-first) list the server returns.
  const orderedConversationEntries = useMemo(
    () =>
      conversationOrder === "newest_first"
        ? [...conversationEntries].reverse()
        : conversationEntries,
    [conversationEntries, conversationOrder],
  );
  const allConversationExpanded = areAllThreadMessagesExpanded(
    threadExpandState,
    conversationEntryIds,
  );

  // Restore per-thread expand memory whenever the modal opens for a thread, so
  // an "Expand All" (or per-message) choice survives navigation and reloads.
  useEffect(() => {
    if (!open || !threadId) {
      setThreadExpandState(new Set<string>());
      return;
    }
    setThreadExpandState(loadThreadExpandState(threadId));
  }, [open, threadId]);

  const persistThreadExpandState = (next: ThreadExpandState) => {
    setThreadExpandState(next);
    if (threadId) {
      saveThreadExpandState(threadId, next);
    }
  };

  const handleToggleThreadMessage = (messageId: string) => {
    persistThreadExpandState(
      toggleThreadMessageExpanded(
        threadExpandState,
        messageId,
        conversationEntryIds,
      ),
    );
  };

  const handleToggleExpandAll = () => {
    persistThreadExpandState(
      allConversationExpanded ? new Set<string>() : "all",
    );
  };

  // Restore the persisted default display mode (centered / docked-right /
  // docked-bottom) on mount.
  useEffect(() => {
    setDisplayMode(loadEmailThreadDisplayMode());
  }, []);

  // Changing the mode from the modal header applies immediately AND updates the
  // saved default preference so it sticks across threads and reloads.
  const handleSelectDisplayMode = (mode: EmailThreadDisplayMode) => {
    setDisplayMode(mode);
    saveEmailThreadDisplayMode(mode);
  };

  const isDocked = isDockedEmailThreadDisplayMode(displayMode);

  // --- Docked-right panel resize ----------------------------------------
  // The docked-right reading pane can be widened by dragging a grip on its
  // LEFT edge. The chosen width persists in localStorage so it survives
  // navigation and logout on this device. Below the `sm` breakpoint the panel
  // is a full-screen sheet, so the inline width (and grip) only apply at sm+.
  const DOCKED_WIDTH_STORAGE_KEY = "email-thread-docked-width-px";
  const DOCKED_MIN_WIDTH = 360;
  const panelContentRef = useRef<HTMLDivElement | null>(null);
  const [isWideViewport, setIsWideViewport] = useState(false);
  const [dockedWidthPx, setDockedWidthPx] = useState<number | null>(null);

  const clampDockedWidth = (width: number) => {
    const viewportWidth =
      typeof window === "undefined" ? 1280 : window.innerWidth;
    const max = Math.round(viewportWidth * 0.96);
    return Math.min(max, Math.max(DOCKED_MIN_WIDTH, Math.round(width)));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsWideViewport(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DOCKED_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setDockedWidthPx(clampDockedWidth(parsed));
    }
  }, []);

  const persistDockedWidth = (width: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DOCKED_WIDTH_STORAGE_KEY, String(width));
  };

  const handleDockedResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);

    let latestWidth = dockedWidthPx ?? panelContentRef.current?.clientWidth ?? DOCKED_MIN_WIDTH;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      // Panel is docked to the viewport's right edge, so its width is the gap
      // between the pointer and the right edge.
      latestWidth = clampDockedWidth(window.innerWidth - moveEvent.clientX);
      setDockedWidthPx(latestWidth);
    };

    const handlePointerUp = () => {
      document.body.classList.remove("cursor-col-resize");
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      persistDockedWidth(latestWidth);
    };

    document.body.classList.add("cursor-col-resize");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const isDockedRightResizable =
    displayMode === "docked-right" && isWideViewport;
  const dockedRightStyle =
    isDockedRightResizable && dockedWidthPx
      ? { width: `${dockedWidthPx}px`, maxWidth: "96vw" }
      : undefined;

  useEffect(() => {
    setReplyStyleOverrides(
      normalizeEmailReplySettings(preferences?.email_reply_settings),
    );
  }, [preferences?.email_reply_settings]);

  useEffect(() => {
    setEmailHtmlRenderMode(
      normalizeEmailHtmlRenderMode(preferences?.default_email_html_render_mode),
    );
  }, [preferences?.default_email_html_render_mode]);

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
    setReplyError(null);
    setPendingDeleteTaskId(null);
    setTaskBusyId(null);
    setSummaryPanelTab("summary");
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

  const handleProjectPickerSelect = (projectId: string) => {
    closeProjectPicker();

    if (associatedProjectIds.includes(projectId)) {
      return;
    }

    // Every chip is now persisted via the join table. Adding a chip POSTs to
    // /projects; the server promotes it to primary if none exists yet.
    void handleAddProjectLink(projectId);
  };

  const handleAddProjectLink = async (projectId: string) => {
    if (!threadId) return;

    setBusyState("project");

    try {
      const response = await fetch(`/api/email/threads/${threadId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId }),
      });

      await parseApiResponse(response, "Failed to add project");
      await refreshParent();
      await reloadThread(threadId);
      updateStatus("Project added.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to add project",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleRemoveProjectChip = async (projectId: string) => {
    if (!threadId) return;

    setBusyState("project");

    try {
      const response = await fetch(`/api/email/threads/${threadId}/projects`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId }),
      });

      await parseApiResponse(response, "Failed to remove project");
      await refreshParent();
      await reloadThread(threadId);
      updateStatus("Project removed.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to remove project",
      );
    } finally {
      setBusyState(null);
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

  const handleEditLinkedTask = (taskId: string) => {
    if (!onEditTask) return;
    void onEditTask(taskId);
  };

  const handleDeleteLinkedTask = async (taskId: string) => {
    setTaskBusyId(taskId);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      await parseApiResponse(response, "Failed to delete task");
      setPendingDeleteTaskId(null);
      await refreshParent();
      if (threadId) {
        await reloadThread(threadId);
      }
      updateStatus("Task deleted.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to delete task",
      );
    } finally {
      setTaskBusyId(null);
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
    if (!threadId || !hasReplyText) return;

    setBusyState("reply");
    setReplyError(null);

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
      const message =
        error instanceof Error ? error.message : "Failed to send reply";
      setReplyError(message);
      updateStatus(message);
    } finally {
      setBusyState(null);
    }
  };

  const handleScheduleReply = async () => {
    if (!threadId || !hasReplyText || !scheduledReplyAt) return;

    setBusyState("reply_schedule");
    setReplyError(null);

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
      const message =
        error instanceof Error ? error.message : "Failed to schedule reply";
      setReplyError(message);
      updateStatus(message);
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
    const iconButtonClassName = options.destructive
      ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/40 text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
      : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50";

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
      <Tooltip
        key={action}
        content={isQueued ? `${label} queued` : label}
        className="w-auto"
        side="bottom"
        align="end"
      >
        <button
          type="button"
          onClick={() => handleThreadAction(action)}
          disabled={Boolean(busyState) || Boolean(queuedAction)}
          aria-label={label}
          title={label}
          className={iconButtonClassName}
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : options.icon}
        </button>
      </Tooltip>
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
    <Dialog open={open} onOpenChange={onOpenChange} modal={!isDocked}>
      <DialogPortal>
        {/* Docked modes never render the backdrop, so the app stays usable. */}
        {isDocked ? null : <DialogOverlay />}
        <DialogPrimitive.Content
          ref={panelContentRef}
          style={dockedRightStyle}
          // When docked, don't steal focus back to the panel so the user can
          // keep typing in the app behind it.
          onOpenAutoFocus={isDocked ? (event) => event.preventDefault() : undefined}
          onInteractOutside={
            isDocked ? (event) => event.preventDefault() : undefined
          }
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-white shadow-2xl outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            displayMode === "docked-right" &&
              // Full-screen sheet on small phones; docked side panel at sm+.
              "inset-0 h-full w-full max-w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:w-[max(480px,40vw)] sm:max-w-[96vw] sm:rounded-l-2xl",
            displayMode === "docked-bottom" &&
              // Near-full-screen sheet on small phones (a 50vh dock is too
              // cramped to read a thread on a phone); short bottom dock at sm+.
              "inset-x-0 bottom-0 top-0 h-full w-full border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:top-auto sm:h-[50vh] sm:rounded-t-2xl",
            displayMode === "centered" &&
              // Full-screen sheet on small phones; centered card at sm+.
              "inset-0 h-full w-full max-w-full rounded-none border-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-[min(96vw,52rem)] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
          )}
        >
          {/* Drag bumper on the LEFT edge of the docked-right panel,
              vertically centered. Drag to widen/narrow the reading pane; the
              width persists across navigation and logout (localStorage). */}
          {isDockedRightResizable ? (
            <button
              type="button"
              onPointerDown={handleDockedResizeStart}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next = clampDockedWidth(
                    (dockedWidthPx ??
                      panelContentRef.current?.clientWidth ??
                      DOCKED_MIN_WIDTH) + 24,
                  );
                  setDockedWidthPx(next);
                  persistDockedWidth(next);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  const next = clampDockedWidth(
                    (dockedWidthPx ??
                      panelContentRef.current?.clientWidth ??
                      DOCKED_MIN_WIDTH) - 24,
                  );
                  setDockedWidthPx(next);
                  persistDockedWidth(next);
                }
              }}
              className="group absolute inset-y-0 left-0 z-20 flex w-3 cursor-col-resize items-center justify-center outline-none"
              aria-label="Resize thread panel"
              title="Drag to resize the thread panel"
              role="separator"
              aria-orientation="vertical"
            >
              {/* Slim always-visible vertical pill spanning the edge, plus a
                  centered grip icon for clear affordance. */}
              <span className="absolute inset-y-0 left-0 w-0.5 bg-zinc-800 transition-colors group-hover:bg-zinc-600 group-focus-visible:bg-zinc-600" />
              <span className="relative z-10 flex h-10 w-5 items-center justify-center rounded-r-md border border-l-0 border-zinc-800 bg-zinc-900 text-zinc-500 shadow transition-colors group-hover:border-zinc-600 group-hover:text-zinc-200 group-focus-visible:text-zinc-200">
                <GripVertical className="h-4 w-4" />
              </span>
            </button>
          ) : null}

          <DialogTitle className="sr-only">
            {thread?.subject
              ? formatEmailSubject(thread.subject)
              : "Email thread"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review an email thread from Today in a modal.
          </DialogDescription>

          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-6 py-3">
            <div className="min-w-0 truncate text-sm font-medium text-zinc-300">
              {thread?.subject
                ? formatEmailSubject(thread.subject)
                : "Email thread"}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {conversationEntries.length > 0 ? (
                <Tooltip
                  content={
                    allConversationExpanded
                      ? "Collapse all messages"
                      : "Expand all messages"
                  }
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={handleToggleExpandAll}
                    aria-label={
                      allConversationExpanded
                        ? "Collapse all messages"
                        : "Expand all messages"
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    {allConversationExpanded ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {allConversationExpanded ? "Collapse All" : "Expand All"}
                    </span>
                  </button>
                </Tooltip>
              ) : null}
              <div
                role="group"
                aria-label="Thread display mode"
                className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5"
              >
                {EMAIL_THREAD_DISPLAY_MODE_OPTIONS.map((option) => {
                  const isActive = displayMode === option.value;
                  const Icon =
                    option.value === "centered"
                      ? Maximize2
                      : option.value === "docked-right"
                        ? PanelRight
                        : PanelBottom;

                  return (
                    <Tooltip
                      key={option.value}
                      content={option.label}
                      className="w-auto"
                      side="bottom"
                      align="end"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectDisplayMode(option.value)}
                        aria-label={option.label}
                        aria-pressed={isActive}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                          isActive
                            ? "bg-zinc-700 text-white"
                            : "text-zinc-400 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
          {loadingThread ? (
            <div className="flex min-h-[420px] items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : thread ? (
            <div className="space-y-5">
              <div className="border-b border-zinc-800 pb-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Header: From (sender) row sits ABOVE the subject + date.
                        Subject line carries an "Active" status badge and an AI
                        icon for quick visual scanning. */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start gap-3">
                        <EmailActorAvatar
                          name={primaryThreadEntry?.authorName}
                          email={primaryThreadEntry?.authorEmail}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            From
                          </div>
                          <div className="truncate text-sm font-medium text-zinc-100">
                            {getEmailActorName(
                              primaryThreadEntry?.authorName,
                              primaryThreadEntry?.authorEmail,
                            )}
                          </div>
                          {primaryThreadEntry?.authorEmail &&
                          primaryThreadEntry.authorEmail !==
                            primaryThreadEntry.authorName ? (
                            <div className="truncate text-xs text-zinc-500">
                              {primaryThreadEntry.authorEmail}
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Sparkles
                              className="h-4 w-4 shrink-0 text-[rgb(var(--theme-primary-rgb))]"
                              aria-hidden
                            />
                            <span className="min-w-0 truncate text-sm font-semibold text-white">
                              {thread.subject
                                ? formatEmailSubject(thread.subject)
                                : "Email thread"}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          </div>
                          {primaryThreadEntry?.createdAt ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {formatEmailTimestamp(
                                primaryThreadEntry.createdAt,
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div
                          role="tablist"
                          aria-label="Summary panel"
                          className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={summaryPanelTab === "summary"}
                            onClick={() => setSummaryPanelTab("summary")}
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                              summaryPanelTab === "summary"
                                ? "bg-zinc-700 text-white"
                                : "text-zinc-400 hover:text-white",
                            )}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>AI Summary</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={summaryPanelTab === "linked_tasks"}
                            onClick={() => setSummaryPanelTab("linked_tasks")}
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                              summaryPanelTab === "linked_tasks"
                                ? "bg-zinc-700 text-white"
                                : "text-zinc-400 hover:text-white",
                            )}
                          >
                            <FolderSearch className="h-3.5 w-3.5" />
                            <span>
                              Linked Tasks
                              {thread.linkedTasks?.length
                                ? ` (${thread.linkedTasks.length})`
                                : ""}
                            </span>
                          </button>
                        </div>
                        {/* Project selector pinned to the top-right of the
                            AI Summary header, with the Generate Tasks AI icon
                            floating to its right. */}
                        <div className="flex w-full items-start gap-2 sm:w-auto">
                        <div
                          ref={projectPickerRef}
                          className="relative w-full sm:w-[240px]"
                        >
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
                              placeholder="Add project..."
                              disabled={busyState === "project"}
                              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
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
                          {associatedProjects.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {associatedProjects.map((project) => (
                                <span
                                  key={project.id}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/70 py-1 pl-3 pr-1.5 text-xs text-zinc-300"
                                >
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: project.color }}
                                  />
                                  <span className="truncate">
                                    {project.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveProjectChip(project.id)
                                    }
                                    disabled={busyState === "project"}
                                    aria-label={`Remove ${project.name}`}
                                    title={`Remove ${project.name}`}
                                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {isProjectPickerOpen ? (
                            <div className="absolute right-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                              {filteredInboxProjects.length > 0 ? (
                                filteredInboxProjects.map((project) => {
                                  const isSelected =
                                    associatedProjectIds.includes(project.id);

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
                                        style={{
                                          backgroundColor: project.color,
                                        }}
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
                        <Tooltip
                          content="Generate tasks from this thread"
                          className="w-auto"
                          side="bottom"
                          align="end"
                        >
                          <button
                            type="button"
                            onClick={() => void handleGenerateTasks()}
                            disabled={busyState === "tasks" || !threadId}
                            aria-label="Generate tasks from this thread"
                            className="mt-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-[rgb(var(--theme-primary-rgb))] transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyState === "tasks" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </button>
                        </Tooltip>
                        </div>
                      </div>
                      {summaryPanelTab === "summary" ? (
                        <div className="break-words text-sm leading-6 text-zinc-300">
                          {aiSummaryText || (
                            <span className="text-zinc-500">
                              No AI summary available yet.
                            </span>
                          )}
                        </div>
                      ) : (
                        <div>
                          {thread.linkedTasks?.length ? (
                            <div className="space-y-2">
                              {thread.linkedTasks.map((task) => {
                                const isConfirmingDelete =
                                  pendingDeleteTaskId === task.id;
                                const isTaskBusy = taskBusyId === task.id;

                                return (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      {task.name}
                                    </span>
                                    {isConfirmingDelete ? (
                                      <div className="flex shrink-0 items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleDeleteLinkedTask(task.id)
                                          }
                                          disabled={isTaskBusy}
                                          className="inline-flex items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-xs text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
                                        >
                                          {isTaskBusy ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <Check className="h-3.5 w-3.5" />
                                          )}
                                          Confirm
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPendingDeleteTaskId(null)
                                          }
                                          disabled={isTaskBusy}
                                          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex shrink-0 items-center gap-1">
                                        {onEditTask ? (
                                          <Tooltip
                                            content="Edit task"
                                            className="w-auto"
                                            side="bottom"
                                            align="end"
                                          >
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleEditLinkedTask(task.id)
                                              }
                                              aria-label="Edit task"
                                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                          </Tooltip>
                                        ) : null}
                                        <Tooltip
                                          content="Delete task"
                                          className="w-auto"
                                          side="bottom"
                                          align="end"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPendingDeleteTaskId(task.id)
                                            }
                                            aria-label="Delete task"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-900/50 bg-red-950/40 text-red-200 transition-colors hover:border-red-800 hover:text-white"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </Tooltip>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-500">
                              No linked tasks yet.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                      <Tooltip
                        content={getEmailHtmlRenderModeToggleLabel(
                          emailHtmlRenderMode,
                        )}
                        className="w-auto"
                        side="bottom"
                        align="end"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setEmailHtmlRenderMode((current) =>
                              current === "preserve" ? "simplified" : "preserve",
                            )
                          }
                          aria-label={getEmailHtmlRenderModeToggleLabel(
                            emailHtmlRenderMode,
                          )}
                          title={getEmailHtmlRenderModeToggleLabel(
                            emailHtmlRenderMode,
                          )}
                          className={cn(
                            "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-zinc-900/80 transition-colors",
                            emailHtmlRenderMode === "simplified"
                              ? "border-theme-primary text-white"
                              : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                          )}
                        >
                          {emailHtmlRenderMode === "simplified" ? (
                            <Sparkles className="h-4 w-4" />
                          ) : (
                            <LayoutTemplate className="h-4 w-4" />
                          )}
                        </button>
                      </Tooltip>
                      <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        <Mail className="h-3.5 w-3.5" />
                        <span>Message</span>
                      </div>
                      {primaryThreadEntry?.contentHtml ||
                      primaryThreadEntry?.content ? (
                        <EmailSignatureContent
                          html={primaryThreadEntry?.contentHtml}
                          text={primaryThreadEntry?.content}
                          contentKind={
                            primaryThreadEntry?.type === "internal_note"
                              ? "rich_text"
                              : "email"
                          }
                          hideSignatures={hideEmailSignatures}
                          renderMode={emailHtmlRenderMode}
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
                      {primaryThreadAttachments.length > 0 ? (
                        <EmailThreadAttachments
                          attachments={primaryThreadAttachments}
                        />
                      ) : null}
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
                      icon: <Ban className="h-4 w-4" />,
                      destructive: true,
                    })}
                  </div>
                </div>
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

              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 lg:pr-12">
                {/* Vertical Timeline rail along the panel's right edge: subtle
                    relative-date markers ("Today", "X Days Ago", …) mapped to
                    each conversation message. Desktop-only so it never crowds
                    narrow/mobile layouts or overlaps message content. */}
                {orderedConversationEntries.length > 0 ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-3 right-2 hidden w-8 flex-col items-center justify-between gap-1 lg:flex"
                  >
                    <span className="h-full w-px bg-zinc-800/80" />
                    {orderedConversationEntries.map((entry, index) => {
                      const label = formatRelativeEmailDate(entry.createdAt);
                      if (!label) return null;
                      return (
                        <span
                          key={`timeline-${entry.id}`}
                          className="absolute flex items-center gap-1 whitespace-nowrap text-xs sm:text-[9px] uppercase tracking-wide text-zinc-600"
                          style={{
                            top: `${
                              orderedConversationEntries.length > 1
                                ? 6 +
                                  (index /
                                    (orderedConversationEntries.length - 1)) *
                                    88
                                : 50
                            }%`,
                            right: 0,
                            writingMode: "vertical-rl",
                            transform: "translateY(-50%)",
                          }}
                        >
                          <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                          {label}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Conversation
                  </div>
                  {conversationEntries.length > 1 ? (
                    <button
                      type="button"
                      onClick={handleToggleConversationOrder}
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs sm:text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                      title={
                        conversationOrder === "newest_first"
                          ? "Showing newest first — switch to oldest first"
                          : "Showing oldest first — switch to newest first"
                      }
                      aria-label="Toggle conversation order"
                    >
                      <ArrowDownUp className="h-3.5 w-3.5" />
                      <span>
                        {conversationOrder === "newest_first"
                          ? "Newest First"
                          : "Oldest First"}
                      </span>
                    </button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {orderedConversationEntries.map((entry) => {
                    const isExpanded = isThreadMessageExpanded(
                      threadExpandState,
                      entry.id,
                    );

                    return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900/60"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleThreadMessage(entry.id)}
                          aria-expanded={isExpanded}
                          className="flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-zinc-900"
                        >
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
                              <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                                <span>
                                  {formatEmailTimestamp(entry.createdAt)}
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                            {!isExpanded ? (
                              <div className="mt-1 truncate text-xs text-zinc-400">
                                {getThreadEntryPreview(entry)}
                              </div>
                            ) : null}
                          </div>
                        </button>
                        {isExpanded ? (
                          <div className="px-3 pb-3 pl-[3.25rem]">
                            <EmailSignatureContent
                              html={entry.contentHtml}
                              text={entry.content}
                              contentKind={
                                entry.type === "internal_note"
                                  ? "rich_text"
                                  : "email"
                              }
                              hideSignatures={hideEmailSignatures}
                              renderMode={emailHtmlRenderMode}
                              contentClassName="break-words text-sm leading-6 text-zinc-300"
                              signatureClassName="break-words text-sm leading-6 text-zinc-300 opacity-90"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
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
          {thread && !loadingThread ? (
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-6 py-4">
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
                    <div className="rounded-full border border-zinc-700 px-2 py-1 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      Draft active
                    </div>
                  ) : null}
                  {/* Single Delete Email control, fixed at the bottom-right of
                      the modal. Confirmation (inline Confirm/Undo) + hover
                      tooltip are provided by renderThreadActionButton. */}
                  {renderThreadActionButton("delete", {
                    icon: <Trash2 className="h-4 w-4" />,
                    label: "Delete email",
                    destructive: true,
                  })}
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
                  {replyError ? (
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                      <div className="min-w-0">
                        <div className="font-medium text-red-100">
                          Reply not sent
                        </div>
                        <div className="mt-0.5 break-words text-xs text-red-200/90">
                          {replyError}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyError(null)}
                        aria-label="Dismiss send error"
                        className="shrink-0 rounded-md border border-red-800/60 px-2 py-0.5 text-xs text-red-100 transition-colors hover:border-red-700 hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                  <RichTextEditor
                    value={replyContent}
                    onChange={(value) => {
                      setReplyContent(value);
                      if (replyError) setReplyError(null);
                    }}
                    minHeightClassName="min-h-[120px]"
                    placeholder={
                      replyMode === "internal_note"
                        ? "Write an internal note for linked Forge tasks…"
                        : "Reply to all participants…"
                    }
                    disabled={
                      busyState === "reply" || busyState === "reply_schedule"
                    }
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="Reply Mode" />
                      <Select
                        value={replyMode}
                        onValueChange={(value) =>
                          setReplyMode(value as "reply_all" | "internal_note")
                        }
                      >
                        <SelectTrigger className="h-9 w-[160px] border-zinc-700 bg-zinc-900 text-white">
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
                          busyState === "reply_schedule" || !hasReplyText
                        }
                        className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
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
                      disabled={busyState === "reply" || !hasReplyText}
                      className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-theme-gradient px-3 text-sm text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
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
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
