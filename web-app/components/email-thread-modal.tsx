"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  FolderSearch,
  Loader2,
  MailCheck,
  Reply,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ConversationEntry, InboxItem, Project } from "@/lib/types";

type ThreadAction =
  | "approve"
  | "quarantine"
  | "mark_read"
  | "archive"
  | "spam"
  | "delete"
  | "always_delete_sender";

type EmailThreadDetail = InboxItem & {
  conversation?: ConversationEntry[];
  linkedTasks?: Array<{
    id: string;
    name: string;
  }>;
  project_id?: string | null;
  projectId?: string | null;
};

type EmailThreadModalProps = {
  open: boolean;
  threadId: string | null;
  projects: Project[];
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

export function EmailThreadModal({
  open,
  threadId,
  projects,
  onOpenChange,
  onRefresh,
}: EmailThreadModalProps) {
  const [thread, setThread] = useState<EmailThreadDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open || !threadId) {
      setThread(null);
      setLoadingThread(false);
      setBusyState(null);
      setStatusMessage(null);
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
    setReplyMode("reply_all");
  }, [threadId]);

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

  const refreshParent = async () => {
    await onRefresh?.();
  };

  const reloadThread = async (targetThreadId: string) => {
    setLoadingThread(true);

    try {
      const payload = await fetchThreadDetail(targetThreadId);
      setThread(payload);
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

  const handleReply = async () => {
    if (!threadId || !replyContent.trim()) return;

    setBusyState("reply");

    try {
      const response = await fetch(`/api/email/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: replyContent,
          mode: replyMode,
        }),
      });

      await parseApiResponse(response, "Failed to send reply");
      setReplyContent("");
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

  const handleThreadAction = async (action: ThreadAction) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,72rem)] max-w-[72rem] overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-white sm:max-h-[92vh] sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {thread?.actionTitle || "Email thread"}
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
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
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
                      {thread.actionTitle}
                    </h2>
                    <div className="text-sm text-zinc-500">
                      {thread.subject}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                      <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>AI Says:</span>
                      </div>
                      <div>
                        {thread.summaryText ||
                          thread.previewText ||
                          "No summary yet."}
                      </div>
                    </div>
                    {thread.actionReason ? (
                      <div className="text-xs text-zinc-500">
                        {thread.actionReason}
                      </div>
                    ) : null}
                  </div>
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
                <button
                  type="button"
                  onClick={() => void handleThreadAction("quarantine")}
                  disabled={Boolean(busyState)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Quarantine
                </button>
                <button
                  type="button"
                  onClick={() => void handleThreadAction("archive")}
                  disabled={Boolean(busyState)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => void handleThreadAction("spam")}
                  disabled={Boolean(busyState)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Spam
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleThreadAction("always_delete_sender")
                  }
                  disabled={Boolean(busyState)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Always Delete Sender
                </button>
              </div>

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
                  {(thread.conversation || []).map((entry) => (
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
