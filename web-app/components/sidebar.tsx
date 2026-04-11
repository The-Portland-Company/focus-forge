"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Calendar,
  CalendarDays,
  Star,
  Hash,
  GripVertical,
  Trash2,
  Archive,
  FolderPlus,
  Building2,
  Edit,
  User,
  Settings,
  ChevronsUpDown,
  ChevronsDownUp,
  CheckSquare,
  Folder,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Mail,
  Clock,
  Rss,
  Copy,
  Check,
  RefreshCw,
  FileCode2,
  Play,
  Square,
} from "lucide-react";
import { Database, Project } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { Tooltip } from "./tooltip";
import { formatElapsed } from "@/lib/time/client";
import { isOverdue, isToday, isTomorrow, isRestOfWeek } from "@/lib/date-utils";
import { filterTasksByBlockedStatus } from "@/lib/dependency-utils";
import { shouldShowInboxItemInToday } from "@/lib/email-inbox/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SidebarProps {
  data: Database;
  onAddTask: () => void;
  currentView: string;
  onViewChange: (view: string) => void;
  onProjectUpdate?: (projectId: string, updates: Partial<Project>) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectEdit?: (projectId: string) => void;
  onAddProject?: (organizationId: string) => void;
  onAddProjectGeneral?: () => void;
  onAddOrganization?: () => void;
  onOrganizationDelete?: (organizationId: string) => void;
  onOrganizationEdit?: (organizationId: string) => void;
  onOrganizationArchive?: (organizationId: string) => void;
  onProjectsReorder?: (organizationId: string, projectIds: string[]) => void;
  onOrganizationsReorder?: (organizationIds: string[]) => void;
  isAddingTask?: boolean; // Whether the add task modal is open
}

