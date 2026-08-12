"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Archive,
  ArrowDownUp,
  Ban,
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FolderSearch,
  GripVertical,
  LayoutTemplate,
  FolderKanban,
  Loader2,
  Mail,
  MailCheck,
  MailPlus,
  Link2,
  MailX,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Move,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pencil,
  RefreshCw,
  Reply,
  Forward,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { EmailThreadAttachments } from "@/components/email-thread-attachments";
import { FloatingPanel } from "@/components/floating-panel";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tooltip } from "@/components/tooltip";
import { EmailSignatureContent } from "@/components/email-signature-content";
import { resolveAttachmentUrl } from "@/lib/email-inbox/attachments";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatEmailSubject,
  normalizeInboxActionTitle,
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
import {
  isThreadDetailFresh,
  sharedThreadDetailCache,
} from "@/lib/email-inbox/thread-detail-cache";
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
    completed?: boolean;
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
  /** The (realtime-updated) inbox row's freshness signal for the open thread.
   *  When it matches the cached detail, reopening skips the network entirely.
   *  The display fields (subject/preview/…) also seed instant content while the
   *  full thread hydrates, so opening never shows a bare spinner. */
  freshnessSignal?:
    | {
        updatedAt?: string;
        messageCount?: number;
        subject?: string | null;
        summaryText?: string | null;
        previewText?: string | null;
        actionTitle?: string | null;
      }
    | null;
  /** Open the outbound composer pre-filled to forward this thread. */
  onForward?: (draft: { subject: string; body: string }) => void;
  /**
   * One-click unsubscribe: visit the sender's List-Unsubscribe link, reply
   * "unsubscribe", then delete. The parent owns the optimistic removal + the
   * per-step bell alerts, so the modal just closes and delegates.
   */
  onUnsubscribe?: (threadId: string) => void | Promise<void>;
  /**
   * Archive from the open email. The parent owns the optimistic removal (the row
   * disappears from the list instantly) + the background provider sync and the
   * bell "Archiving…"→"Archived" alert, so the modal just closes and delegates —
   * identical behavior to archiving from a list row. When omitted, the modal
   * falls back to its own (non-optimistic) execute-then-close path.
   */
  onArchive?: (threadId: string) => void | Promise<void>;
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

/**
 * Build a Content-ID -> download URL map from a message's attachments so the
 * HTML sanitizer can rewrite inline `cid:` image sources (which browsers cannot
 * resolve) to the stored attachment URL. Keyed by normalized cid (no "cid:"
 * prefix, no angle brackets, lowercased).
 */
function buildEntryCidMap(
  entry: Pick<ConversationEntry, "id" | "attachments">,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const attachment of entry.attachments || []) {
    if (!attachment.cid) continue;
    const url = resolveAttachmentUrl(entry.id, attachment);
    if (!url) continue;
    const key = attachment.cid
      .replace(/^cid:/i, "")
      .replace(/^<|>$/g, "")
      .trim()
      .toLowerCase();
    if (key) map[key] = url;
  }
  return map;
}

/**
 * Strip a leading greeting (e.g. "Hi Spencer,", "Hello Spencer") from
 * AI-generated text before display. Does not mutate stored data — only the
 * displayed string. Capitalizes the first remaining letter.
 */
function stripAiGreeting(text: string | null | undefined): string {
  if (!text) return "";
  const stripped = text.replace(/^\s*(hi|hello|hey|dear)\b[^,\n]*,?\s*/i, "");
  if (!stripped) return text.trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function EmailActorAvatar({
  name,
  email,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "sm"
          ? "h-5 w-5 text-[10px] leading-none"
          : "h-10 w-10 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
      )}
      style={{ background: getEmailActorGradient(name, email) }}
      aria-hidden="true"
    >
      {getEmailActorInitials(name, email)}
    </div>
  );
}

/**
 * Chrome around the Linked Tasks list. Docked (default) it is the inline card
 * inside the thread body; popped out it becomes a draggable/dockable floating
 * panel (shared `FloatingPanel`) so the task list can sit beside the email
 * while you read it. The list itself is passed as children either way.
 */
