"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  FolderSearch,
  Loader2,
  Mail,
  MailCheck,
  RefreshCw,
  Reply,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { EmailWorkList } from "@/components/email-work-list";
import { EmailRulesPanel } from "@/components/email-rules-panel";
import { EmailSpamReviewModal } from "@/components/email-spam-review-modal";
import { SenderHistoryModal } from "@/components/sender-history-modal";
import { Tooltip } from "@/components/tooltip";
import { FloatingFieldLabel } from "@/components/ui/floating-field-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database, InboxItem, Mailbox, SummaryProfile } from "@/lib/types";
import {
  getMailboxPasswordValidationError,
  getVisibleMailboxSyncError,
  isEmailInboxView,
  normalizeMailboxPassword,
} from "@/lib/email-inbox/shared";
import {
  applyMailboxProviderPreset,
  createEmptyMailboxForm,
  createMailboxFormFromMailbox,
  MAILBOX_PROVIDER_PRESETS,
} from "@/lib/email-inbox/provider-presets";
import {
  filterInboxProjects,
  getThreadProjectId,
  sortInboxProjects,
} from "@/lib/email-thread-projects";
import {
  buildInboxBrowserNotificationContent,
  listNewInboxItemsForNotification,
} from "@/lib/push/email";
import {
  getQueuedThreadActionMessage,
  getThreadActionLabel,
  requiresThreadActionConfirmation,
  type ThreadAction,
} from "@/lib/email-inbox/thread-actions";

type EmailInboxViewProps = {
  view: string;
  data: Database;
  onRefresh: () => Promise<void> | void;
  currentUserId?: string;
};

const DEFAULT_PROFILE_SETTINGS = JSON.stringify(
  {
    toneDetection: true,
    routeToProjects: true,
    generateTasks: true,
  },
  null,
  2,
);
const BROWSER_NOTIFICATION_POLL_INTERVAL_MS = 30 * 1000;

function getBrowserNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