export function Sidebar({
  data,
  onAddTask,
  currentView,
  onViewChange,
  onProjectUpdate,
  onProjectDelete,
  onProjectEdit,
  onAddProject,
  onAddProjectGeneral,
  onAddOrganization,
  onOrganizationDelete,
  onOrganizationEdit,
  onOrganizationArchive,
  onProjectsReorder,
  onOrganizationsReorder,
  isAddingTask,
}: SidebarProps) {
  const router = useRouter();
  // Initialize with collapsed state by default
  const [expandedOrgs, setExpandedOrgs] = useState<string[]>([]);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [showPendingInvitations, setShowPendingInvitations] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedProject, setDraggedProject] = useState<string | null>(null);
  const [draggedOrg, setDraggedOrg] = useState<string | null>(null);
  const [dragOverOrg, setDragOverOrg] = useState<string | null>(null);
  const [dragOverProject, setDragOverProject] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<
    "top" | "bottom" | null
  >(null);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [hoveredOrg, setHoveredOrg] = useState<string | null>(null);
  const [copiedOrgId, setCopiedOrgId] = useState<string | null>(null);
  const copyOrgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarCopied, setCalendarCopied] = useState(false);
  const calendarPopoverRef = useRef<HTMLDivElement>(null);
  const [currentTimerStartedAt, setCurrentTimerStartedAt] = useState<
    string | null
  >(null);
  const [currentTimerEntryId, setCurrentTimerEntryId] = useState<string | null>(
    null,
  );
  const [currentTimerLabel, setCurrentTimerLabel] = useState("Focus: Time");
  const [currentTimerElapsed, setCurrentTimerElapsed] = useState("00:00:00");
  const [currentTimerOrganizationId, setCurrentTimerOrganizationId] = useState<
    string | null
  >(null);
  const [currentTimerProjectId, setCurrentTimerProjectId] = useState<
    string | null
  >(null);
  const [currentTimerDescription, setCurrentTimerDescription] = useState("");
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [timerModalMode, setTimerModalMode] = useState<"start" | "stop">(
    "start",
  );
  const [timerForm, setTimerForm] = useState({
    title: "Focus: Time",
    organizationId: "",
    projectId: "",
    description: "",
  });
  const [timerSubmitting, setTimerSubmitting] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);

  // Load saved preferences from localStorage
  useEffect(() => {
    if (!hasLoadedPreferences) {
      // Load expanded organizations
      const storedOrgs = localStorage.getItem("expandedOrganizations");
      if (storedOrgs) {
        try {
          const parsed = JSON.parse(storedOrgs);
          if (Array.isArray(parsed)) {
            setExpandedOrgs(parsed);
          }
        } catch (e) {
          console.error("Failed to parse saved expanded organizations:", e);
        }
      }

      // Load collapsed state
      const storedCollapsed = localStorage.getItem("sidebarCollapsed");
      if (storedCollapsed === "true") {
        setIsCollapsed(true);
      }

      setHasLoadedPreferences(true);
    }
  }, [hasLoadedPreferences]);

  // Save expanded state to localStorage whenever it changes (only after initial load)
  useEffect(() => {
    if (hasLoadedPreferences) {
      const timeoutId = setTimeout(() => {
        localStorage.setItem(
          "expandedOrganizations",
          JSON.stringify(expandedOrgs),
        );
      }, 500); // Debounce to avoid too many updates

      return () => clearTimeout(timeoutId);
    }
  }, [expandedOrgs, hasLoadedPreferences]);

  // Save collapsed state to localStorage
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem("sidebarCollapsed", isCollapsed.toString());
    }
  }, [isCollapsed, hasLoadedPreferences]);

  useEffect(() => {
    return () => {
      if (copyOrgTimeoutRef.current) {
        clearTimeout(copyOrgTimeoutRef.current);
      }
    };
  }, []);

  // Fetch calendar token on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch("/api/calendar/token", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setCalendarToken(data.token);
        }
      } catch {}
    };
    fetchToken();
  }, []);

  const loadCurrentTimer = async () => {
    try {
      const response = await fetch("/api/v1/time/current", {
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) return;

      setCurrentTimerStartedAt(payload.data?.startedAt || null);
      setCurrentTimerEntryId(payload.data?.id || null);
      setCurrentTimerLabel(payload.data?.title || "Focus: Time");
      setCurrentTimerOrganizationId(payload.data?.organizationId || null);
      setCurrentTimerProjectId(payload.data?.projectId || null);
      setCurrentTimerDescription(payload.data?.description || "");
    } catch (error) {
      console.error("Failed to load current time entry:", error);
    }
  };

  useEffect(() => {
    void loadCurrentTimer();
    const interval = window.setInterval(() => {
      void loadCurrentTimer();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!currentTimerStartedAt) {
      setCurrentTimerElapsed("00:00:00");
      return;
    }

    setCurrentTimerElapsed(formatElapsed(currentTimerStartedAt));
    const interval = window.setInterval(() => {
      setCurrentTimerElapsed(formatElapsed(currentTimerStartedAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentTimerStartedAt]);

  const timerProjects = data.projects
    .filter(
      (project) =>
        !project.archived &&
        (!timerForm.organizationId ||
          project.organizationId === timerForm.organizationId),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const openTimerModal = (mode: "start" | "stop") => {
    const defaultOrganizationId =
      currentTimerOrganizationId || data.organizations[0]?.id || "";
    setTimerModalMode(mode);
    setTimerError(null);
    setTimerForm({
      title:
        mode === "stop"
          ? currentTimerLabel || "Focus: Time"
          : currentTimerLabel !== "Focus: Time" && !currentTimerStartedAt
            ? currentTimerLabel
            : "Focus: Time",
      organizationId: defaultOrganizationId,
      projectId: currentTimerProjectId || "",
      description: currentTimerDescription || "",
    });
    setIsTimerModalOpen(true);
  };

  const handleTimerSubmit = async () => {
    if (!timerForm.organizationId) {
      setTimerError("Choose an organization.");
      return;
    }

    setTimerSubmitting(true);
    setTimerError(null);

    try {
      if (timerModalMode === "start") {
        const response = await fetch("/api/v1/time/entries", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: timerForm.organizationId,
            projectId: timerForm.projectId || null,
            taskIds: [],
            title: timerForm.title.trim() || "Focus: Time",
            description: timerForm.description.trim() || null,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message || "Failed to start timer.");
        }
      } else {
        if (!currentTimerEntryId) {
          throw new Error("No running timer to stop.");
        }

        const response = await fetch(`/api/v1/time/entries/${currentTimerEntryId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: timerForm.organizationId,
            projectId: timerForm.projectId || null,
            title: timerForm.title.trim() || "Focus: Time",
            description: timerForm.description.trim() || null,
            endedAt: new Date().toISOString(),
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message || "Failed to stop timer.");
        }
      }

      await loadCurrentTimer();
      setIsTimerModalOpen(false);
    } catch (error) {
      setTimerError(
        error instanceof Error ? error.message : "Failed to update timer.",
      );
    } finally {
      setTimerSubmitting(false);
    }
  };

  // Close calendar popover on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(e.target as Node)
      ) {
        setShowCalendarPopover(false);
      }
    };
    if (showCalendarPopover) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCalendarPopover]);

  const getCalendarFeedUrl = () => {
    if (!calendarToken) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/api/calendar/feed?token=${calendarToken}`;
  };

  const copyCalendarUrl = async () => {
    const url = getCalendarFeedUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCalendarCopied(true);
      setTimeout(() => setCalendarCopied(false), 2000);
    } catch {}
  };

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) =>
      prev.includes(orgId)
        ? prev.filter((id) => id !== orgId)
        : [...prev, orgId],
    );
  };

  const copyOrgId = async (orgId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(orgId);
      setCopiedOrgId(orgId);
      if (copyOrgTimeoutRef.current) {
        clearTimeout(copyOrgTimeoutRef.current);
      }
      copyOrgTimeoutRef.current = setTimeout(() => setCopiedOrgId(null), 900);
    } catch (error) {
      console.error("Failed to copy organization ID:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleResendInvite = async (userId: string) => {
    setResendingUserId(userId);
    try {
      const currentUserEmail = data.users?.[0]?.email;
      const response = await fetch("/api/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ccEmail: currentUserEmail,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error("Resend invite error:", result.error);
        alert(`Failed to resend invite: ${result.error}`);
      }
    } catch (error) {
      console.error("Resend invite error:", error);
      alert("Failed to resend invitation");
    } finally {
      setResendingUserId(null);
    }
  };

  // Get pending users
  const pendingUsers = data.users?.filter((u) => u.status === "pending") || [];

  const todayBadgeCount = useMemo(() => {
    const activeTodayTasks = filterTasksByBlockedStatus(
      data.tasks.filter((task) => {
        if (task.completed) return false;

        const dueDate = (task as { due_date?: string }).due_date || task.dueDate;
        if (!dueDate) return false;

        return (
          isOverdue(dueDate) ||
          isToday(dueDate) ||
          isTomorrow(dueDate) ||
          isRestOfWeek(dueDate)
        );
      }),
      data.tasks,
      false,
    );

    const todayEmailCount = data.inboxItems.filter(shouldShowInboxItemInToday).length;

    return activeTodayTasks.length + todayEmailCount;
  }, [data.inboxItems, data.tasks]);

  const inboxItemsCount = useMemo(() => {
    const visibleInboxItems = data.inboxItems.filter(
      (item) => item.status !== "quarantine" && item.status !== "deleted",
    );

    return {
      total: visibleInboxItems.length,
      unread: visibleInboxItems.filter((item) => item.isUnread).length,
    };
  }, [data.inboxItems]);

  const orgProjects = (orgId: string) =>
    data.projects
      .filter((project) => {
        const projectOrgId =
          (project as any).organization_id ?? project.organizationId;
        return projectOrgId === orgId && !project.archived;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));

  const getProjectAcronym = (name: string) => {
    const words = name.split(/\s+/);
    if (words.length === 1) {
      return name.substring(0, 2).toUpperCase();
    }
    return words
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .substring(0, 3);
  };

  return (
    <div
      className={`${isCollapsed ? "w-[60px]" : "w-[clamp(240px,22vw,320px)]"} h-full shrink-0 overflow-hidden bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-300`}
    >
      <div className={`${isCollapsed ? "p-2" : "p-3"}`}>
        <div className="flex items-center justify-between mb-3">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
                <UserAvatar
                  name={
                    data.users?.[0]?.name ||
                    data.users?.[0]?.firstName ||
                    "User"
                  }
                  profileColor={data.users?.[0]?.profileColor}
                  memoji={data.users?.[0]?.profileMemoji}
                  size={24}
                  className="flex-shrink-0 text-xs"
                />
                <div className="text-sm text-white font-medium leading-none">
                  {data.users?.[0]?.firstName || "User"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/settings"
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Settings"
                >
                  <Settings className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group mx-auto"
              title="Expand sidebar"
            >
              <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
            </button>
          )}
        </div>

        {!isCollapsed ? (
          <div className="flex gap-2">
            <button
              onClick={onAddTask}
              className={`flex-1 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-all ${
                isAddingTask ? "" : "btn-theme-primary"
              }`}
              style={
                isAddingTask && data.users?.[0]?.profileColor
                  ? { background: data.users[0].profileColor }
                  : undefined
              }
              title="Add Task"
            >
              <CheckSquare className="w-4 h-4" />
            </button>

            <button
              onClick={onAddProjectGeneral}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
              title="Add Project"
            >
              <Folder className="w-4 h-4" />
            </button>

            <button
              onClick={onAddOrganization}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
              title="Add Organization"
            >
              <Building2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Tooltip content="Add Task">
              <button
                onClick={onAddTask}
                className={`text-white rounded-lg p-2 flex items-center justify-center transition-all w-full ${
                  isAddingTask ? "" : "btn-theme-primary"
                }`}
                style={
                  isAddingTask && data.users?.[0]?.profileColor
                    ? { background: data.users[0].profileColor }
                    : undefined
                }
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            </Tooltip>

            <Tooltip content="Add Project">
              <button
                onClick={onAddProjectGeneral}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg p-2 flex items-center justify-center transition-colors w-full"
              >
                <Folder className="w-4 h-4" />
              </button>
            </Tooltip>

            <Tooltip content="Add Organization">
              <button
                onClick={onAddOrganization}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg p-2 flex items-center justify-center transition-colors w-full"
              >
                <Building2 className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <nav
        className={`flex-1 ${isCollapsed ? "px-1" : "px-1.5"} overflow-y-auto`}
      >
        {isCollapsed ? (
          <div className="mt-1 flex flex-col gap-2">
            <Tooltip
              content={
                currentTimerStartedAt
                  ? `${currentTimerLabel} · ${currentTimerElapsed}`
                  : "Focus: Time"
              }
            >
              <Link
                href="/time"
                className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                  currentView === "time"
                    ? "bg-zinc-800 text-white"
                    : currentTimerStartedAt
                      ? "text-emerald-300 hover:bg-zinc-800/50 hover:text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
                }`}
              >
                <Clock className="w-4 h-4" />
              </Link>
            </Tooltip>
            <Tooltip content={currentTimerStartedAt ? "Stop timer" : "Start timer"}>
              <button
                type="button"
                onClick={() =>
                  openTimerModal(currentTimerStartedAt ? "stop" : "start")
                }
                className={`w-full rounded-lg border px-2 py-2 transition-colors ${
                  currentTimerStartedAt
                    ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-200 hover:border-emerald-700 hover:text-white"
                    : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {currentTimerStartedAt ? (
                  <Square className="mx-auto h-4 w-4" />
                ) : (
                  <Play className="mx-auto h-4 w-4" />
                )}
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <Link
              href="/time"
              className={`flex-1 flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView === "time"
                  ? "bg-zinc-800 text-white"
                  : currentTimerStartedAt
                    ? "text-emerald-300 hover:bg-zinc-800/50 hover:text-white"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="truncate">{currentTimerLabel}</span>
              </span>
              <span className="font-mono text-xs">{currentTimerElapsed}</span>
            </Link>
            <Tooltip content={currentTimerStartedAt ? "Stop timer" : "Start timer"}>
              <button
                type="button"
                onClick={() =>
                  openTimerModal(currentTimerStartedAt ? "stop" : "start")
                }
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  currentTimerStartedAt
                    ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-200 hover:border-emerald-700 hover:text-white"
                    : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {currentTimerStartedAt ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
            </Tooltip>
          </div>
        )}

        {isCollapsed ? (
          <Tooltip content="Search">
            <Link
              href="/search"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "search"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <Search className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/search"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === "search"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <Search className="w-4 h-4" />
            Search
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Today">
            <Link
              href="/today"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "today"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/today"
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === "today"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <Calendar className="w-4 h-4" />
              Today
            </span>
            {todayBadgeCount > 0 ? (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                {todayBadgeCount}
              </span>
            ) : null}
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip
            content={
              data.quarantineCount > 0
                ? `Email Inbox (${data.quarantineCount} quarantined)`
                : "Email Inbox"
            }
          >
            <Link
              href="/email-inbox"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView.startsWith("email-")
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <Mail className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <div className="mb-1">
            <Link
              href="/email-inbox"
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView.startsWith("email-")
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Mail className="w-4 h-4" />
                Email Inbox
              </span>
              {data.quarantineCount > 0 ? (
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                  {data.quarantineCount}
                </span>
              ) : null}
            </Link>
            <div className="mt-1 space-y-1 border-t border-zinc-800 pt-1">
              <Link
                href="/email-inbox"
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  currentView === "email-inbox"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                <span>Inbox</span>
                {inboxItemsCount.total > 0 ? (
                  <span className="text-[10px] text-zinc-400">
                    {inboxItemsCount.unread}/{inboxItemsCount.total}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/email-quarantine"
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  currentView === "email-quarantine"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                <span>Quarantine</span>
                {data.quarantineCount > 0 ? (
                  <span className="text-[10px] text-zinc-400">
                    {data.quarantineCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/email-rules"
                className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                  currentView === "email-rules"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                Rules
              </Link>
              <Link
                href="/email-ai-lab"
                className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                  currentView === "email-ai-lab"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}
              >
                AI Lab
              </Link>
            </div>
          </div>
        )}

        {isCollapsed ? (
          <Tooltip content="Upcoming">
            <Link
              href="/upcoming"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "upcoming"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/upcoming"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === "upcoming"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Upcoming
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Calendar">
            <Link
              href="/calendar"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "calendar"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/calendar"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentView === "calendar"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </Link>
        )}

        {isCollapsed ? (
          <Tooltip content="Favorites">
            <Link
              href="/favorites"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors mb-4 ${
                currentView === "favorites"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
            >
              <Star className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/favorites"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-4 ${
              currentView === "favorites"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
          >
            <Star className="w-4 h-4" />
            Favorites
          </Link>
        )}

        {!isCollapsed && (
          <div className="flex items-center justify-between px-3 py-1 mb-0">
            <span className="text-xs font-medium text-zinc-500 uppercase">
              Organizations
            </span>
            <button
              onClick={() => {
                const allOrgIds = data.organizations.map((org) => org.id);
                if (expandedOrgs.length === allOrgIds.length) {
                  // All are expanded, so collapse all
                  setExpandedOrgs([]);
                } else {
                  // Some or none are expanded, so expand all
                  setExpandedOrgs(allOrgIds);
                }
              }}
              className="p-1 rounded hover:bg-zinc-800 transition-colors group"
              title={
                expandedOrgs.length === data.organizations.length
                  ? "Collapse all"
                  : "Expand all"
              }
            >
              {expandedOrgs.length === data.organizations.length ? (
                <ChevronsDownUp className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
              ) : (
                <ChevronsUpDown className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
              )}
            </button>
          </div>
        )}

        <div className="space-y-0">
          {isCollapsed
            ? // Collapsed view - show only organization dots
              data.organizations
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((org) => (
                  <Tooltip key={org.id} content={org.name}>
                    <Link
                      href={`/org-${org.id}`}
                      className={`w-full flex items-center justify-center px-2 py-2 rounded-lg transition-colors ${
                        currentView === `org-${org.id}`
                          ? "bg-zinc-800"
                          : "hover:bg-zinc-800/50"
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-full"
                        style={{ backgroundColor: org.color }}
                      />
                    </Link>
                  </Tooltip>
                ))
            : // Expanded view - show full organization structure
              data.organizations
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((org) => (
                  <div
                    key={org.id}
                    draggable
                    onMouseEnter={() => setHoveredOrg(org.id)}
                    onMouseLeave={() => setHoveredOrg(null)}
                    onDragStart={(e) => {
                      setDraggedOrg(org.id);
                      e.dataTransfer.effectAllowed = "move";
                      setTimeout(() => {
                        e.currentTarget.classList.add("dragging");
                      }, 0);
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.classList.remove("dragging");
                      setDraggedOrg(null);
                      setDragOverOrg(null);
                      setDragOverPosition(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedProject && !draggedOrg) {
                        // Dragging a project over an organization
                        setDragOverOrg(org.id);
                      } else if (draggedOrg && draggedOrg !== org.id) {
                        // Dragging an organization
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const height = rect.height;
                        setDragOverOrg(org.id);
                        setDragOverPosition(y < height / 2 ? "top" : "bottom");
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverOrg(null);
                      setDragOverPosition(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedProject && onProjectUpdate) {
                        // Get the project being dragged
                        const project = data.projects.find(
                          (p) => p.id === draggedProject,
                        );
                        if (project && project.organizationId !== org.id) {
                          // Moving to a different organization
                          onProjectUpdate(draggedProject, {
                            organizationId: org.id,
                          });
                        }
                      } else if (
                        draggedOrg &&
                        draggedOrg !== org.id &&
                        onOrganizationsReorder
                      ) {
                        // Reorder organizations
                        const orgs = data.organizations.sort(
                          (a, b) => (a.order || 0) - (b.order || 0),
                        );
                        const draggedIndex = orgs.findIndex(
                          (o) => o.id === draggedOrg,
                        );
                        const targetIndex = orgs.findIndex(
                          (o) => o.id === org.id,
                        );

                        if (draggedIndex !== -1 && targetIndex !== -1) {
                          const newOrgs = [...orgs];
                          const [removed] = newOrgs.splice(draggedIndex, 1);

                          // Insert based on drop position
                          const insertIndex =
                            dragOverPosition === "bottom"
                              ? targetIndex + 1
                              : targetIndex;
                          newOrgs.splice(
                            insertIndex > draggedIndex
                              ? insertIndex - 1
                              : insertIndex,
                            0,
                            removed,
                          );

                          onOrganizationsReorder(newOrgs.map((o) => o.id));
                        }
                      }
                      setDraggedProject(null);
                      setDraggedOrg(null);
                      setDragOverOrg(null);
                      setDragOverPosition(null);
                    }}
                    className={`rounded-lg transition-all cursor-move ${
                      draggedOrg === org.id ? "opacity-50" : ""
                    } ${
                      dragOverOrg === org.id &&
                      draggedOrg &&
                      dragOverPosition === "top"
                        ? "drag-over-top"
                        : ""
                    } ${
                      dragOverOrg === org.id &&
                      draggedOrg &&
                      dragOverPosition === "bottom"
                        ? "drag-over-bottom"
                        : ""
                    } ${
                      dragOverOrg === org.id && draggedProject
                        ? "bg-zinc-800/50"
                        : ""
                    }`}
                  >
                    <div className="relative flex items-center px-3 py-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="relative flex items-center flex-shrink-0">
                          <button
                            onClick={(event) => copyOrgId(org.id, event)}
                            className="p-0.5 -mx-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                            aria-label={`Copy ${org.name} ID`}
                            title="Copy organization ID"
                          >
                            <Hash className="w-3 h-3" />
                          </button>
                          {copiedOrgId === org.id && (
                            <span className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap pointer-events-none animate-fade-in-up-out z-50">
                              Copied!
                            </span>
                          )}
                        </span>
                        <Link
                          href={`/org-${org.id}`}
                          className={`flex-1 text-sm transition-colors flex items-center gap-2 min-w-0 ${
                            currentView === `org-${org.id}`
                              ? "text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: org.color }}
                          />
                          <span className="truncate">{org.name}</span>
                        </Link>
                      </div>
                      <button
                        onClick={() => toggleOrg(org.id)}
                        className="p-1 rounded hover:bg-zinc-800 transition-colors group flex-shrink-0"
                        aria-label={
                          expandedOrgs.includes(org.id)
                            ? `Collapse ${org.name}`
                            : `Expand ${org.name}`
                        }
                      >
                        <ChevronRight
                          className={`w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-transform ${expandedOrgs.includes(org.id) ? "rotate-90" : ""}`}
                        />
                      </button>
                      {hoveredOrg === org.id && (
                        <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900 rounded-lg px-1">
                          <button
                            onClick={() => onAddProject?.(org.id)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                            title="Add project"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOrganizationEdit?.(org.id)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                            title="Edit organization"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOrganizationArchive?.(org.id)}
                            className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                            title="Archive organization"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          {org.ownerId === data.users?.[0]?.id && (
                            <button
                              onClick={() => onOrganizationDelete?.(org.id)}
                              className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                              title="Delete organization"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {expandedOrgs.includes(org.id) && (
                      <div className="ml-4 space-y-0">
                        {orgProjects(org.id).map((project) => (
                          <div
                            key={project.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedProject(project.id);
                              e.dataTransfer.effectAllowed = "move";
                              // Add ghost class after a small delay
                              setTimeout(() => {
                                e.currentTarget.classList.add("dragging");
                              }, 0);
                            }}
                            onDragEnd={(e) => {
                              e.currentTarget.classList.remove("dragging");
                              setDraggedProject(null);
                              setDragOverOrg(null);
                              setDragOverProject(null);
                              setDragOverPosition(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (
                                draggedProject &&
                                draggedProject !== project.id
                              ) {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                const height = rect.height;
                                setDragOverProject(project.id);
                                setDragOverPosition(
                                  y < height / 2 ? "top" : "bottom",
                                );
                              }
                            }}
                            onDragLeave={() => {
                              setDragOverProject(null);
                              setDragOverPosition(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                draggedProject &&
                                draggedProject !== project.id &&
                                onProjectsReorder
                              ) {
                                const draggedProj = data.projects.find(
                                  (p) => p.id === draggedProject,
                                );
                                const draggedOrgId = draggedProj
                                  ? ((draggedProj as any).organization_id ??
                                    draggedProj.organizationId)
                                  : null;
                                const projectOrgId =
                                  (project as any).organization_id ??
                                  project.organizationId;
                                if (
                                  draggedProj &&
                                  draggedOrgId === projectOrgId
                                ) {
                                  // Reorder within the same organization
                                  const projects = orgProjects(org.id);
                                  const draggedIndex = projects.findIndex(
                                    (p) => p.id === draggedProject,
                                  );
                                  const targetIndex = projects.findIndex(
                                    (p) => p.id === project.id,
                                  );

                                  if (
                                    draggedIndex !== -1 &&
                                    targetIndex !== -1
                                  ) {
                                    const newProjects = [...projects];
                                    const [removed] = newProjects.splice(
                                      draggedIndex,
                                      1,
                                    );

                                    // Insert based on drop position
                                    const insertIndex =
                                      dragOverPosition === "bottom"
                                        ? targetIndex + 1
                                        : targetIndex;
                                    newProjects.splice(
                                      insertIndex > draggedIndex
                                        ? insertIndex - 1
                                        : insertIndex,
                                      0,
                                      removed,
                                    );

                                    onProjectsReorder(
                                      org.id,
                                      newProjects.map((p) => p.id),
                                    );
                                  }
                                }
                              }
                              setDraggedProject(null);
                              setDragOverProject(null);
                            }}
                            onMouseEnter={() => setHoveredProject(project.id)}
                            onMouseLeave={() => setHoveredProject(null)}
                            className="cursor-move relative group"
                          >
                            <div
                              className={`relative w-full flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm transition-all ${
                                currentView === `project-${project.id}`
                                  ? "bg-zinc-800 text-white"
                                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
                              } ${
                                dragOverProject === project.id &&
                                dragOverPosition === "top"
                                  ? "drag-over-top"
                                  : ""
                              } ${
                                dragOverProject === project.id &&
                                dragOverPosition === "bottom"
                                  ? "drag-over-bottom"
                                  : ""
                              }`}
                            >
                              <GripVertical className="w-3 h-3 opacity-40" />
                              <Link
                                href={`/project-${project.id}`}
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <span
                                  className="text-[9px] font-bold flex-shrink-0 w-5 text-center"
                                  style={{ color: project.color }}
                                >
                                  {getProjectAcronym(project.name)}
                                </span>
                                <span className="truncate">{project.name}</span>
                              </Link>
                              {hoveredProject === project.id && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900 rounded-lg px-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onProjectEdit) {
                                        onProjectEdit(project.id);
                                      }
                                    }}
                                    className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                    title="Edit project"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onProjectUpdate) {
                                        onProjectUpdate(project.id, {
                                          archived: true,
                                        });
                                      }
                                    }}
                                    className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                    title="Archive project"
                                  >
                                    <Archive className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (
                                        confirm(
                                          `Are you sure you want to delete "${project.name}"? This will also delete all tasks in this project.`,
                                        )
                                      ) {
                                        if (onProjectDelete) {
                                          onProjectDelete(project.id);
                                        }
                                      }
                                    }}
                                    className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                    title="Delete project"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
        </div>

        {/* Archived Projects Section */}
        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between px-3 py-2 mb-2">
              <button
                onClick={() => setShowArchivedProjects(!showArchivedProjects)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
              >
                <span
                  className={`transform transition-transform ${showArchivedProjects ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                Archived Projects
              </button>
            </div>

            {showArchivedProjects && (
              <div className="space-y-0 px-2">
                {data.projects
                  .filter((project) => project.archived)
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((project) => {
                    const org = data.organizations.find(
                      (o) => o.id === project.organizationId,
                    );
                    return (
                      <div
                        key={project.id}
                        className="group"
                        onMouseEnter={() => setHoveredProject(project.id)}
                        onMouseLeave={() => setHoveredProject(null)}
                      >
                        <div
                          className={`relative w-full flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm transition-all ${
                            currentView === `project-${project.id}`
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
                          }`}
                        >
                          <Link
                            href={`/project-${project.id}`}
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <span
                              className="text-[9px] font-bold flex-shrink-0 w-5 text-center"
                              style={{ color: project.color }}
                            >
                              {getProjectAcronym(project.name)}
                            </span>
                            <span className="truncate">{project.name}</span>
                            {org && (
                              <span className="text-xs text-zinc-600 flex-shrink-0">
                                ({org.name})
                              </span>
                            )}
                          </Link>
                          {hoveredProject === project.id && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900 rounded-lg px-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onProjectUpdate) {
                                    onProjectUpdate(project.id, {
                                      archived: false,
                                    });
                                  }
                                }}
                                className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                title="Restore project"
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      `Are you sure you want to permanently delete "${project.name}"? This will also delete all tasks in this project.`,
                                    )
                                  ) {
                                    if (onProjectDelete) {
                                      onProjectDelete(project.id);
                                    }
                                  }
                                }}
                                className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                title="Delete project"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {data.projects.filter((p) => p.archived).length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-600">
                    No archived projects
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pending Invitations Section - only show if there are pending users */}
        {!isCollapsed && pendingUsers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between px-3 py-2 mb-2">
              <button
                onClick={() =>
                  setShowPendingInvitations(!showPendingInvitations)
                }
                className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase hover:text-zinc-300 transition-colors"
              >
                <span
                  className={`transform transition-transform ${showPendingInvitations ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                Pending Invitations
                <span className="text-zinc-600">({pendingUsers.length})</span>
              </button>
            </div>

            {showPendingInvitations && (
              <div className="space-y-1 px-2">
                {pendingUsers.map((user) => {
                  const displayName = user.firstName
                    ? `${user.firstName} ${user.lastName?.charAt(0) || ""}.`.trim()
                    : user.email.split("@")[0];

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800/50 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                        <span className="truncate">{displayName}</span>
                      </div>
                      <button
                        onClick={() => handleResendInvite(user.id)}
                        disabled={resendingUserId === user.id}
                        className="p-1 hover:bg-zinc-700 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Resend invitation"
                      >
                        <Mail
                          className={`w-3 h-3 ${resendingUserId === user.id ? "animate-pulse" : ""}`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div
        className={`${isCollapsed ? "p-2" : "px-3 py-3"} border-t border-zinc-800 mb-12 relative`}
        ref={calendarPopoverRef}
      >
        {isCollapsed ? (
          <div className="space-y-1">
            <Tooltip content="Calendar Feed">
              <button
                onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <Rss className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </button>
            </Tooltip>
            <Tooltip content="API Docs">
              <Link
                href="/developer/api"
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <FileCode2 className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </Link>
            </Tooltip>
            <Tooltip content="Settings">
              <Link
                href="/settings"
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <Settings className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </Link>
            </Tooltip>
            <Tooltip content="Logout">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="space-y-1">
            <button
              onClick={() => setShowCalendarPopover(!showCalendarPopover)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
            >
              <Rss className="w-4 h-4" />
              Calendar Feed
            </button>
            <Link
              href="/developer/api"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
            >
              <FileCode2 className="w-4 h-4" />
              API Docs
            </Link>
          </div>
        )}

        {/* Calendar Feed Popover */}
        {showCalendarPopover && (
          <div className="absolute bottom-full left-0 mb-2 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <Rss className="w-4 h-4" />
                iCal Subscription
              </h4>
              <button
                onClick={() => setShowCalendarPopover(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Subscribe in Google Calendar, Apple Calendar, or any
              iCal-compatible app.
            </p>
            {calendarToken ? (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={getCalendarFeedUrl()}
                    className="flex-1 bg-zinc-900 text-zinc-300 text-xs px-2.5 py-2 rounded border border-zinc-600 font-mono truncate"
                  />
                  <button
                    type="button"
                    onClick={copyCalendarUrl}
                    className="p-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {calendarCopied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500 space-y-0.5">
                  <p>
                    <strong>Google:</strong> Settings → Other calendars → From
                    URL
                  </p>
                  <p>
                    <strong>Apple:</strong> File → New Calendar Subscription
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500">Loading...</p>
            )}
          </div>
        )}
      </div>
      <Dialog open={isTimerModalOpen} onOpenChange={setIsTimerModalOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {timerModalMode === "stop" ? "Stop Focus: Time" : "Start Focus: Time"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {timerModalMode === "stop"
                ? "Review the active session before stopping it."
                : "Start a new Focus: Time session from the sidebar."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Session Title
              </label>
              <input
                type="text"
                value={timerForm.title}
                onChange={(event) =>
                  setTimerForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                placeholder="Focus: Time"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Organization
                </label>
                <Select
                  value={timerForm.organizationId}
                  onValueChange={(value) =>
                    setTimerForm((current) => ({
                      ...current,
                      organizationId: value,
                      projectId:
                        current.projectId &&
                        data.projects.some(
                          (project) =>
                            project.id === current.projectId &&
                            project.organizationId === value,
                        )
                          ? current.projectId
                          : "",
                    }))
                  }
                >
                  <SelectTrigger className="border-zinc-700 bg-zinc-900 text-white">
                    <SelectValue placeholder="Choose organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>
                        {organization.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Project
                </label>
                <Select
                  value={timerForm.projectId || "none"}
                  onValueChange={(value) =>
                    setTimerForm((current) => ({
                      ...current,
                      projectId: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="border-zinc-700 bg-zinc-900 text-white">
                    <SelectValue placeholder="Optional project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {timerProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Notes
              </label>
              <textarea
                value={timerForm.description}
                onChange={(event) =>
                  setTimerForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                placeholder="Optional notes for this session"
              />
            </div>

            {timerModalMode === "stop" && currentTimerStartedAt ? (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
                Running for {currentTimerElapsed}
              </div>
            ) : null}

            {timerError ? (
              <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-3 py-2 text-sm text-red-200">
                {timerError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsTimerModalOpen(false)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleTimerSubmit()}
                disabled={timerSubmitting}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  timerModalMode === "stop"
                    ? "bg-emerald-700 hover:bg-emerald-600"
                    : "bg-theme-gradient hover:opacity-90"
                }`}
              >
                {timerSubmitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : timerModalMode === "stop" ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {timerModalMode === "stop" ? "Stop Timer" : "Start Timer"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