function LinkedTasksHost({
  popped,
  onTogglePopped,
  count,
  children,
}: {
  popped: boolean;
  onTogglePopped: () => void;
  count: number;
  children: ReactNode;
}) {
  const label = `Linked Tasks${count ? ` (${count})` : ""}`;
  const badge = (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white">
      <FolderSearch className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );

  if (popped) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-500">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            {badge}
            <Tooltip content="Dock back into the email" className="w-auto" side="bottom" align="end">
              <button
                type="button"
                onClick={onTogglePopped}
                aria-label="Dock Linked Tasks back into the email"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
          <p className="text-xs">Open in a floating panel — drag it anywhere or dock it to a side.</p>
        </div>
        <FloatingPanel
          open
          dockable
          initialDock="right"
          onClose={onTogglePopped}
          title={label}
          icon={<FolderSearch className="h-4 w-4 shrink-0 text-zinc-400" />}
          widthClassName="w-[min(28rem,92vw)]"
        >
          <div className="p-4 text-sm text-zinc-300">{children}</div>
        </FloatingPanel>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        {badge}
        <Tooltip content="Pop out into a floating panel" className="w-auto" side="bottom" align="end">
          <button
            type="button"
            onClick={onTogglePopped}
            aria-label="Pop Linked Tasks out into a floating panel"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
      {children}
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
  freshnessSignal = null,
  onForward,
  onUnsubscribe,
  onArchive,
}: EmailThreadModalProps) {
  const [thread, setThread] = useState<EmailThreadDetail | null>(null);
  // Read inside the open effect without re-firing it on every realtime tick.
  const freshnessSignalRef = useRef(freshnessSignal);
  freshnessSignalRef.current = freshnessSignal;
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
  // Live drag-to-dock state: pixel offset from the drag origin (so the panel
  // follows the cursor) plus the edge the panel would dock to if released now
  // (drives the edge highlight overlay). Null when not dragging.
  const [dragDock, setDragDock] = useState<{
    dx: number;
    dy: number;
    edge: "left" | "right" | "top" | "bottom" | "center";
  } | null>(null);
  // Manual refresh (top-right + bottom of conversation) state + the timestamp
  // of the most recent successful load/refresh, shown before the user refreshes.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  // Scroll container for the reading pane body. Used to instantly jump to the
  // newest (bottom) message when the conversation is sorted oldest-first.
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  // Tracks the thread whose default "last message expanded" seed was applied,
  // so opening a thread expands only its newest message exactly once.
  const seededExpandThreadRef = useRef<string | null>(null);
  // Which tab the AI Summary panel shows: the AI summary text or linked tasks.
  const [summaryPanelTab, setSummaryPanelTab] = useState<
    "summary" | "linked_tasks"
  >("summary");
  // Linked task delete confirmation + per-row busy state.
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(
    null,
  );
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  // Linked Tasks popped out of the thread body into a floating panel.
  const [isLinkedTasksPopped, setIsLinkedTasksPopped] = useState(false);
  // Session-local completion overrides keyed by task id. Falls back to the
  // task's own `completed` field. Lets the strikethrough toggle work visually
  // and persist for the session even if the server payload lacks the field.
  const [taskCompletionOverrides, setTaskCompletionOverrides] = useState<
    Record<string, boolean>
  >({});
  // Whether older (past) conversation messages beyond the first are revealed.
  // Collapsed by default when there are several so the newest read stays tight.
  // All conversation messages render (as collapsed previews) by default now —
  // every message is shown, with only the newest one expanded (see the seed
  // effect below). Kept as state so the older-messages bumper still works if
  // ever re-collapsed, but it defaults to revealing every message.
  const [showOlderMessages, setShowOlderMessages] = useState(true);
  // Whether the reply composer is revealed. Hidden by default behind a
  // full-width "Reply" button at the bottom of the conversation; opening it
  // shows the editor, and a successful send / dismiss collapses it back.
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  // Optimistically-rendered outbound entries. When the user hits Send, the
  // composed message appears in the Conversation section immediately with a
  // gentle "breathing" pulse (animate-breathe) until the server confirms the
  // send — at which point it's dropped and replaced by the reloaded real
  // entry. On failure it's removed and the content is restored to the editor.
  const [optimisticEntries, setOptimisticEntries] = useState<
    Array<ConversationEntry & { pending: boolean }>
  >([]);
  const optimisticIdRef = useRef(0);
  // Per-thread collapse memory: which conversation messages are expanded.
  // Restored from (and persisted to) localStorage keyed by thread id.
  const [threadExpandState, setThreadExpandState] = useState<ThreadExpandState>(
    () => new Set<string>(),
  );
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  // Holds the action whose deletion/undo timer is still counting down. If the
  // modal (the slide-out reading pane) unmounts before the undo window
  // elapses, we flush this action so the delete is actually sent to the server
  // instead of being silently dropped when the pending setTimeout is cleared.
  const pendingQueuedActionRef = useRef<ThreadAction | null>(null);
  // The thread a queued action targets, captured at queue time so a flush
  // (timeout or unmount) never acts on whatever thread happens to be open then.
  const pendingQueuedThreadIdRef = useRef<string | null>(null);
  const { profile, updateProfile } = useUserProfile();
  const { preferences } = useUserPreferences();
  // Per-user Conversation ordering. Persisted on the profiles row, but driven
  // by local state so the toggle reorders messages INSTANTLY on click (without
  // waiting on the Supabase round-trip, which previously made the button feel
  // broken). The profile value seeds + re-syncs the local state.
  const profileConversationOrder: EmailConversationOrder = profile
    ? normalizeEmailConversationOrder(profile.email_conversation_order)
    : DEFAULT_EMAIL_CONVERSATION_ORDER;
  const [conversationOrder, setConversationOrder] =
    useState<EmailConversationOrder>(profileConversationOrder);
  useEffect(() => {
    setConversationOrder(profileConversationOrder);
  }, [profileConversationOrder]);
  const handleToggleConversationOrder = () => {
    const next: EmailConversationOrder =
      conversationOrder === "oldest_first" ? "newest_first" : "oldest_first";
    // Apply immediately for instant reordering, then persist to the profile so
    // the choice survives reload and applies to all threads.
    setConversationOrder(next);
    void updateProfile?.({ email_conversation_order: next });
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
  const aiSummaryText = stripAiGreeting(
    thread?.summaryText?.trim() ||
      (thread &&
      shouldShowSecondaryActionTitle(thread.actionTitle, thread.subject) &&
      normalizeInboxActionTitle(thread.actionTitle)
        ? normalizeInboxActionTitle(thread.actionTitle)
        : ""),
  );

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
  // Optimistic (in-flight) sent messages rendered inside the Conversation
  // section. Always expanded and pulsing (animate-breathe) until confirmed.
  const optimisticEntriesBlock =
    optimisticEntries.length > 0
      ? optimisticEntries.map((entry) => (
          <div
            key={entry.id}
            className="animate-breathe rounded-2xl border border-theme-primary/40 bg-zinc-900/60"
          >
            <div className="flex w-full items-start gap-3 p-3 text-left">
              <EmailActorAvatar
                name={entry.authorName}
                email={entry.authorEmail}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {getEmailActorName(entry.authorName, entry.authorEmail)}
                    </div>
                    {entry.authorEmail &&
                    entry.authorEmail !== entry.authorName ? (
                      <div className="truncate text-xs text-zinc-500">
                        {entry.authorEmail}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending…</span>
                  </div>
                </div>
                <div className="mt-2">
                  <EmailSignatureContent
                    html={entry.contentHtml}
                    text={entry.content}
                    contentKind={
                      entry.type === "internal_note" ? "rich_text" : "email"
                    }
                    hideSignatures={hideEmailSignatures}
                    renderMode={emailHtmlRenderMode}
                    cidMap={buildEntryCidMap(entry)}
                    contentClassName="break-words text-sm leading-6 text-zinc-300"
                    signatureClassName="break-words text-sm leading-6 text-zinc-300 opacity-90"
                  />
                </div>
              </div>
            </div>
          </div>
        ))
      : null;
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

  // Default view: collapse every conversation message EXCEPT the newest (last)
  // one, which opens expanded. Applied once per thread after its conversation
  // loads, and only when the user has no saved per-message expansions (so
  // "Expand All" and explicit choices still win). Not persisted — it's a fresh
  // default each open, not a stored user selection.
  useEffect(() => {
    if (!threadId) return;
    if (seededExpandThreadRef.current === threadId) return;
    if (conversationEntries.length === 0) return;
    seededExpandThreadRef.current = threadId;
    if (threadExpandState !== "all" && threadExpandState.size === 0) {
      const newestId =
        conversationEntries[conversationEntries.length - 1]?.id;
      if (newestId) {
        setThreadExpandState(new Set([newestId]));
      }
    }
  }, [threadId, conversationEntries, threadExpandState]);

  // When the conversation is sorted oldest-first (the default), open the pane
  // already scrolled to the newest (bottom) message. Instant jump, no smooth
  // scrolling animation.
  useEffect(() => {
    if (loadingThread || !thread) return;
    if (conversationOrder !== "oldest_first") return;
    const el = scrollBodyRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [thread, loadingThread, conversationOrder]);

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

  // Drag-to-undock: grab the top-right handle and drop the pointer near a
  // viewport edge to dock to that side (left/right/top/bottom); drop near the
  // center to float as a centered modal. The chosen dock is saved as the
  // default via handleSelectDisplayMode so it persists.
  // Which edge the panel would dock to for a pointer at (x, y): the nearest
  // viewport edge, or "center" when the pointer is far from every edge.
  const dockEdgeForPointer = (
    x: number,
    y: number,
  ): "left" | "right" | "top" | "bottom" | "center" => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const distanceLeft = x;
    const distanceRight = w - x;
    const distanceTop = y;
    const distanceBottom = h - y;
    const nearest = Math.min(
      distanceLeft,
      distanceRight,
      distanceTop,
      distanceBottom,
    );
    // "center" is only a small box around the middle of the viewport; anywhere
    // else picks the nearest edge, so the dock target (and its highlight) is
    // active across most of the drag instead of only in a thin band near edges.
    if (Math.abs(x - w / 2) < w * 0.16 && Math.abs(y - h / 2) < h * 0.16) {
      return "center";
    }
    if (nearest === distanceLeft) return "left";
    if (nearest === distanceRight) return "right";
    if (nearest === distanceTop) return "top";
    return "bottom";
  };

  const handleDragDockStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    // Pointer capture keeps events targeted at the handle, but must never abort
    // the drag setup if it throws (e.g. no active pointer) — the window
    // listeners below drive the drag regardless.
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // ignore — not fatal to the drag
    }
    document.body.classList.add("cursor-grabbing");

    const startX = event.clientX;
    const startY = event.clientY;
    setDragDock({ dx: 0, dy: 0, edge: dockEdgeForPointer(startX, startY) });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      // Follow the cursor and preview the dock target live.
      setDragDock({
        dx: moveEvent.clientX - startX,
        dy: moveEvent.clientY - startY,
        edge: dockEdgeForPointer(moveEvent.clientX, moveEvent.clientY),
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      document.body.classList.remove("cursor-grabbing");
      window.removeEventListener("pointermove", handlePointerMove);
      try {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
      setDragDock(null);
      const edge = dockEdgeForPointer(upEvent.clientX, upEvent.clientY);
      const mode: EmailThreadDisplayMode =
        edge === "center" ? "centered" : `docked-${edge}`;
      handleSelectDisplayMode(mode);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
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

  // While dragging, translate the panel to follow the cursor (composing with
  // centered mode's -50%/-50% base transform) and kill transitions so it tracks
  // 1:1. Inline transform overrides the Tailwind translate utilities.
  const panelStyle = dragDock
    ? {
        ...dockedRightStyle,
        transform:
          displayMode === "centered"
            ? `translate(calc(-50% + ${dragDock.dx}px), calc(-50% + ${dragDock.dy}px))`
            : `translate(${dragDock.dx}px, ${dragDock.dy}px)`,
        transition: "none",
      }
    : dockedRightStyle;

  // Edge-highlight overlay shown while dragging the panel: the edge the panel
  // would dock to lights up. Portaled to <body> so the panel's drag transform
  // (which becomes a containing block) can't clip these fixed bars.
  const dragOverlay =
    dragDock && typeof document !== "undefined"
      ? createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2147483000,
              pointerEvents: "none",
            }}
          >
            {(
              [
                ["left", { left: 0, top: 0, height: "100%", width: "18vw" }],
                ["right", { right: 0, top: 0, height: "100%", width: "18vw" }],
                ["top", { left: 0, top: 0, width: "100%", height: "18vh" }],
                [
                  "bottom",
                  { left: 0, bottom: 0, width: "100%", height: "18vh" },
                ],
              ] as const
            ).map(([edge, position]) => {
              const active = dragDock.edge === edge;
              const dir =
                edge === "left"
                  ? "90deg"
                  : edge === "right"
                    ? "270deg"
                    : edge === "top"
                      ? "180deg"
                      : "0deg";
              return (
                <div
                  key={edge}
                  style={{
                    position: "absolute",
                    ...position,
                    transition: "background 120ms, box-shadow 120ms",
                    // All four zones show a faint tint while dragging so the
                    // drop targets are discoverable; the active one glows.
                    background: active
                      ? `linear-gradient(${dir}, rgba(56,189,248,0.6), rgba(56,189,248,0))`
                      : `linear-gradient(${dir}, rgba(56,189,248,0.12), rgba(56,189,248,0))`,
                    boxShadow: active
                      ? "inset 0 0 70px 12px rgba(56,189,248,0.55)"
                      : "none",
                  }}
                />
              );
            })}
          </div>,
          document.body,
        )
      : null;

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
      setIsComposerOpen(false);
      setOptimisticEntries([]);
      return;
    }

    let cancelled = false;
    setStatusMessage(null);

    const applyThreadPayload = (payload: EmailThreadDetail) => {
      setThread(payload);
      setLastRefreshedAt(new Date());
      if (payload.activeReplyDraft) {
        setSelectedReplyDraftId(payload.activeReplyDraft.id);
        setReplyMode(payload.activeReplyDraft.replyMode);
        const draftContent =
          payload.activeReplyDraft.contentHtml ||
          payload.activeReplyDraft.contentText ||
          "";
        setReplyContent(draftContent);
        // Reveal the composer when a draft already has content so the
        // in-progress reply isn't hidden behind the collapsed button.
        if (draftContent.replace(/<[^>]*>/g, "").trim().length > 0) {
          setIsComposerOpen(true);
        }
        setScheduledReplyAt(
          payload.activeReplyDraft.scheduledFor
            ? new Date(payload.activeReplyDraft.scheduledFor)
                .toISOString()
                .slice(0, 16)
            : "",
        );
      }
    };

    // Cache-first open: a previously-loaded thread renders instantly with no
    // spinner. When the inbox row's freshness signal matches the cached
    // payload (no new message, no row update), skip the network entirely;
    // otherwise revalidate silently behind the already-rendered content.
    const cached = sharedThreadDetailCache.get(
      threadId,
    ) as EmailThreadDetail | null;
    if (cached) {
      applyThreadPayload(cached);
      setLoadingThread(false);
      if (isThreadDetailFresh(cached, freshnessSignalRef.current)) {
        return () => {
          cancelled = true;
        };
      }
    } else {
      setLoadingThread(true);
    }

    fetchThreadDetail(threadId)
      .then((payload) => {
        sharedThreadDetailCache.set(threadId, payload);
        if (!cancelled) {
          applyThreadPayload(payload);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        // A failed silent revalidate must not blank out already-rendered
        // cached content — only a cache-miss load surfaces the failure.
        if (!cached) {
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
    setTaskCompletionOverrides({});
    setShowOlderMessages(true);
    setSummaryPanelTab("summary");
    setIsComposerOpen(false);
    setOptimisticEntries([]);
    seededExpandThreadRef.current = null;
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (queuedActionTimeoutRef.current !== null) {
        window.clearTimeout(queuedActionTimeoutRef.current);
        queuedActionTimeoutRef.current = null;
      }
      // If a destructive action (e.g. delete) is still mid-undo when the
      // slide-out pane unmounts, flush it now so the action actually reaches
      // the server. Without this, clearing the timeout above would silently
      // drop the delete and it would no-op.
      const pendingAction = pendingQueuedActionRef.current;
      const pendingThreadId = pendingQueuedThreadIdRef.current;
      if (pendingAction) {
        pendingQueuedActionRef.current = null;
        pendingQueuedThreadIdRef.current = null;
        void executeThreadActionRef.current(pendingAction, pendingThreadId);
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
    // Explicit cancel (Undo) and re-queue both route through here, so drop the
    // pending action; only an unmount with an outstanding action should flush.
    pendingQueuedActionRef.current = null;
    pendingQueuedThreadIdRef.current = null;
    setQueuedAction(null);
    setIsQueuedActionNoticeVisible(false);
  };

  const refreshParent = async () => {
    await onRefresh?.();
  };

  const reloadThread = async (
    targetThreadId: string,
    options?: { silent?: boolean },
  ) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingThread(true);
    }

    try {
      const payload = await fetchThreadDetail(targetThreadId);
      sharedThreadDetailCache.set(targetThreadId, payload);
      setThread(payload);
      setLastRefreshedAt(new Date());
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
      if (!silent) {
        setLoadingThread(false);
      }
    }
  };

  // Manual refresh (top-right icon + bottom-of-conversation button). Uses the
  // silent path so the body doesn't blank to a spinner; a small spinning icon
  // signals progress instead.
  const handleManualRefresh = async () => {
    if (!threadId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await reloadThread(threadId, { silent: true });
    } finally {
      setIsRefreshing(false);
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

  const isLinkedTaskCompleted = (task: {
    id: string;
    completed?: boolean;
  }) =>
    taskCompletionOverrides[task.id] ?? Boolean(task.completed);

  // Toggle a linked task's completed state. Optimistically flips the local
  // override (so the strikethrough applies immediately and persists for the
  // session) and best-effort persists to the server via PATCH.
  const handleToggleLinkedTaskCompleted = async (task: {
    id: string;
    completed?: boolean;
  }) => {
    const next = !isLinkedTaskCompleted(task);
    setTaskCompletionOverrides((current) => ({
      ...current,
      [task.id]: next,
    }));
    setTaskBusyId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          completed: next,
          completed_at: next ? new Date().toISOString() : null,
        }),
      });

      await parseApiResponse(response, "Failed to update task");
      await refreshParent();
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to update task",
      );
    } finally {
      setTaskBusyId(null);
    }
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

  const ensureComposerDraft = async (overrides?: {
    content?: string;
    mode?: "reply_all" | "internal_note";
    draftId?: string | null;
  }) => {
    if (!threadId) {
      throw new Error("Choose a thread before saving a draft.");
    }

    // Values may be passed explicitly so the optimistic send path can persist
    // a snapshot even after the live composer state has already been cleared.
    const content = overrides?.content ?? replyContent;
    const mode = overrides?.mode ?? replyMode;
    const draftId =
      overrides?.draftId !== undefined ? overrides.draftId : selectedReplyDraftId;

    const payload = {
      source: "manual",
      replyMode: mode,
      subject: "",
      contentText: content,
      contentHtml: content,
    };

    if (draftId) {
      const response = await fetch(
        `/api/email/reply-drafts/${draftId}`,
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

    // Snapshot the composed content so a failed send can restore the editor
    // exactly as it was (body, mode, draft, schedule).
    const snapshot = {
      content: replyContent,
      mode: replyMode,
      draftId: selectedReplyDraftId,
      scheduledAt: scheduledReplyAt,
    };

    // Build the optimistic entry that "breathes" in the Conversation section
    // until the server confirms the send.
    const optimisticId = `optimistic-${threadId}-${optimisticIdRef.current++}`;
    const optimisticEntry: ConversationEntry & { pending: boolean } = {
      id: optimisticId,
      type: snapshot.mode === "internal_note" ? "internal_note" : "email",
      direction: snapshot.mode === "internal_note" ? "internal" : "outbound",
      authorName: thread?.mailboxName ?? null,
      authorEmail: thread?.mailboxEmailAddress ?? null,
      subject: thread?.subject ?? null,
      content: snapshot.content,
      contentHtml: snapshot.content,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    // Optimistically show the sent message and return the composer to its
    // collapsed button state. No spinner/loading state — the breathing entry
    // is the feedback.
    setOptimisticEntries((current) => [...current, optimisticEntry]);
    setReplyError(null);
    setReplyContent("");
    setSelectedReplyDraftId(null);
    setScheduledReplyAt("");
    setIsComposerOpen(false);

    try {
      const draft = await ensureComposerDraft({
        content: snapshot.content,
        mode: snapshot.mode,
        draftId: snapshot.draftId,
      });
      const response = await fetch(`/api/email/reply-drafts/${draft.id}/send`, {
        method: "POST",
        credentials: "include",
      });

      await parseApiResponse(response, "Failed to send reply");
      await refreshParent();
      await reloadThread(threadId);
      // Real reloaded entry now covers this message — drop the optimistic one.
      setOptimisticEntries((current) =>
        current.filter((entry) => entry.id !== optimisticId),
      );
      updateStatus(
        snapshot.mode === "internal_note"
          ? "Internal note saved."
          : "Reply sent.",
      );
    } catch (error) {
      // Remove the breathing entry and restore the composer exactly as it was
      // so the user can retry without retyping.
      setOptimisticEntries((current) =>
        current.filter((entry) => entry.id !== optimisticId),
      );
      setReplyContent(snapshot.content);
      setReplyMode(snapshot.mode);
      setSelectedReplyDraftId(snapshot.draftId);
      setScheduledReplyAt(snapshot.scheduledAt);
      setIsComposerOpen(true);
      const message =
        error instanceof Error ? error.message : "Failed to send reply";
      setReplyError(message);
      updateStatus(message);
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
      setIsComposerOpen(true);
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

  const executeThreadAction = async (
    action: ThreadAction,
    // The thread this action targets. Defaults to the open thread, but a
    // queued (undo-pending) action MUST carry the id it was queued against —
    // the selection can move before the queue flushes, and executing against
    // the live `threadId` would delete a different email than the user chose.
    targetThreadId: string | null = threadId,
  ) => {
    if (!targetThreadId) return;

    setBusyState(action);

    try {
      const response = await fetch(
        `/api/email/threads/${targetThreadId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        },
      );

      await parseApiResponse(response, "Failed to apply thread action");
      await refreshParent();

      if (shouldCloseEmailThreadModalAfterAction(action)) {
        onOpenChange(false);
        return;
      }

      await reloadThread(targetThreadId);
      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to apply action",
      );
    } finally {
      setBusyState(null);
    }
  };

  // Keep a stable reference to the latest executor so the unmount cleanup
  // (which only runs once with an empty dependency array) can flush a pending
  // queued action against the current thread instead of a stale closure.
  const executeThreadActionRef = useRef(executeThreadAction);
  executeThreadActionRef.current = executeThreadAction;

  const queueThreadAction = (action: ThreadAction) => {
    const undoSeconds =
      action === "delete"
        ? deleteUndoSeconds
        : DEFAULT_THREAD_ACTION_QUEUE_SECONDS;

    clearQueuedAction();
    setPendingConfirmAction(null);
    const targetThreadId = threadId;
    setQueuedAction(action);
    pendingQueuedActionRef.current = action;
    pendingQueuedThreadIdRef.current = targetThreadId;
    setIsQueuedActionNoticeVisible(true);
    setStatusMessage(getQueuedThreadActionMessage(action, undoSeconds));
    queuedActionTimeoutRef.current = window.setTimeout(() => {
      queuedActionTimeoutRef.current = null;
      pendingQueuedActionRef.current = null;
      pendingQueuedThreadIdRef.current = null;
      setQueuedAction(null);
      setIsQueuedActionNoticeVisible(false);
      void executeThreadAction(action, targetThreadId);
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

    // Archive routes through the parent's optimistic path so the email
    // disappears from the list instantly (background provider sync + bell
    // alert), identical to archiving from a list row. Close and delegate.
    if (action === "archive" && onArchive && threadId) {
      const targetThreadId = threadId;
      onOpenChange(false);
      void onArchive(targetThreadId);
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

  // "Share email link" — copies a deep link to this thread. Anyone with access
  // to the mailbox lands directly on this email; the inbox already resolves
  // ?thread=<id> on load. Nothing is made public by copying it.
  const [copiedThreadLink, setCopiedThreadLink] = useState(false);
  const copiedThreadLinkTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedThreadLinkTimeoutRef.current !== null) {
        window.clearTimeout(copiedThreadLinkTimeoutRef.current);
      }
    },
    [],
  );

  const [copiedEmailId, setCopiedEmailId] = useState(false);
  const copiedEmailIdTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedEmailIdTimeoutRef.current !== null) {
        window.clearTimeout(copiedEmailIdTimeoutRef.current);
      }
    },
    [],
  );

  const handleCopyEmailId = async () => {
    if (!threadId || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(threadId);
      setCopiedEmailId(true);
      if (copiedEmailIdTimeoutRef.current !== null) {
        window.clearTimeout(copiedEmailIdTimeoutRef.current);
      }
      copiedEmailIdTimeoutRef.current = window.setTimeout(
        () => setCopiedEmailId(false),
        1500,
      );
    } catch {
      // Clipboard blocked (permissions / insecure context): fall back to a
      // manual prompt so the ID can still be copied by hand.
      window.prompt("Copy this email ID", threadId);
    }
  };

  const handleCopyThreadLink = async () => {
    if (!threadId || typeof window === "undefined") return;
    const url = new URL("/email-inbox", window.location.origin);
    url.searchParams.set("thread", threadId);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedThreadLink(true);
      if (copiedThreadLinkTimeoutRef.current !== null) {
        window.clearTimeout(copiedThreadLinkTimeoutRef.current);
      }
      copiedThreadLinkTimeoutRef.current = window.setTimeout(
        () => setCopiedThreadLink(false),
        1500,
      );
    } catch {
      // Clipboard blocked (permissions / insecure context): show the link so it
      // can still be copied by hand rather than failing silently.
      window.prompt("Copy this link to the email", url.toString());
    }
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
    // Uniform border/background across every top-toolbar action; destructive
    // actions keep a red icon tint as the only differentiator (no odd border).
    const iconButtonClassName = options.destructive
      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-red-300 transition-colors hover:border-zinc-600 hover:text-red-200 disabled:opacity-50"
      : "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50";

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
        {dragOverlay}
        <DialogPrimitive.Content
          ref={panelContentRef}
          style={panelStyle}
          // When docked, don't steal focus back to the panel so the user can
          // keep typing in the app behind it.
          onOpenAutoFocus={isDocked ? (event) => event.preventDefault() : undefined}
          onInteractOutside={
            isDocked ? (event) => event.preventDefault() : undefined
          }
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-white shadow-2xl outline-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            displayMode === "docked-right" &&
              // Full-screen sheet on small phones; docked side panel at sm+
              // inset from the top/bottom/right edges so it floats with visible
              // rounded corners.
              "inset-0 h-full w-full max-w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:inset-y-auto sm:top-3 sm:bottom-3 sm:left-auto sm:right-3 sm:h-auto sm:w-[max(480px,40vw)] sm:max-w-[96vw] sm:rounded-2xl sm:border",
            displayMode === "docked-left" &&
              // Mirror of docked-right: docked side panel on the LEFT at sm+.
              "inset-0 h-full w-full max-w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:inset-y-auto sm:top-3 sm:bottom-3 sm:right-auto sm:left-3 sm:h-auto sm:w-[max(480px,40vw)] sm:max-w-[96vw] sm:rounded-2xl sm:border",
            displayMode === "docked-bottom" &&
              // Near-full-screen sheet on small phones (a 50vh dock is too
              // cramped to read a thread on a phone); short bottom dock at sm+
              // inset from the bottom/left/right edges.
              "inset-x-0 bottom-0 top-0 h-full w-full border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-x-3 sm:top-auto sm:bottom-3 sm:h-[50vh] sm:w-auto sm:rounded-2xl sm:border",
            displayMode === "docked-top" &&
              // Mirror of docked-bottom: short dock along the TOP at sm+.
              "inset-x-0 top-0 bottom-0 h-full w-full border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top sm:inset-x-3 sm:bottom-auto sm:top-3 sm:h-[50vh] sm:w-auto sm:rounded-2xl sm:border",
            displayMode === "centered" &&
              // Full-screen sheet on small phones; centered card at sm+.
              // Pure fade only: the old zoom-in-95, fighting the -translate
              // centering during the animation, made the panel appear to fly
              // in from the bottom-right corner instead of just appearing
              // front-and-center.
              "inset-0 h-full w-full max-w-full rounded-none border-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-[min(96vw,52rem)] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
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
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* From details FIRST: small avatar aligned to the sender text's
                  line-height, sender name + inline muted email, and the message
                  date floated to the right of the row. */}
              {primaryThreadEntry ? (
                <div className="flex min-w-0 items-center gap-2">
                  <EmailActorAvatar
                    name={primaryThreadEntry.authorName}
                    email={primaryThreadEntry.authorEmail}
                    size="sm"
                  />
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                    From
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {getEmailActorName(
                      primaryThreadEntry.authorName,
                      primaryThreadEntry.authorEmail,
                    )}
                  </span>
                  {primaryThreadEntry.authorEmail &&
                  primaryThreadEntry.authorEmail !==
                    primaryThreadEntry.authorName ? (
                    <span className="truncate text-xs text-zinc-500">
                      {primaryThreadEntry.authorEmail}
                    </span>
                  ) : null}
                  {primaryThreadEntry.createdAt ? (
                    <span className="ml-auto shrink-0 pl-2 text-xs text-zinc-500">
                      {formatEmailTimestamp(primaryThreadEntry.createdAt)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* To: the mailbox that received this email, shown under From. The
                  left spacer keeps the "To" label aligned under "From". */}
              {thread?.mailboxEmailAddress ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-5 w-5 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                    To
                  </span>
                  <span className="truncate text-sm text-zinc-300">
                    {thread.mailboxName || thread.mailboxEmailAddress}
                  </span>
                  {thread.mailboxName &&
                  thread.mailboxEmailAddress !== thread.mailboxName ? (
                    <span className="truncate text-xs text-zinc-500">
                      {thread.mailboxEmailAddress}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {/* Click the summary or subject to copy the email's ID — handy for
                  referencing a specific email when talking to API-connected
                  agents. A "Copied!" toast fades in, then slides up and out. */}
              <div className="relative min-w-0">
                {aiSummaryText ? (
                  <div
                    role="button"
                    tabIndex={0}
                    title="Copy email ID"
                    onClick={() => void handleCopyEmailId()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void handleCopyEmailId();
                      }
                    }}
                    className="min-w-0 cursor-pointer truncate rounded text-sm font-medium text-zinc-200 transition-colors hover:text-white"
                  >
                    <span className="text-zinc-500">Summary: </span>
                    {aiSummaryText}
                  </div>
                ) : null}
                <div
                  role="button"
                  tabIndex={0}
                  title="Copy email ID"
                  onClick={() => void handleCopyEmailId()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void handleCopyEmailId();
                    }
                  }}
                  className={cn(
                    "min-w-0 cursor-pointer truncate rounded transition-colors hover:text-white",
                    aiSummaryText
                      ? "text-xs text-zinc-500"
                      : "text-sm font-medium text-zinc-300",
                  )}
                >
                  <span className="text-zinc-600">Subject: </span>
                  {thread?.subject
                    ? formatEmailSubject(thread.subject)
                    : freshnessSignal?.subject
                      ? formatEmailSubject(freshnessSignal.subject)
                      : "Email thread"}
                </div>
                {copiedEmailId ? (
                  <div className="animate-copied-id-toast pointer-events-none absolute -top-1 left-0 z-10 rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white shadow-lg">
                    Copied!
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Slide-out toolbar: every thread action collapses behind this
                  trigger and reveals on hover (or keyboard focus-within) with a
                  smooth slide. Only the Close (X) and drag handle stay visible
                  at all times, to the right of this group. */}
              <div className="group/toolbar flex items-center">
                <Tooltip
                  content="Thread actions"
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    aria-label="Show thread actions"
                    aria-expanded={false}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white group-hover/toolbar:border-zinc-600 group-hover/toolbar:text-white group-focus-within/toolbar:border-zinc-600 group-focus-within/toolbar:text-white"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </Tooltip>
                <div className="flex max-w-0 items-center gap-1 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover/toolbar:ml-1 group-hover/toolbar:max-w-[720px] group-hover/toolbar:opacity-100 group-focus-within/toolbar:ml-1 group-focus-within/toolbar:max-w-[720px] group-focus-within/toolbar:opacity-100">
              {thread && !loadingThread ? (
                <Tooltip
                  content="Refresh thread"
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() => void handleManualRefresh()}
                    disabled={isRefreshing}
                    aria-label="Refresh thread"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        isRefreshing && "animate-spin",
                      )}
                    />
                  </button>
                </Tooltip>
              ) : null}
              {thread && !loadingThread ? (
                <Tooltip
                  content={
                    canMarkThreadAsRead(thread)
                      ? "Mark thread as read"
                      : "Thread already read"
                  }
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("mark_read")}
                    disabled={
                      Boolean(busyState) || !canMarkThreadAsRead(thread)
                    }
                    aria-label={
                      canMarkThreadAsRead(thread)
                        ? "Mark thread as read"
                        : "Thread already read"
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busyState === "mark_read" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MailCheck className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              ) : null}
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    {allConversationExpanded ? (
                      <ChevronsDownUp className="h-4 w-4" />
                    ) : (
                      <ChevronsUpDown className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              ) : null}
              {/* AI Style Override toggle (icon-only, label in tooltip). Lives
                  in this toolbar; toggles the reply-style override panel in the
                  composer footer. */}
              {thread && !loadingThread ? (
                <Tooltip
                  content="AI Style Override"
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setReplyStyleOverrideEnabled((current) => !current)
                    }
                    aria-label="AI Style Override"
                    aria-pressed={replyStyleOverrideEnabled}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                      replyStyleOverrideEnabled
                        ? "border-theme-primary bg-zinc-800 text-white"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white",
                    )}
                  >
                    <Wand2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              ) : null}
              {thread && !loadingThread ? (
                <Tooltip
                  content={copiedThreadLink ? "Link copied" : "Share email link"}
                  className="w-auto"
                  side="bottom"
                  align="end"
                >
                  <button
                    type="button"
                    onClick={() => void handleCopyThreadLink()}
                    aria-label="Share email link"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    {copiedThreadLink ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              ) : null}
              {/* Destructive / triage cluster relocated into this toolbar
                  (Quarantine / Archive / Spam / Delete), top-right. */}
              {thread && !loadingThread ? (
                <div className="inline-flex items-center gap-1">
                  {renderThreadActionButton("quarantine", {
                    icon: <ShieldAlert className="h-4 w-4" />,
                  })}
                  {renderThreadActionButton("archive", {
                    icon: <Archive className="h-4 w-4" />,
                  })}
                  {onUnsubscribe ? (
                    <Tooltip
                      content="Unsubscribe (link + reply, then delete)"
                      className="w-auto"
                      side="bottom"
                      align="end"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!threadId) return;
                          const target = threadId;
                          onOpenChange(false);
                          void onUnsubscribe(target);
                        }}
                        disabled={Boolean(busyState) || Boolean(queuedAction)}
                        aria-label="Unsubscribe"
                        title="Unsubscribe"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                      >
                        <MailX className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  ) : null}
                  {renderThreadActionButton("spam", {
                    icon: <Ban className="h-4 w-4" />,
                    destructive: true,
                  })}
                  {renderThreadActionButton("delete", {
                    icon: <Trash2 className="h-4 w-4" />,
                    label: "Delete email",
                    destructive: true,
                  })}
                </div>
              ) : null}
              {/* Combined docking control: shows the active mode and slides
                  DOWN on hover/focus to reveal the others. The list is absolutely
                  positioned so opening it never reflows the toolbar beside it. */}
              <div
                role="group"
                aria-label="Thread display mode"
                className="group relative inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5"
              >
                {(() => {
                  const iconFor = (value: string) =>
                    value === "centered"
                      ? Maximize2
                      : value === "docked-right"
                        ? PanelRight
                        : value === "docked-left"
                          ? PanelLeft
                          : value === "docked-top"
                            ? PanelTop
                            : PanelBottom;
                  const activeOption =
                    EMAIL_THREAD_DISPLAY_MODE_OPTIONS.find(
                      (option) => option.value === displayMode,
                    ) || EMAIL_THREAD_DISPLAY_MODE_OPTIONS[0];
                  const ActiveIcon = iconFor(activeOption.value);
                  const otherOptions = EMAIL_THREAD_DISPLAY_MODE_OPTIONS.filter(
                    (option) => option.value !== activeOption.value,
                  );

                  return (
                    <>
                      <Tooltip
                        content={activeOption.label}
                        className="w-auto"
                        side="bottom"
                        align="end"
                      >
                        <button
                          type="button"
                          aria-label={activeOption.label}
                          aria-pressed
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-zinc-700 text-white"
                        >
                          <ActiveIcon className="h-4 w-4 shrink-0" />
                        </button>
                      </Tooltip>
                      <div className="pointer-events-none absolute right-0 top-full z-30 flex flex-col items-center gap-0.5 overflow-hidden rounded-lg border border-transparent p-0 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:mt-1 group-hover:border-zinc-700 group-hover:bg-zinc-900 group-hover:p-0.5 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:mt-1 group-focus-within:border-zinc-700 group-focus-within:bg-zinc-900 group-focus-within:p-0.5 group-focus-within:opacity-100">
                        {otherOptions.map((option) => {
                          const Icon = iconFor(option.value);
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
                                onClick={() =>
                                  handleSelectDisplayMode(option.value)
                                }
                                aria-label={option.label}
                                aria-pressed={false}
                                className="inline-flex h-0 w-7 items-center justify-center overflow-hidden rounded-md text-zinc-400 transition-all duration-200 hover:text-white group-hover:h-7 group-focus-within:h-7"
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                              </button>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
                </div>
              </div>
              {/* Drag handle: grab and drop near a viewport edge to dock the
                  pane there (left/right/top/bottom), or drop near the center to
                  float it as a centered modal. The choice is saved as default. */}
              <Tooltip
                content="Drag to dock (left / right / top / bottom)"
                className="w-auto"
                side="bottom"
                align="end"
              >
                <button
                  type="button"
                  onPointerDown={handleDragDockStart}
                  aria-label="Drag to dock the thread panel"
                  className="inline-flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white active:cursor-grabbing"
                >
                  <Move className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip
                content="Close"
                className="w-auto"
                side="bottom"
                align="end"
              >
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </Tooltip>
            </div>
          </div>

          <div ref={scrollBodyRef} className="flex-1 overflow-y-auto p-6">
          {loadingThread ? (
            // Instant open: show the subject + preview we already have from the
            // inbox row, with a subtle "loading full conversation" line, instead
            // of a bare spinner while the heavy thread detail hydrates.
            <div className="min-h-[420px] space-y-4">
              {freshnessSignal?.subject ? (
                <h2 className="text-base font-semibold text-zinc-100">
                  {formatEmailSubject(freshnessSignal.subject)}
                </h2>
              ) : null}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                {freshnessSignal?.summaryText ||
                freshnessSignal?.previewText ||
                freshnessSignal?.actionTitle ? (
                  <p className="whitespace-pre-line text-zinc-300">
                    {freshnessSignal.summaryText ||
                      freshnessSignal.previewText ||
                      freshnessSignal.actionTitle}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-800" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading full conversation…
              </div>
            </div>
          ) : thread ? (
            <div className="space-y-5">
              {/* From details now live in the top header bar (above Summary
                  and Subject). The body opens with the AI Summary / Linked
                  Tasks panel, then the unified Message + Conversation card. */}
              <div>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <LinkedTasksHost
                      popped={isLinkedTasksPopped}
                      onTogglePopped={() =>
                        setIsLinkedTasksPopped((popped) => !popped)
                      }
                      count={thread.linkedTasks?.length ?? 0}
                    >
                      {(
                        <div>
                          {thread.linkedTasks?.length ? (
                            <div className="space-y-2">
                              {thread.linkedTasks.map((task) => {
                                const isConfirmingDelete =
                                  pendingDeleteTaskId === task.id;
                                const isTaskBusy = taskBusyId === task.id;
                                const isCompleted =
                                  isLinkedTaskCompleted(task);

                                return (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                                  >
                                    <Tooltip
                                      content={
                                        isCompleted
                                          ? "Reopen task"
                                          : "Mark complete"
                                      }
                                      className="w-auto"
                                      side="bottom"
                                      align="start"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleToggleLinkedTaskCompleted(
                                            task,
                                          )
                                        }
                                        disabled={isTaskBusy}
                                        aria-pressed={isCompleted}
                                        aria-label={
                                          isCompleted
                                            ? "Reopen task"
                                            : "Mark task complete"
                                        }
                                        className={cn(
                                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50",
                                          isCompleted
                                            ? "text-[rgb(var(--theme-primary-rgb))]"
                                            : "text-zinc-500 hover:text-zinc-200",
                                        )}
                                      >
                                        {isCompleted ? (
                                          <CheckSquare className="h-4 w-4" />
                                        ) : (
                                          <Square className="h-4 w-4" />
                                        )}
                                      </button>
                                    </Tooltip>
                                    <span
                                      className={cn(
                                        "min-w-0 flex-1 truncate",
                                        isCompleted &&
                                          "text-zinc-500 line-through",
                                      )}
                                    >
                                      {stripAiGreeting(task.name)}
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
                    </LinkedTasksHost>
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

              {/* Unified Message + Conversation card: the primary (opened)
                  message and the conversation thread live in a single bordered
                  container with no divider between them. */}
              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 lg:pr-12">
                {/* Primary message (the opened email body) — the top section of
                    the unified card, borderless so it reads as one with the
                    conversation list below it. */}
                <div className="relative mb-3 text-sm text-zinc-300">
                  {/* Message title row: title on the left, compact controls
                      (conversation sort + HTML render-mode toggle) right-aligned
                      on the same line, sized to the title's line-height. */}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                      <Mail className="h-3.5 w-3.5" />
                      <span>Message</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                        <div
                          ref={projectPickerRef}
                          className="relative w-[150px] sm:w-[220px]"
                        >
                          {/* One line, always: the field used to wrap, so a
                              single project chip pushed the text cursor onto a
                              second row and the control grew to twice the
                              height of the buttons beside it. Chips truncate
                              and the row scrolls instead. */}
                          <div className="relative flex h-9 w-full flex-nowrap items-center gap-1.5 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 pl-3 pr-9 transition-colors focus-within:ring-2 ring-theme">
                            <FolderKanban className="pointer-events-none h-4 w-4 shrink-0 text-zinc-500" />
                            {/* Selected project chips render INSIDE the field,
                                left of the typing cursor. */}
                            {associatedProjects.map((project) => (
                              <span
                                key={project.id}
                                className="inline-flex min-w-0 max-w-[60%] shrink items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/70 py-0.5 pl-2 pr-1 text-xs text-zinc-200"
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: project.color }}
                                />
                                <span className="truncate">{project.name}</span>
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
                                associatedProjects.length > 0
                                  ? ""
                                  : "Add project..."
                              }
                              disabled={busyState === "project"}
                              className="h-6 w-full min-w-[2rem] flex-1 shrink border-0 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                      {conversationEntries.length > 1 ? (
                        <Tooltip
                          content={
                            conversationOrder === "newest_first"
                              ? "Newest First"
                              : "Oldest First"
                          }
                          className="w-auto"
                          side="bottom"
                          align="end"
                        >
                          <button
                            type="button"
                            onClick={handleToggleConversationOrder}
                            aria-label="Toggle conversation order"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                          >
                            <ArrowDownUp className="h-5 w-5" />
                          </button>
                        </Tooltip>
                      ) : null}
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
                              current === "preserve"
                                ? "simplified"
                                : "preserve",
                            )
                          }
                          aria-label={getEmailHtmlRenderModeToggleLabel(
                            emailHtmlRenderMode,
                          )}
                          className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-md border bg-zinc-900/80 transition-colors",
                            emailHtmlRenderMode === "simplified"
                              ? "border-theme-primary text-white"
                              : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                          )}
                        >
                          {emailHtmlRenderMode === "simplified" ? (
                            <Sparkles className="h-5 w-5" />
                          ) : (
                            <LayoutTemplate className="h-5 w-5" />
                          )}
                        </button>
                      </Tooltip>
                    </div>
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
                      cidMap={
                        primaryThreadEntry
                          ? buildEntryCidMap(primaryThreadEntry)
                          : undefined
                      }
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
                <div className="space-y-1.5">
                  {conversationOrder === "newest_first"
                    ? optimisticEntriesBlock
                    : null}
                  {orderedConversationEntries.map((entry, entryIndex) => {
                    const isExpanded = isThreadMessageExpanded(
                      threadExpandState,
                      entry.id,
                    );
                    const hiddenOlderCount =
                      orderedConversationEntries.length - 1;
                    // The hidden messages are whatever isn't the first shown
                    // entry. With newest-first order the first entry is the
                    // newest, so the rest are "older"; with oldest-first the
                    // first entry is the oldest, so the rest are "newer".
                    const hiddenDirectionLabel =
                      conversationOrder === "oldest_first" ? "newer" : "older";
                    // Centered bumper to reveal the collapsed messages: shown
                    // between the first message and the rest when collapsed.
                    if (
                      entryIndex === 1 &&
                      !showOlderMessages &&
                      hiddenOlderCount > 0
                    ) {
                      return (
                        <div
                          key="older-messages-bumper"
                          className="flex justify-center py-0.5"
                        >
                          <button
                            type="button"
                            onClick={() => setShowOlderMessages(true)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                            <span>
                              Show {hiddenOlderCount} {hiddenDirectionLabel}{" "}
                              message{hiddenOlderCount === 1 ? "" : "s"}
                            </span>
                          </button>
                        </div>
                      );
                    }
                    if (entryIndex >= 1 && !showOlderMessages) {
                      return null;
                    }

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
                              cidMap={buildEntryCidMap(entry)}
                              contentClassName="break-words text-sm leading-6 text-zinc-300"
                              signatureClassName="break-words text-sm leading-6 text-zinc-300 opacity-90"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {conversationOrder === "oldest_first"
                    ? optimisticEntriesBlock
                    : null}
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
              {!isComposerOpen ? (
                // Reply reveals the inline editor; Forward opens the outbound
                // composer pre-filled with the quoted message. The manual
                // refresh + last-refreshed timestamp live inline on the left.
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleManualRefresh()}
                    disabled={isRefreshing}
                    title={isRefreshing ? "Refreshing…" : "Refresh"}
                    aria-label={isRefreshing ? "Refreshing…" : "Refresh"}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                    />
                  </button>
                  {lastRefreshedAt ? (
                    <span className="hidden truncate text-xs text-zinc-500 sm:inline">
                      Last refreshed: {lastRefreshedAt.toLocaleString()}
                    </span>
                  ) : null}
                  {onForward ? (
                    <button
                      type="button"
                      onClick={() => {
                        const rawSubject = thread?.subject || "";
                        const subject = /^\s*fwd?:/i.test(rawSubject)
                          ? rawSubject
                          : `Fwd: ${rawSubject}`;
                        const from = primaryThreadEntry
                          ? getEmailActorName(
                              primaryThreadEntry.authorName,
                              primaryThreadEntry.authorEmail,
                            )
                          : "";
                        const original =
                          primaryThreadEntry?.contentHtml ||
                          (primaryThreadEntry?.content
                            ? `<p>${primaryThreadEntry.content}</p>`
                            : "");
                        onForward({
                          subject,
                          body:
                            `<p></p><p>---------- Forwarded message ----------</p>` +
                            `<p>From: ${from}<br>Subject: ${rawSubject}</p>` +
                            original,
                        });
                      }}
                      className="ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                    >
                      <Forward className="h-4 w-4" />
                      <span>Forward</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsComposerOpen(true)}
                    className={cn(
                      "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-theme-gradient px-4 text-sm font-medium text-white shadow-lg transition-opacity hover:opacity-90",
                      onForward ? "flex-1" : "ml-auto flex-1",
                    )}
                  >
                    <Reply className="h-4 w-4" />
                    <span>Reply</span>
                  </button>
                </div>
              ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    {replyMode === "internal_note" ? "Internal Note" : "Reply"}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsComposerOpen(false);
                      setReplyError(null);
                    }}
                    aria-label="Dismiss composer"
                    title="Dismiss composer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* The AI Style Override toggle now lives in the top toolbar;
                    Generate AI reply sits inside the compose body; the pop-out
                    button moved next to Reply Mode. Only the draft indicator
                    remains here. */}
                {selectedReplyDraftId ? (
                  <div className="mb-3 flex items-center justify-end gap-2">
                    <div className="rounded-full border border-zinc-700 px-2 py-1 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      Draft active
                    </div>
                  </div>
                ) : null}
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
                  {/* Generate AI reply now lives INSIDE the compose body,
                      pinned to the top-right corner of the editor. */}
                  <div className="relative">
                    <Tooltip
                      content="Generate AI reply"
                      className="w-auto"
                      side="bottom"
                      align="end"
                    >
                      <button
                        type="button"
                        onClick={() => void handleGenerateAiReply()}
                        disabled={Boolean(busyState) || !threadId}
                        title="Generate AI reply"
                        aria-label="Generate AI reply"
                        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busyState === "reply_ai" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
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
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* Pop-out / separate window control, bottom-left of the
                        Reply Mode row. */}
                    <Tooltip content="Separate window" className="w-auto">
                      <button
                        type="button"
                        onClick={handleOpenThreadWindow}
                        disabled={!threadId}
                        title="Open thread in separate window"
                        aria-label="Open thread in separate window"
                        className="mt-2 mr-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </Tooltip>
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
              )}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
