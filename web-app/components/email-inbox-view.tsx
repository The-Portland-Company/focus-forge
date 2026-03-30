"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bot,
  FolderSearch,
  Loader2,
  Mail,
  RefreshCw,
  Reply,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { EmailWorkList } from "@/components/email-work-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Database,
  EmailRule,
  InboxItem,
  Mailbox,
  SummaryProfile,
} from "@/lib/types";
import {
  getVisibleMailboxSyncError,
  isEmailInboxView,
} from "@/lib/email-inbox/shared";
import {
  applyMailboxProviderPreset,
  createEmptyMailboxForm,
  createMailboxFormFromMailbox,
  MAILBOX_PROVIDER_PRESETS,
} from "@/lib/email-inbox/provider-presets";

type EmailInboxViewProps = {
  view: string;
  data: Database;
  onRefresh: () => Promise<void> | void;
  currentUserId?: string;
};

const DEFAULT_RULE_CONDITIONS = JSON.stringify(
  [{ field: "sender_domain", operator: "contains", value: "example.com" }],
  null,
  2,
);
const DEFAULT_RULE_ACTIONS = JSON.stringify([{ type: "quarantine" }], null, 2);
const DEFAULT_PROFILE_SETTINGS = JSON.stringify(
  {
    toneDetection: true,
    routeToProjects: true,
    generateTasks: true,
  },
  null,
  2,
);

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
  const [loadingThread, setLoadingThread] = useState(false);
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const [mailboxForm, setMailboxForm] = useState(createEmptyMailboxForm);
  const [replyContent, setReplyContent] = useState("");
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [busyState, setBusyState] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<EmailRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    description: "",
    mailboxId: "all",
    priority: "100",
    matchMode: "all",
    stopProcessing: true,
    isActive: true,
    conditionsJson: DEFAULT_RULE_CONDITIONS,
    actionsJson: DEFAULT_RULE_ACTIONS,
  });
  const [editingProfile, setEditingProfile] = useState<SummaryProfile | null>(
    null,
  );
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
    const base = data.inboxItems.filter((item) => {
      if (selectedMailboxId !== "all" && item.mailboxId !== selectedMailboxId) {
        return false;
      }

      if (view === "email-quarantine") {
        return item.status === "quarantine";
      }

      return item.status !== "quarantine" && item.status !== "deleted";
    });

    return base;
  }, [data.inboxItems, selectedMailboxId, view]);

  const visibleSyncError = useMemo(
    () => getVisibleMailboxSyncError(data.mailboxes, selectedMailboxId),
    [data.mailboxes, selectedMailboxId],
  );
  const selectedMailbox = useMemo(
    () =>
      selectedMailboxId === "all"
        ? null
        : data.mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ||
          null,
    [data.mailboxes, selectedMailboxId],
  );
  const isEditingMailbox = editingMailboxId !== null;

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

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const mailboxPreset = MAILBOX_PROVIDER_PRESETS[mailboxForm.provider];

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
    if (busyState || data.mailboxes.length === 0) return;
    setBusyState("sync");
    try {
      const mailboxesToSync =
        selectedMailboxId === "all"
          ? data.mailboxes
          : data.mailboxes.filter(
              (mailbox) => mailbox.id === selectedMailboxId,
            );

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

      await onRefresh();

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
      await onRefresh();
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
    setBusyState("mailbox");
    const wasEditingMailbox = isEditingMailbox;
    let createdMailboxId: string | null = null;
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
          password: mailboxForm.password,
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
      await onRefresh();

      const syncedMessageCount = await syncMailboxAfterCreate(
        payload.id,
        payload.name,
      );

      await onRefresh();
      updateStatus(
        wasEditingMailbox
          ? `Mailbox ${payload.name} updated and synced ${syncedMessageCount} messages.`
          : `Mailbox ${payload.name} connected and synced ${syncedMessageCount} messages.`,
      );
    } catch (error) {
      if (createdMailboxId) {
        await onRefresh();
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to create mailbox",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleThreadAction = async (action: string) => {
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
      await onRefresh();
      setSelectedThread(payload.id ? payload : selectedThread);
      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to apply action",
      );
    } finally {
      setBusyState(null);
    }
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
      await onRefresh();
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
      await onRefresh();
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
      await onRefresh();
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

  const handleSaveRule = async () => {
    setBusyState("rule");
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
      setEditingRule(null);
      setRuleForm({
        name: "",
        description: "",
        mailboxId: "all",
        priority: "100",
        matchMode: "all",
        stopProcessing: true,
        isActive: true,
        conditionsJson: DEFAULT_RULE_CONDITIONS,
        actionsJson: DEFAULT_RULE_ACTIONS,
      });
      await onRefresh();
      updateStatus("Rule saved.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to save rule",
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
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Email Rules</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Deterministic triage runs before AI classification.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-400">
            {data.ruleStats.active} active · {data.ruleStats.quarantine}{" "}
            quarantine · {data.ruleStats.alwaysDelete} always delete
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            {data.emailRules.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
                No rules yet.
              </div>
            ) : (
              data.emailRules.map((rule) => (
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
            <h2 className="text-lg font-semibold text-white">
              {editingRule ? "Edit Rule" : "New Rule"}
            </h2>
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
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Mailbox scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All accessible mailboxes
                    </SelectItem>
                    {data.mailboxes.map((mailbox) => (
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
                  disabled={busyState === "rule" || !ruleForm.name.trim()}
                  className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busyState === "rule" ? "Saving…" : "Save Rule"}
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
                  {data.mailboxes.map((mailbox) => (
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
          <Select
            value={selectedMailboxId}
            onValueChange={setSelectedMailboxId}
          >
            <SelectTrigger className="w-[220px] border-zinc-700 bg-zinc-900 text-white">
              <SelectValue placeholder="Mailbox" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              {data.mailboxes.map((mailbox) => (
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
            disabled={data.mailboxes.length === 0 || busyState === "sync"}
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
                isEditingMailbox
                  ? "New mailbox password / App Password"
                  : "Mailbox password"
              }
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
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
                !mailboxForm.password
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
                {filteredItems.length} thread
                {filteredItems.length === 1 ? "" : "s"}
              </div>
              {view === "email-quarantine" ? (
                <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                  {data.quarantineCount} quarantined
                </div>
              ) : null}
            </div>
            <EmailWorkList
              items={filteredItems}
              mailboxes={data.mailboxes}
              projects={data.projects}
              selectedId={selectedThreadId}
              onSelect={(item) => setSelectedThreadId(item.id)}
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
              <div className="space-y-2 border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  {selectedThread.status}
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedThread.actionTitle}
                </h2>
                <div className="text-sm text-zinc-500">
                  {selectedThread.subject}
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  {selectedThread.summaryText ||
                    selectedThread.previewText ||
                    "No summary yet."}
                </div>
                {selectedThread.actionReason ? (
                  <div className="text-xs text-zinc-500">
                    {selectedThread.actionReason}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  value={selectedThread.projectId || "none"}
                  onValueChange={(value) => {
                    if (value !== "none") void handleProjectAssign(value);
                  }}
                >
                  <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                    <SelectValue placeholder="Assign project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a project</SelectItem>
                    {data.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("approve")}
                    disabled={Boolean(busyState)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("quarantine")}
                    disabled={Boolean(busyState)}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                  >
                    Quarantine
                  </button>
                )}
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
                    className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
    </div>
  );
}