function parseJsonValue<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export function EmailInboxView({
  view,
  data,
  onRefresh,
  currentUserId,
}: EmailInboxViewProps) {
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [mailboxes, setMailboxes] = useState(data.mailboxes);
  const [inboxItems, setInboxItems] = useState(data.inboxItems);
  const [quarantineCount, setQuarantineCount] = useState(data.quarantineCount);
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermission | "unsupported">("unsupported");
  const [loadingThread, setLoadingThread] = useState(false);
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const [mailboxForm, setMailboxForm] = useState(createEmptyMailboxForm);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<ThreadAction | null>(null);
  const [queuedAction, setQueuedAction] = useState<ThreadAction | null>(null);
  const [editingProfile, setEditingProfile] = useState<SummaryProfile | null>(
    null,
  );
  const [isSpamReviewOpen, setIsSpamReviewOpen] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">(
    "all",
  );
  const [senderHistory, setSenderHistory] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  const inboxSnapshotRef = useRef<InboxItem[]>(data.inboxItems);
  const mailboxesRef = useRef<Mailbox[]>(data.mailboxes);
  const refreshInboxStateRef = useRef<
    | ((options?: { allowBrowserNotifications?: boolean }) => Promise<void>)
    | null
  >(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    mailboxId: "all",
    summaryStyle: "action_first",
    instructionText:
      "Summaries should lead with the next concrete action, note blockers, and preserve client tone.",
    isDefault: false,
    settingsJson: DEFAULT_PROFILE_SETTINGS,
  });

  const filteredItems = useMemo(() => {
    const base = inboxItems.filter((item) => {
      if (selectedMailboxId !== "all" && item.mailboxId !== selectedMailboxId) {
        return false;
      }

      if (view === "email-quarantine") {
        return item.status === "quarantine";
      }

      return item.status !== "quarantine" && item.status !== "deleted";
    });

    if (readFilter === "unread") {
      return base.filter((item) => item.isUnread);
    }

    if (readFilter === "read") {
      return base.filter((item) => !item.isUnread);
    }

    return base;
  }, [inboxItems, readFilter, selectedMailboxId, view]);

  const visibleSyncError = useMemo(
    () => getVisibleMailboxSyncError(mailboxes, selectedMailboxId),
    [mailboxes, selectedMailboxId],
  );
  const selectedMailbox = useMemo(
    () =>
      selectedMailboxId === "all"
        ? null
        : mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) || null,
    [mailboxes, selectedMailboxId],
  );
  const sortedInboxProjects = useMemo(
    () => sortInboxProjects(data.projects),
    [data.projects],
  );
  const filteredInboxProjects = useMemo(
    () => filterInboxProjects(sortedInboxProjects, projectSearchQuery),
    [projectSearchQuery, sortedInboxProjects],
  );
  const selectedProjectId = getThreadProjectId(selectedThread);
  const selectedProject = useMemo(
    () =>
      sortedInboxProjects.find((project) => project.id === selectedProjectId) ||
      null,
    [selectedProjectId, sortedInboxProjects],
  );
  const isEditingMailbox = editingMailboxId !== null;

  useEffect(() => {
    setBrowserNotificationPermission(getBrowserNotificationPermission());
  }, []);

  const dispatchBrowserNotification = (item: InboxItem) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (window.Notification.permission !== "granted") {
      return false;
    }

    const alert = buildInboxBrowserNotificationContent(item);
    const notification = new window.Notification(alert.title, {
      body: alert.body,
      tag: `email-thread-${item.id}`,
    });

    notification.onclick = () => {
      window.focus();
      setSelectedMailboxId(item.mailboxId || "all");
      setSelectedThreadId(item.id);
      notification.close();
    };

    return true;
  };

  const applyInboxSnapshot = (params: {
    nextMailboxes: Mailbox[];
    nextItems: InboxItem[];
    allowBrowserNotifications?: boolean;
  }) => {
    if (
      params.allowBrowserNotifications &&
      browserNotificationPermission === "granted"
    ) {
      listNewInboxItemsForNotification({
        previousItems: inboxSnapshotRef.current,
        nextItems: params.nextItems,
      }).forEach((item) => {
        dispatchBrowserNotification(item);
      });
    }

    inboxSnapshotRef.current = params.nextItems;
    mailboxesRef.current = params.nextMailboxes;
    setMailboxes(params.nextMailboxes);
    setInboxItems(params.nextItems);
    setQuarantineCount(
      params.nextItems.filter((item) => item.status === "quarantine").length,
    );
  };

  useEffect(() => {
    return () => {
      if (queuedActionTimeoutRef.current !== null) {
        window.clearTimeout(queuedActionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    inboxSnapshotRef.current = data.inboxItems;
    mailboxesRef.current = data.mailboxes;
    setMailboxes(data.mailboxes);
    setInboxItems(data.inboxItems);
    setQuarantineCount(
      data.inboxItems.filter((item) => item.status === "quarantine").length,
    );
  }, [data.inboxItems, data.mailboxes]);

  useEffect(() => {
    setPendingConfirmAction(null);
    clearQueuedAction();
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isEmailInboxView(view)) return;
    if (filteredItems.length === 0) {
      setSelectedThreadId(null);
      setSelectedThread(null);
      return;
    }
    if (
      !selectedThreadId ||
      !filteredItems.some((item) => item.id === selectedThreadId)
    ) {
      setSelectedThreadId(filteredItems[0].id);
    }
  }, [filteredItems, selectedThreadId, view]);

  useEffect(() => {
    if (!selectedThreadId || !isEmailInboxView(view)) return;
    let cancelled = false;
    setLoadingThread(true);
    fetch(`/api/email/threads/${selectedThreadId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load thread");
        }
        if (!cancelled) {
          setSelectedThread(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : "Failed to load thread",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, view]);

  useEffect(() => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
  }, [selectedThreadId]);

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

  const mailboxPreset = MAILBOX_PROVIDER_PRESETS[mailboxForm.provider];
  const mailboxPasswordError = getMailboxPasswordValidationError(
    mailboxForm.provider,
    mailboxForm.password,
  );

  const refreshInboxState = async (options?: {
    allowBrowserNotifications?: boolean;
  }) => {
    const [mailboxesResponse, inboxResponse] = await Promise.all([
      fetch("/api/email/mailboxes", {
        credentials: "include",
      }),
      fetch("/api/email/inbox", {
        credentials: "include",
      }),
    ]);

    const mailboxesPayload = await mailboxesResponse.json();
    const inboxPayload = await inboxResponse.json();

    if (!mailboxesResponse.ok) {
      throw new Error(mailboxesPayload.error || "Failed to load mailboxes");
    }
    if (!inboxResponse.ok) {
      throw new Error(inboxPayload.error || "Failed to load inbox");
    }

    applyInboxSnapshot({
      nextMailboxes: Array.isArray(mailboxesPayload) ? mailboxesPayload : [],
      nextItems: Array.isArray(inboxPayload) ? inboxPayload : [],
      allowBrowserNotifications: options?.allowBrowserNotifications,
    });
  };

  const syncDueMailboxes = async (targetMailboxes: Mailbox[]) => {
    const now = Date.now();
    const dueMailboxes = targetMailboxes.filter((mailbox) => {
      if (!mailbox.autoSyncEnabled) return false;

      const lastSyncedAt = mailbox.lastSyncedAt
        ? new Date(mailbox.lastSyncedAt).getTime()
        : 0;
      return now - lastSyncedAt >= mailbox.syncFrequencyMinutes * 60 * 1000;
    });

    await Promise.all(
      dueMailboxes.map(async (mailbox) => {
        try {
          await fetch(`/api/email/mailboxes/${mailbox.id}/sync`, {
            method: "POST",
            credentials: "include",
          });
        } catch {
          return;
        }
      }),
    );
  };

  refreshInboxStateRef.current = refreshInboxState;

  useEffect(() => {
    if (!isEmailInboxView(view)) return;

    void (async () => {
      try {
        await syncDueMailboxes(mailboxesRef.current);
        await refreshInboxStateRef.current?.({
          allowBrowserNotifications: true,
        });
      } catch {
        // Keep automatic refresh silent while the user is working in the inbox.
      }
    })();

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          await syncDueMailboxes(mailboxesRef.current);
          await refreshInboxStateRef.current?.({
            allowBrowserNotifications: true,
          });
        } catch {
          // Keep polling silent while the user is working in the inbox.
        }
      })();
    }, BROWSER_NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [view]);

  const handleBrowserNotificationTest = async () => {
    const currentPermission = getBrowserNotificationPermission();
    if (currentPermission === "unsupported") {
      updateStatus("Browser notifications are not supported here.");
      return;
    }

    let nextPermission = currentPermission;

    if (nextPermission === "default") {
      nextPermission = await window.Notification.requestPermission();
      setBrowserNotificationPermission(nextPermission);
    } else {
      setBrowserNotificationPermission(nextPermission);
    }

    if (nextPermission === "denied") {
      updateStatus("Browser notifications are blocked in this browser.");
      return;
    }

    if (nextPermission !== "granted") {
      updateStatus("Browser notifications were not enabled.");
      return;
    }

    const testItem = filteredItems[0] || inboxItems[0] || null;

    if (testItem) {
      dispatchBrowserNotification(testItem);
    } else {
      new window.Notification("Email Inbox", {
        body: "Browser notifications are enabled for Focus Forge.",
        tag: "email-inbox-browser-test",
      });
    }

    updateStatus("Browser notification sent.");
  };

  const openMailboxCreateForm = () => {
    setEditingMailboxId(null);
    setMailboxForm(createEmptyMailboxForm());
    setShowMailboxForm(true);
  };

  const openMailboxEditForm = (mailbox: Mailbox) => {
    setEditingMailboxId(mailbox.id);
    setMailboxForm(createMailboxFormFromMailbox(mailbox));
    setShowMailboxForm(true);
  };

  const closeMailboxForm = () => {
    setShowMailboxForm(false);
    setEditingMailboxId(null);
    setMailboxForm(createEmptyMailboxForm());
  };

  const handleMailboxFormToggle = () => {
    if (showMailboxForm) {
      closeMailboxForm();
      return;
    }

    if (selectedMailbox) {
      openMailboxEditForm(selectedMailbox);
      return;
    }

    openMailboxCreateForm();
  };

  const handleSync = async () => {
    if (busyState || mailboxes.length === 0) return;
    setBusyState("sync");
    try {
      const mailboxesToSync =
        selectedMailboxId === "all"
          ? mailboxes
          : mailboxes.filter((mailbox) => mailbox.id === selectedMailboxId);

      if (mailboxesToSync.length === 0) {
        throw new Error("Choose a mailbox before syncing.");
      }

      const results = await Promise.all(
        mailboxesToSync.map(async (mailbox) => {
          const response = await fetch(
            `/api/email/mailboxes/${mailbox.id}/sync`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || `Failed to sync ${mailbox.name}`);
          }
          return {
            mailbox,
            syncedMessageCount: Number(payload.syncedMessageCount || 0),
          };
        }),
      );

      await refreshInboxState({ allowBrowserNotifications: true });

      const totalMessages = results.reduce(
        (sum, result) => sum + result.syncedMessageCount,
        0,
      );
      updateStatus(
        mailboxesToSync.length === 1
          ? `Synced ${totalMessages} messages from ${mailboxesToSync[0].name}.`
          : `Synced ${totalMessages} messages across ${mailboxesToSync.length} mailboxes.`,
      );
    } catch (error) {
      try {
        await refreshInboxState();
      } catch {
        // Keep the primary sync error visible when lightweight refresh also fails.
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to sync mailbox",
      );
    } finally {
      setBusyState(null);
    }
  };

  const syncMailboxAfterCreate = async (
    mailboxId: string,
    mailboxName: string,
  ) => {
    const response = await fetch(`/api/email/mailboxes/${mailboxId}/sync`, {
      method: "POST",
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Failed to sync ${mailboxName}`);
    }
    return Number(payload.syncedMessageCount || 0);
  };

  const handleMailboxCreate = async () => {
    if (mailboxPasswordError) {
      updateStatus(mailboxPasswordError);
      return;
    }

    setBusyState("mailbox");
    const wasEditingMailbox = isEditingMailbox;
    let createdMailboxId: string | null = null;
    const normalizedPassword = normalizeMailboxPassword(
      mailboxForm.provider,
      mailboxForm.password,
    );
    try {
      const response = await fetch("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: mailboxForm.provider,
          name: mailboxForm.name,
          displayName: mailboxForm.displayName || null,
          emailAddress: mailboxForm.emailAddress,
          loginUsername: mailboxForm.loginUsername || mailboxForm.emailAddress,
          password: normalizedPassword,
          imapHost: mailboxForm.imapHost,
          imapPort: Number(mailboxForm.imapPort || 993),
          smtpHost: mailboxForm.smtpHost,
          smtpPort: Number(mailboxForm.smtpPort || 465),
          syncFolder: mailboxForm.syncFolder || "INBOX",
          isShared: mailboxForm.isShared,
          organizationId:
            mailboxForm.organizationId !== "none"
              ? mailboxForm.organizationId
              : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create mailbox");
      }

      createdMailboxId = payload.id;
      setSelectedMailboxId(payload.id);
      closeMailboxForm();
      setMailboxes((prev) => {
        const remaining = prev.filter((mailbox) => mailbox.id !== payload.id);
        return [...remaining, payload];
      });

      const syncedMessageCount = await syncMailboxAfterCreate(
        payload.id,
        payload.name,
      );

      await refreshInboxState();
      updateStatus(
        wasEditingMailbox
          ? `Mailbox ${payload.name} updated and synced ${syncedMessageCount} messages.`
          : `Mailbox ${payload.name} connected and synced ${syncedMessageCount} messages.`,
      );
    } catch (error) {
      if (createdMailboxId) {
        try {
          await refreshInboxState();
        } catch {
          // Keep the mailbox update error visible when lightweight refresh fails.
        }
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to create mailbox",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleThreadAction = async (action: ThreadAction) => {
    if (!selectedThreadId) return;
    setBusyState(action);
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to apply thread action");
      }
      await refreshInboxState();
      if (action === "mark_read") {
        const detailResponse = await fetch(
          `/api/email/threads/${selectedThreadId}`,
          {
            credentials: "include",
          },
        );
        const detailPayload = await detailResponse.json();

        if (!detailResponse.ok) {
          throw new Error(detailPayload.error || "Failed to load thread");
        }

        setSelectedThread(detailPayload);
      } else {
        setSelectedThread(payload.id ? payload : selectedThread);
      }
      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to apply action",
      );
    } finally {
      setBusyState(null);
    }
  };

  const clearQueuedAction = () => {
    if (queuedActionTimeoutRef.current !== null) {
      window.clearTimeout(queuedActionTimeoutRef.current);
      queuedActionTimeoutRef.current = null;
    }
    setQueuedAction(null);
  };

  const executeThreadAction = async (action: ThreadAction) => {
    await handleThreadAction(action);
  };

  const queueThreadAction = (action: ThreadAction) => {
    clearQueuedAction();
    setPendingConfirmAction(null);
    setQueuedAction(action);
    setStatusMessage(getQueuedThreadActionMessage(action));
    queuedActionTimeoutRef.current = window.setTimeout(() => {
      queuedActionTimeoutRef.current = null;
      setQueuedAction(null);
      void executeThreadAction(action);
    }, 5000);
  };

  const handleUndoQueuedAction = () => {
    const action = queuedAction;
    clearQueuedAction();
    setPendingConfirmAction(null);
    if (action) {
      updateStatus(`${getThreadActionLabel(action)} canceled.`);
    }
  };

  const handleActionButtonClick = (action: ThreadAction) => {
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
      icon?: ReactNode;
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
        onClick={() => handleActionButtonClick(action)}
        disabled={Boolean(busyState) || Boolean(queuedAction)}
        className={baseClassName}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : options.icon ? (
          options.icon
        ) : null}
        {isQueued ? `${label} queued` : label}
      </button>
    );
  };

  const handleProjectAssign = async (projectId: string) => {
    if (!selectedThreadId) return;
    setBusyState("project");
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/project`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ projectId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to assign project");
      }
      await refreshInboxState();
      setSelectedThread(payload);
      updateStatus("Project assigned.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to assign project",
      );
    } finally {
      setBusyState(null);
    }
  };

  const closeProjectPicker = () => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
  };

  const handleProjectPickerSelect = (projectId: string) => {
    closeProjectPicker();
    if (projectId !== selectedProjectId) {
      void handleProjectAssign(projectId);
    }
  };

  const handleGenerateTasks = async () => {
    if (!selectedThreadId) return;
    setBusyState("tasks");
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId:
              selectedThread?.projectId || selectedThread?.project_id || null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate tasks");
      }
      await refreshInboxState();
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

  const handleReply = async () => {
    if (!selectedThreadId || !replyContent.trim()) return;
    setBusyState("reply");
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content: replyContent,
            mode: replyMode,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to send reply");
      }
      setReplyContent("");
      await refreshInboxState();
      if (selectedThreadId) {
        const detailResponse = await fetch(
          `/api/email/threads/${selectedThreadId}`,
          {
            credentials: "include",
          },
        );
        const detailPayload = await detailResponse.json();
        if (detailResponse.ok) {
          setSelectedThread(detailPayload);
        }
      }
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

  const handleSaveProfile = async () => {
    setBusyState("profile");
    try {
      const response = await fetch(
        editingProfile
          ? `/api/email/ai-profiles/${editingProfile.id}`
          : "/api/email/ai-profiles",
        {
          method: editingProfile ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: profileForm.name,
            mailboxId:
              profileForm.mailboxId !== "all" ? profileForm.mailboxId : null,
            summaryStyle: profileForm.summaryStyle,
            instructionText: profileForm.instructionText,
            isDefault: profileForm.isDefault,
            settings: parseJsonValue(profileForm.settingsJson, {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save AI profile");
      }
      setEditingProfile(null);
      setProfileForm({
        name: "",
        mailboxId: "all",
        summaryStyle: "action_first",
        instructionText:
          "Summaries should lead with the next concrete action, note blockers, and preserve client tone.",
        isDefault: false,
        settingsJson: DEFAULT_PROFILE_SETTINGS,
      });
      await onRefresh();
      updateStatus("AI profile saved.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to save AI profile",
      );
    } finally {
      setBusyState(null);
    }
  };

  const startEditingProfile = (profile: SummaryProfile) => {
    setEditingProfile(profile);
    setProfileForm({
      name: profile.name,
      mailboxId: profile.mailboxId || "all",
      summaryStyle: profile.summaryStyle,
      instructionText: profile.instructionText,
      isDefault: profile.isDefault,
      settingsJson: JSON.stringify(profile.settings, null, 2),
    });
  };

  if (view === "email-rules") {
    return (
      <EmailRulesPanel
        rules={data.emailRules}
        mailboxes={mailboxes}
        onRefresh={onRefresh}
      />
    );
  }

  if (view === "email-ai-lab") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Email AI Lab</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Advanced profile controls for summary, routing, tone, and task
              splitting.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-400">
            {data.summaryProfiles.length} profile
            {data.summaryProfiles.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            {data.summaryProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => startEditingProfile(profile)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Bot className="h-4 w-4 text-zinc-400" />
                    {profile.name}
                  </div>
                  {profile.isDefault ? (
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {profile.summaryStyle}
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  {profile.instructionText}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-lg font-semibold text-white">
              {editingProfile ? "Edit Profile" : "New Profile"}
            </h2>
            <div className="mt-4 space-y-3">
              <input
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Profile name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <Select
                value={profileForm.mailboxId}
                onValueChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, mailboxId: value }))
                }
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Mailbox scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">User-wide</SelectItem>
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                value={profileForm.summaryStyle}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    summaryStyle: event.target.value,
                  }))
                }
                placeholder="Summary style"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={profileForm.instructionText}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    instructionText: event.target.value,
                  }))
                }
                rows={6}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={profileForm.settingsJson}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    settingsJson: event.target.value,
                  }))
                }
                rows={8}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    type="checkbox"
                    checked={profileForm.isDefault}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        isDefault: event.target.checked,
                      }))
                    }
                  />
                  Default profile
                </label>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={busyState === "profile" || !profileForm.name.trim()}
                  className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busyState === "profile" ? "Saving…" : "Save Profile"}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {view === "email-quarantine" ? "Quarantine" : "Email Inbox"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {view === "email-quarantine"
              ? "Review suspected spam and decide what Fluid should do next."
              : "Email threads are pre-processed and rendered as work items."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBrowserNotificationTest}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <BellRing className="h-4 w-4" />
            {browserNotificationPermission === "granted"
              ? "Send Test Alert"
              : browserNotificationPermission === "denied"
                ? "Alerts Blocked"
                : "Enable Alerts"}
          </button>
          <Tooltip content="AI + Spam" className="w-auto">
            <button
              type="button"
              onClick={() => setIsSpamReviewOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              aria-label="AI + Spam"
            >
              <Bot className="h-4 w-4" />
            </button>
          </Tooltip>
          <Select
            value={selectedMailboxId}
            onValueChange={setSelectedMailboxId}
          >
            <SelectTrigger className="w-[220px] border-zinc-700 bg-zinc-900 text-white">
              <SelectValue placeholder="Mailbox" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              {mailboxes.map((mailbox) => (
                <SelectItem key={mailbox.id} value={mailbox.id}>
                  {mailbox.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={handleMailboxFormToggle}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
          >
            {showMailboxForm
              ? "Close Mailbox"
              : selectedMailbox
                ? "Edit Mailbox"
                : "Connect Mailbox"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={mailboxes.length === 0 || busyState === "sync"}
            className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busyState === "sync" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {selectedMailboxId === "all" ? "Sync All" : "Sync"}
          </button>
        </div>
      </div>

      {visibleSyncError ? (
        <div className="rounded-xl border border-amber-900/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          {visibleSyncError}
        </div>
      ) : null}

      {showMailboxForm ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">
                {isEditingMailbox ? "Update Mailbox" : "Connect Mailbox"}
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                {isEditingMailbox
                  ? "Replace the mailbox password with a new App Password, then save to reconnect."
                  : "Add a new mailbox connection for Fluid to sync and process."}
              </div>
            </div>
            <button
              type="button"
              onClick={closeMailboxForm}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select
              value={mailboxForm.provider}
              onValueChange={(value) =>
                setMailboxForm((prev) =>
                  applyMailboxProviderPreset(
                    prev,
                    value as Mailbox["provider"],
                  ),
                )
              }
            >
              <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MAILBOX_PROVIDER_PRESETS).map(
                  ([provider, preset]) => (
                    <SelectItem key={provider} value={provider}>
                      {preset.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <input
              value={mailboxForm.name}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="Mailbox name"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.displayName}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  displayName: event.target.value,
                }))
              }
              placeholder="Display name"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.emailAddress}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  emailAddress: event.target.value,
                  loginUsername:
                    !prev.loginUsername ||
                    prev.loginUsername === prev.emailAddress
                      ? event.target.value
                      : prev.loginUsername,
                }))
              }
              placeholder="Mailbox email"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.loginUsername}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  loginUsername: event.target.value,
                }))
              }
              placeholder="Login username"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.password}
              type="password"
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              placeholder={
                mailboxForm.provider === "gmail"
                  ? "16-character Google App Password"
                  : isEditingMailbox
                    ? "New mailbox password / App Password"
                    : "Mailbox password"
              }
              className={`rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-white ${
                mailboxPasswordError ? "border-red-500/70" : "border-zinc-700"
              }`}
            />
            <input
              value={mailboxForm.imapHost}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  imapHost: event.target.value,
                }))
              }
              placeholder="IMAP host"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.imapPort}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  imapPort: event.target.value,
                }))
              }
              placeholder="IMAP port"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.smtpHost}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  smtpHost: event.target.value,
                }))
              }
              placeholder="SMTP host"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.smtpPort}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  smtpPort: event.target.value,
                }))
              }
              placeholder="SMTP port"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.syncFolder}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  syncFolder: event.target.value,
                }))
              }
              placeholder="Sync folder"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <Select
              value={mailboxForm.organizationId}
              onValueChange={(value) =>
                setMailboxForm((prev) => ({ ...prev, organizationId: value }))
              }
            >
              <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Personal mailbox</SelectItem>
                {data.organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={mailboxForm.isShared}
                onChange={(event) =>
                  setMailboxForm((prev) => ({
                    ...prev,
                    isShared: event.target.checked,
                  }))
                }
              />
              Shared mailbox
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <div className="text-sm font-medium text-zinc-200">
              {mailboxPreset.label}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {mailboxPreset.description}
            </div>
            {mailboxForm.provider === "gmail" ? (
              <div className="mt-2 text-xs text-amber-300">
                Paste the 16-character Google App Password. Forge strips the
                display spaces automatically.
              </div>
            ) : null}
            {mailboxPasswordError ? (
              <div className="mt-2 text-xs text-red-300">
                {mailboxPasswordError}
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeMailboxForm}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMailboxCreate}
              disabled={
                busyState === "mailbox" ||
                !mailboxForm.name ||
                !mailboxForm.password ||
                Boolean(mailboxPasswordError)
              }
              className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busyState === "mailbox"
                ? isEditingMailbox
                  ? "Updating…"
                  : "Connecting…"
                : isEditingMailbox
                  ? "Update Mailbox"
                  : "Save Mailbox"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
                {view === "email-quarantine" ? (
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {filteredItems.length} Message
                {filteredItems.length === 1 ? "" : "s"}
              </div>
              {view === "email-quarantine" ? (
                <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                  {quarantineCount} quarantined
                </div>
              ) : null}
            </div>
            {view !== "email-quarantine" ? (
              <div className="mb-3 inline-flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
                {[
                  { id: "all", label: "All" },
                  { id: "unread", label: "Unread" },
                  { id: "read", label: "Read" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setReadFilter(tab.id as "all" | "unread" | "read")
                    }
                    className={
                      readFilter === tab.id
                        ? "rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white"
                        : "rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
            <EmailWorkList
              items={filteredItems}
              mailboxes={mailboxes}
              projects={data.projects}
              selectedId={selectedThreadId}
              onSelect={(item) => setSelectedThreadId(item.id)}
              onSenderClick={(sender) => setSenderHistory(sender)}
              emptyLabel={
                view === "email-quarantine"
                  ? "No suspicious email is waiting for review."
                  : "No inbox work yet."
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          {loadingThread ? (
            <div className="flex min-h-[420px] items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : selectedThread ? (
            <div className="space-y-5">
              <div className="border-b border-zinc-800 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      {selectedThread.status}
                      {selectedThread.isUnread ? (
                        <span className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/35 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-[10px] tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                          Unread
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-xl font-semibold text-white">
                      {selectedThread.actionTitle}
                    </h2>
                    <div className="text-sm text-zinc-500">
                      {selectedThread.subject}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                      <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>AI Says:</span>
                      </div>
                      <div>
                        {selectedThread.summaryText ||
                          selectedThread.previewText ||
                          "No summary yet."}
                      </div>
                    </div>
                    {selectedThread.actionReason ? (
                      <div className="text-xs text-zinc-500">
                        {selectedThread.actionReason}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("mark_read")}
                    disabled={Boolean(busyState) || !selectedThread.isUnread}
                    title={
                      selectedThread.isUnread
                        ? "Mark thread as read"
                        : "Thread already read"
                    }
                    aria-label={
                      selectedThread.isUnread
                        ? "Mark thread as read"
                        : "Thread already read"
                    }
                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busyState === "mark_read" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MailCheck className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div ref={projectPickerRef} className="relative pt-2">
                  <FloatingFieldLabel label="Project" />
                  {isProjectPickerOpen ? (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={projectSearchQuery}
                          onChange={(event) =>
                            setProjectSearchQuery(event.target.value)
                          }
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
                          placeholder="Search projects..."
                          autoFocus
                          disabled={busyState === "project"}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={closeProjectPicker}
                          className="absolute inset-y-0 right-3 inline-flex items-center text-zinc-500 transition-colors hover:text-zinc-300"
                          aria-label="Close project search"
                        >
                          <ChevronDown className="h-4 w-4 rotate-180" />
                        </button>
                      </div>
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
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsProjectPickerOpen(true)}
                      disabled={busyState === "project"}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedProject ? (
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className="h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: selectedProject.color }}
                          />
                          <span className="truncate">
                            {selectedProject.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400">Select a project</span>
                      )}
                      {busyState === "project" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-zinc-400" />
                      )}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateTasks}
                  disabled={busyState === "tasks"}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  <FolderSearch className="h-4 w-4" />
                  Generate Tasks
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {view === "email-quarantine" ? (
                  renderThreadActionButton("approve", {
                    label: "Approve",
                  })
                ) : (
                  renderThreadActionButton("quarantine", {
                    icon: <ShieldAlert className="h-4 w-4" />,
                  })
                )}
                {renderThreadActionButton("archive", {
                  icon: <Archive className="h-4 w-4" />,
                })}
                {renderThreadActionButton("spam", {
                  icon: <ShieldAlert className="h-4 w-4" />,
                })}
                {renderThreadActionButton("always_delete_sender", {
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                })}
              </div>

              {queuedAction ? (
                <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--theme-primary-rgb))]/30 bg-[rgb(var(--theme-primary-rgb))]/10 px-3 py-2 text-sm text-zinc-200">
                  <span>{getQueuedThreadActionMessage(queuedAction)}</span>
                  <button
                    type="button"
                    onClick={handleUndoQueuedAction}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:border-zinc-600"
                  >
                    Undo
                  </button>
                </div>
              ) : null}

              {selectedThread.linkedTasks?.length > 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                    Linked Tasks
                  </div>
                  <div className="space-y-2">
                    {selectedThread.linkedTasks.map((task: any) => (
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Reply className="h-4 w-4" />
                    Reply
                  </div>
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
                <textarea
                  value={replyContent}
                  onChange={(event) => setReplyContent(event.target.value)}
                  rows={5}
                  placeholder={
                    replyMode === "internal_note"
                      ? "Write an internal note for linked Forge tasks…"
                      : "Reply to all participants…"
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={busyState === "reply" || !replyContent.trim()}
                    className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busyState === "reply" ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                  Conversation
                </div>
                <div className="space-y-3">
                  {(selectedThread.conversation || []).map((entry: any) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-zinc-200">
                          {entry.authorName ||
                            entry.authorEmail ||
                            "Unknown sender"}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {new Date(entry.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
                        {entry.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-zinc-500">
              Select an email thread to inspect it.
            </div>
          )}
        </div>
      </div>

      {statusMessage ? (
        <div className="text-sm text-zinc-400">{statusMessage}</div>
      ) : null}

      <EmailSpamReviewModal
        open={isSpamReviewOpen}
        onOpenChange={setIsSpamReviewOpen}
        items={inboxItems}
        mailboxes={mailboxes}
        rules={data.emailRules}
        mailboxFilterId={selectedMailboxId}
        onRefresh={onRefresh}
      />

      <SenderHistoryModal
        open={Boolean(senderHistory)}
        senderName={senderHistory?.name || null}
        senderEmail={senderHistory?.email || null}
        onOpenChange={(open) => {
          if (!open) {
            setSenderHistory(null);
          }
        }}
      />
    </div>
  );
}
