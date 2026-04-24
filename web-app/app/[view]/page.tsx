"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Archive,
  Trash2,
  Edit,
  Plus,
  Bot,
  Link2,
  Link2Off,
  CalendarClock,
  RefreshCw,
  CheckSquare,
  Square,
  X,
  Search,
  ArrowUpDown,
  User,
  Loader2,
  ChevronUp,
  ChevronDown,
  CalendarDays,
  FileText,
  Columns3,
  LayoutList,
} from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TimeTrackingView } from "@/components/time-tracking-view";
import { getBlockedTaskIds } from "@/lib/dependency-utils";
import { ConfirmModal } from "@/components/confirm-modal";
import { TaskList } from "@/components/task-list";
import { KanbanView } from "@/components/kanban-view";
import { ColorPicker } from "@/components/color-picker";
import { Database, Task, Project, Organization, Section } from "@/lib/types";
import { SectionView } from "@/components/section-view";
import { AddSectionModal } from "@/components/add-section-modal";
import { AddSectionDivider } from "@/components/add-section-divider";
import { EmailWorkList } from "@/components/email-work-list";
import { Tooltip } from "@/components/tooltip";
import { format } from "date-fns";
import {
  getLocalDateString,
  isOverdue,
  isTodayOrOverdue,
  isToday,
  isTomorrow,
  isRestOfWeek,
} from "@/lib/date-utils";
import { applyUserTheme } from "@/lib/theme-utils";
import { parseRecurringPattern, getNextDueDate } from "@/lib/recurring-utils";
import { ProjectProgressTimeline } from "@/components/project-progress-timeline";
import { ProjectAiExportControls } from "@/components/project-ai-export-controls";
import { ProjectSectionBoard } from "@/components/project-section-board";
import {
  ProjectWorkTabs,
  type ProjectWorkTab,
} from "@/components/project-work-tabs";
import {
  SkeletonSidebar,
  SkeletonViewContent,
} from "@/components/skeleton-loader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as Popover from "@radix-ui/react-popover";
import { getRichTextPreview, richTextToPlainText } from "@/lib/rich-text";
import {
  getBulkSelectionState,
  setBulkSelectionForTaskIds,
} from "@/lib/project-bulk-selection";
import { shouldShowInboxItemInToday } from "@/lib/email-inbox/shared";
import { mergeDatabasePayload } from "@/lib/database-state";

const EMAIL_BACKGROUND_SYNC_INTERVAL_MS = 15 * 1000;
const DATABASE_CORE_CACHE_VERSION = 1;
const DATABASE_CORE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const PROJECT_SECTION_LAYOUT_STORAGE_KEY = "focus-forge:project-section-layout";

const getDatabaseCoreCacheKey = (userId?: string | null) =>
  `focus-forge:database-core:v${DATABASE_CORE_CACHE_VERSION}:${userId || "anonymous"}`;

const shouldIncludeInboxItemsForInitialView = (view: string) =>
  view === "today";

const readCachedDatabaseCore = (userId?: string | null): Database | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getDatabaseCoreCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      cachedAt?: number;
      data?: Database;
    };
    if (
      !parsed.cachedAt ||
      !parsed.data ||
      Date.now() - parsed.cachedAt > DATABASE_CORE_CACHE_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(getDatabaseCoreCacheKey(userId));
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
};

const writeCachedDatabaseCore = (
  userId: string | null | undefined,
  data: Database,
) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      getDatabaseCoreCacheKey(userId),
      JSON.stringify({
        cachedAt: Date.now(),
        data: {
          ...data,
          inboxItems: [],
          quarantineCount: 0,
          sentCount: 0,
        },
      }),
    );
  } catch {
    // Session storage is a best-effort cache.
  }
};

const AddTaskModal = dynamic(
  () => import("@/components/add-task-modal").then((mod) => mod.AddTaskModal),
  { ssr: false },
);
const BulkEditModal = dynamic(
  () => import("@/components/bulk-edit-modal").then((mod) => mod.BulkEditModal),
  { ssr: false },
);
const EditTaskModal = dynamic(
  () => import("@/components/edit-task-modal").then((mod) => mod.EditTaskModal),
  { ssr: false },
);
const AddProjectModal = dynamic(
  () =>
    import("@/components/add-project-modal").then((mod) => mod.AddProjectModal),
  { ssr: false },
);
const EditProjectModal = dynamic(
  () =>
    import("@/components/edit-project-modal").then(
      (mod) => mod.EditProjectModal,
    ),
  { ssr: false },
);
const AddOrganizationModal = dynamic(
  () =>
    import("@/components/add-organization-modal").then(
      (mod) => mod.AddOrganizationModal,
    ),
  { ssr: false },
);
const OrganizationSettingsModal = dynamic(
  () =>
    import("@/components/organization-settings-modal").then(
      (mod) => mod.OrganizationSettingsModal,
    ),
  { ssr: false },
);
const ProjectNotesModal = dynamic(
  () =>
    import("@/components/project-notes-modal").then(
      (mod) => mod.ProjectNotesModal,
    ),
  { ssr: false },
);
const AiPlannerFloatingChat = dynamic(
  () =>
    import("@/components/ai-planner-floating-chat").then(
      (mod) => mod.AiPlannerFloatingChat,
    ),
  { ssr: false },
);
const EmailInboxView = dynamic(
  () =>
    import("@/components/email-inbox-view").then((mod) => mod.EmailInboxView),
  { ssr: false },
);
const EmailSpamReviewModal = dynamic(
  () =>
    import("@/components/email-spam-review-modal").then(
      (mod) => mod.EmailSpamReviewModal,
    ),
  { ssr: false },
);
const EmailThreadModal = dynamic(
  () =>
    import("@/components/email-thread-modal").then(
      (mod) => mod.EmailThreadModal,
    ),
  { ssr: false },
);
const TodoistQuickSyncModal = dynamic(
  () =>
    import("@/components/todoist-quick-sync-modal").then(
      (mod) => mod.TodoistQuickSyncModal,
    ),
  { ssr: false },
);

const getTaskAssignedTo = (task: Task) =>
  ((task as any).assigned_to as string | undefined) || task.assignedTo || null;

const getTaskTagIds = (task: Task) => {
  const tagIds = new Set<string>();
  (task.tags || []).forEach((tagId) => tagIds.add(tagId));
  (task.tagBadges || []).forEach((tag) => tagIds.add(tag.id));
  return tagIds;
};

const getTaskTagNames = (task: Task, tags: Database["tags"]) => {
  const tagNames = new Set<string>();
  const tagsById = new Map(tags.map((tag) => [tag.id, tag.name] as const));

  (task.tags || []).forEach((tagId) => {
    const tagName = tagsById.get(tagId);
    if (tagName) tagNames.add(tagName);
  });
  (task.tagBadges || []).forEach((tag) => tagNames.add(tag.name));

  return Array.from(tagNames);
};

const taskMatchesTagFilter = (task: Task, tagFilter: string) =>
  tagFilter === "all" || getTaskTagIds(task).has(tagFilter);

const getVisibleTaskRows = () => {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-task-row="true"][data-task-id]',
    ),
  ).filter((row) => row.offsetParent !== null);
};

function ProjectTagFilter({
  tags,
  value,
  onChange,
}: {
  tags: Database["tags"];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedTag = tags.find((tag) => tag.id === value);
  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tags;
    return tags.filter((tag) =>
      tag.name.toLowerCase().includes(normalizedQuery),
    );
  }, [query, tags]);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-left text-sm text-white transition-colors hover:border-zinc-600"
        >
          <span className="truncate">
            {selectedTag ? `Tag: ${selectedTag.name}` : "Tag: All"}
          </span>
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[260px] rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
        >
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tags..."
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 py-2 pl-8 pr-8 text-sm text-white placeholder-zinc-500 outline-none focus:ring-2 ring-theme"
              autoFocus
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => selectValue("all")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${
                value === "all"
                  ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <span>Tag: All</span>
              {value === "all" ? (
                <span className="text-[rgb(var(--theme-primary-rgb))]">
                  Selected
                </span>
              ) : null}
            </button>
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => selectValue(tag.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  value === tag.id
                    ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                </span>
                {value === tag.id ? (
                  <span className="text-[rgb(var(--theme-primary-rgb))]">
                    Selected
                  </span>
                ) : null}
              </button>
            ))}
            {filteredTags.length === 0 ? (
              <div className="px-2 py-3 text-sm text-zinc-500">
                No tags found.
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const taskShortcutGroups = [
  {
    title: "Navigate",
    shortcuts: [
      ["j", "Next task"],
      ["k", "Previous task"],
      ["Enter / o", "Open task"],
      ["/", "Search"],
    ],
  },
  {
    title: "Task Actions",
    shortcuts: [
      ["n", "New task"],
      ["x", "Complete task"],
      ["m", "Assign to me"],
      ["M", "Unassign from me"],
      ["t", "Assign to me for today"],
      ["T", "Assign to me for tomorrow"],
      ["r", "Remove from Today"],
      ["R", "Unassign me and remove from Today"],
    ],
  },
  {
    title: "Help",
    shortcuts: [
      ["? / Cmd + /", "Show shortcuts"],
      ["Esc", "Close shortcuts"],
    ],
  },
];

function ShortcutHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 text-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Task Shortcuts</h2>
            <p className="text-sm text-zinc-500">
              Shortcuts apply when no text field or modal is active.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
            aria-label="Close shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {taskShortcutGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.shortcuts.map(([keys, label]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between gap-3 rounded-lg bg-zinc-900 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-300">{label}</span>
                    <kbd className="shrink-0 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-100">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ViewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { showError, showSuccess, showInfo } = useToast();
  const view = params.view as string;
  const popoutThreadId = view.startsWith("email-")
    ? searchParams.get("threadId")
    : null;
  const isEmailThreadPopout =
    view.startsWith("email-") &&
    searchParams.get("emailPopout") === "1" &&
    Boolean(popoutThreadId);

  const [database, setDatabase] = useState<Database | null>(null);
  const [showTodoistSync, setShowTodoistSync] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDefaults, setAddTaskDefaults] = useState<{
    projectId?: string;
    sectionId?: string;
  }>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditTask, setShowEditTask] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [selectedOrgForProject, setSelectedOrgForProject] = useState<
    string | null
  >(null);
  const [showAddOrganization, setShowAddOrganization] = useState(false);
  const [showEditOrganization, setShowEditOrganization] = useState(false);
  const [editingOrganization, setEditingOrganization] =
    useState<Organization | null>(null);
  const [showEditProject, setShowEditProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    show: boolean;
    orgId: string | null;
    orgName: string;
  }>({
    show: false,
    orgId: null,
    orgName: "",
  });
  const [editingOrgDescription, setEditingOrgDescription] = useState<
    string | null
  >(null);
  const [showProjectColorPicker, setShowProjectColorPicker] = useState(false);
  const [sortBy, setSortBy] = useState<"dueDate" | "deadline" | "priority">(
    "dueDate",
  );
  const [filterAssignedTo, setFilterAssignedTo] =
    useState<string>("me-unassigned");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<
    "all" | "tasks" | "projects" | "organizations"
  >("all");
  const [showBlockedTasks, setShowBlockedTasks] = useState(false);
  const [todaySections, setTodaySections] = useState({
    email: true,
    overdue: true,
    today: true,
    tomorrow: true,
    restOfWeek: true,
  });
  const [showTodaySpamReview, setShowTodaySpamReview] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [sectionParentId, setSectionParentId] = useState<string | undefined>(
    undefined,
  );
  const [sectionOrder, setSectionOrder] = useState(0);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [upcomingFilterType, setUpcomingFilterType] = useState<
    "dueDate" | "deadline"
  >("dueDate");
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [projectTaskSearchQuery, setProjectTaskSearchQuery] = useState("");
  const [projectAssigneeFilter, setProjectAssigneeFilter] = useState("all");
  const [projectCreatorFilter, setProjectCreatorFilter] = useState("all");
  const [projectPriorityFilter, setProjectPriorityFilter] = useState("all");
  const [projectTagFilter, setProjectTagFilter] = useState("all");
  const [projectStatusFilter, setProjectStatusFilter] = useState<
    "active" | "completed" | "all"
  >("active");
  const [projectSectionLayout, setProjectSectionLayout] = useState<
    "list" | "board"
  >("list");
  const [dueDateLayout, setDueDateLayout] = useState<
    "inline" | "below" | "right"
  >("inline");
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(
    null,
  );
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [loadingTaskIds, setLoadingTaskIds] = useState<Set<string>>(new Set());
  const [animatingOutTaskIds, setAnimatingOutTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [undoCompletion, setUndoCompletion] = useState<{
    taskId: string;
    taskName: string;
    affectedIds: string[];
  } | null>(null);
  const [undoExiting, setUndoExiting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticCompletedIds, setOptimisticCompletedIds] = useState<
    Set<string>
  >(new Set());
  const [taskDeleteConfirm, setTaskDeleteConfirm] = useState<{
    show: boolean;
    taskId: string | null;
    taskName: string;
  }>({
    show: false,
    taskId: null,
    taskName: "",
  });
  const [showProjectNotesModal, setShowProjectNotesModal] = useState(false);
  const [showAutoSectionConfirm, setShowAutoSectionConfirm] = useState(false);
  const [autoSectioning, setAutoSectioning] = useState(false);
  const [selectedTodayEmailId, setSelectedTodayEmailId] = useState<
    string | null
  >(null);
  const [projectWorkTab, setProjectWorkTab] = useState<ProjectWorkTab>("tasks");
  const focusedTaskIdRef = useRef<string | null>(null);
  const focusedTaskRowRef = useRef<HTMLElement | null>(null);
  const loadedProjectInboxIdsRef = useRef<Set<string>>(new Set());
  const loadingProjectInboxIdsRef = useRef<Set<string>>(new Set());
  const normalizedAuthEmail = (user?.email || "").trim().toLowerCase();
  const currentUserProfile =
    user && database?.users
      ? database.users.find(
          (databaseUser) =>
            databaseUser.id === user.id ||
            databaseUser.authId === user.id ||
            (normalizedAuthEmail &&
              (databaseUser.email || "").trim().toLowerCase() ===
                normalizedAuthEmail),
        )
      : null;
  const resolvedCurrentUser =
    currentUserProfile || database?.users?.[0] || null;
  const currentUserId = resolvedCurrentUser?.id || user?.id || undefined;
  const currentUserRole = resolvedCurrentUser?.role || null;
  const currentUserDisplayName =
    resolvedCurrentUser?.name ||
    [resolvedCurrentUser?.firstName, resolvedCurrentUser?.lastName]
      .filter(Boolean)
      .join(" ");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedLayout = window.localStorage.getItem(
      PROJECT_SECTION_LAYOUT_STORAGE_KEY,
    );
    if (savedLayout === "list" || savedLayout === "board") {
      setProjectSectionLayout(savedLayout);
    }
  }, []);

  const updateProjectSectionLayout = useCallback((layout: "list" | "board") => {
    setProjectSectionLayout(layout);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROJECT_SECTION_LAYOUT_STORAGE_KEY, layout);
    }
  }, []);

  const createEmptyDatabase = (): Database => ({
    users: [],
    organizations: [],
    projects: [],
    tasks: [],
    mailboxes: [],
    inboxItems: [],
    emailRules: [],
    summaryProfiles: [],
    ruleStats: { active: 0, quarantine: 0, alwaysDelete: 0 },
    quarantineCount: 0,
    tags: [],
    sections: [],
    taskSections: [],
    userSectionPreferences: [],
    timeBlocks: [],
    timeBlockTasks: [],
    settings: { showCompletedTasks: true },
  });

  useEffect(() => {
    setBulkSelectMode(false);
    setSelectedTaskIds(new Set());
    setLastSelectedTaskId(null);
    focusedTaskIdRef.current = null;
    if (focusedTaskRowRef.current) {
      focusedTaskRowRef.current.removeAttribute("data-task-row-focused");
      focusedTaskRowRef.current.removeAttribute("aria-selected");
      focusedTaskRowRef.current = null;
    }
    setSelectedTodayEmailId(null);
  }, [view]);

  useEffect(() => {
    if (!database || !selectedTodayEmailId) return;

    const isStillVisible = database.inboxItems.some(
      (item) =>
        item.id === selectedTodayEmailId && shouldShowInboxItemInToday(item),
    );

    if (!isStillVisible) {
      setSelectedTodayEmailId(null);
    }
  }, [database, selectedTodayEmailId]);

  // Theme is now handled by AuthContext

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current);
    };
  }, []);

  const fetchData = useCallback(
    async (options?: {
      includeEmailData?: boolean;
      includeInboxItems?: boolean;
    }) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      const includeInboxItems =
        options?.includeInboxItems ??
        shouldIncludeInboxItemsForInitialView(view);
      const includeEmailData =
        options?.includeEmailData ??
        (includeInboxItems || view.startsWith("email-"));

      try {
        const databaseParams = new URLSearchParams();
        if (!includeInboxItems) {
          databaseParams.set("includeInboxItems", "false");
        }
        if (!includeEmailData) {
          databaseParams.set("includeEmailData", "false");
        }
        const databaseUrl = databaseParams.size
          ? `/api/database?${databaseParams.toString()}`
          : "/api/database";

        const response = await fetch(databaseUrl, {
          credentials: "include",
          signal: controller.signal,
        });
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await response.json()
          : null;

        if (response.status === 401) {
          const loginParams = new URLSearchParams({
            from: `/${view}`,
          });
          router.replace(`/auth/login?${loginParams.toString()}`);
          return;
        }

        if (!response.ok) {
          console.error("Database API request failed:", response.status, data);
          setDatabase((prev) => prev ?? createEmptyDatabase());
          return;
        }

        if (!data) {
          console.error("Database API returned a non-JSON response");
          setDatabase((prev) => prev ?? createEmptyDatabase());
          return;
        }

        // Check if the response has an error
        if (data.error) {
          console.error("Database API error:", data.error);
          setDatabase((prev) => prev ?? createEmptyDatabase());
          return;
        }

        // Validate that the data has the expected structure
        if (data && data.tasks && data.projects && data.organizations) {
          if (!includeEmailData) {
            writeCachedDatabaseCore(user?.id, data as Database);
          }

          setDatabase((previous) =>
            mergeDatabasePayload(previous, data, {
              preserveInboxItems: !includeInboxItems,
              preserveEmailData: !includeEmailData,
            }),
          );

          // Apply theme for file-based database (AuthContext handles Supabase)
          if (data.users?.[0]?.profileColor) {
            applyUserTheme(
              data.users[0].profileColor,
              data.users[0].animationsEnabled ?? true,
            );
          }
        } else {
          console.error("Invalid database structure:", data);
          setDatabase((prev) => prev ?? createEmptyDatabase());
        }
      } catch (error) {
        console.error("Error fetching database:", error);
        setDatabase((prev) => prev ?? createEmptyDatabase());
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [router, user?.id, view],
  );

  useEffect(() => {
    if (!shouldIncludeInboxItemsForInitialView(view)) {
      const cachedDatabase = readCachedDatabaseCore(user?.id);
      if (cachedDatabase) {
        setDatabase((previous) => previous ?? cachedDatabase);
      }
    }

    void fetchData();
  }, [fetchData, user?.id, view]);

  const loadProjectInboxItems = useCallback(
    async (projectId: string, options: { force?: boolean } = {}) => {
      if (!projectId) return;
      if (
        !options.force &&
        (loadedProjectInboxIdsRef.current.has(projectId) ||
          loadingProjectInboxIdsRef.current.has(projectId))
      ) {
        return;
      }

      loadingProjectInboxIdsRef.current.add(projectId);
      try {
        const response = await fetch(
          `/api/email/inbox?projectId=${encodeURIComponent(projectId)}`,
          { credentials: "include" },
        );
        if (!response.ok) return;

        const projectInboxItems =
          (await response.json()) as Database["inboxItems"];
        loadedProjectInboxIdsRef.current.add(projectId);
        setDatabase((previous) => {
          if (!previous) return previous;

          const projectItemIds = new Set(
            projectInboxItems.map((item) => item.id),
          );
          return {
            ...previous,
            inboxItems: [
              ...previous.inboxItems.filter(
                (item) =>
                  item.projectId !== projectId && !projectItemIds.has(item.id),
              ),
              ...projectInboxItems,
            ],
          };
        });
      } catch (error) {
        console.error("Error fetching project inbox items:", error);
      } finally {
        loadingProjectInboxIdsRef.current.delete(projectId);
      }
    },
    [],
  );

  useEffect(() => {
    if (!view.startsWith("project-") || !database) return;

    void loadProjectInboxItems(view.replace("project-", ""));
  }, [database, loadProjectInboxItems, view]);

  useEffect(() => {
    if (!user || isEmailThreadPopout) {
      return;
    }

    let cancelled = false;

    const runBackgroundEmailSync = async () => {
      try {
        const response = await fetch("/api/email/mailboxes/sync-due", {
          method: "POST",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || cancelled) {
          return;
        }

        const changedThreadCount = Number(payload?.changedThreadCount || 0);
        const syncedMailboxCount = Number(payload?.syncedMailboxCount || 0);

        if (changedThreadCount > 0 || syncedMailboxCount > 0) {
          await fetchData({ includeInboxItems: true });
        }
      } catch {
        // Keep background inbox sync silent during normal app usage.
      }
    };

    void runBackgroundEmailSync();

    const interval = window.setInterval(() => {
      void runBackgroundEmailSync();
    }, EMAIL_BACKGROUND_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchData, isEmailThreadPopout, user, view]);

  const clearUndoTimers = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current);
    undoTimerRef.current = null;
    undoHideTimerRef.current = null;
  };

  const showUndoCompletion = (task: Task, affectedIds: string[]) => {
    clearUndoTimers();
    setUndoCompletion({ taskId: task.id, taskName: task.name, affectedIds });
    setUndoExiting(false);
    undoTimerRef.current = setTimeout(() => {
      setUndoExiting(true);
      undoHideTimerRef.current = setTimeout(() => {
        setUndoCompletion(null);
        setUndoExiting(false);
      }, 300);
    }, 30000);
  };

  const handleUndoComplete = async () => {
    if (!undoCompletion) return;
    const { affectedIds } = undoCompletion;
    clearUndoTimers();
    setUndoExiting(true);
    setOptimisticCompletedIds((prev) => {
      const next = new Set(prev);
      affectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setAnimatingOutTaskIds((prev) => {
      const next = new Set(prev);
      affectedIds.forEach((id) => next.delete(id));
      return next;
    });
    try {
      await Promise.all(
        affectedIds.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              completed: false,
              completedAt: null,
            }),
          }),
        ),
      );
    } catch (error) {
      console.error("Error undoing completion:", error);
    }
    await fetchData();
    setTimeout(() => {
      setUndoCompletion(null);
      setUndoExiting(false);
    }, 250);
  };

  const handleTodoistSync = async (mode: "merge" | "overwrite") => {
    if (!user?.id) {
      throw new Error("User not authenticated");
    }

    const response = await fetch("/api/todoist/quick-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: user.id,
        mode: mode,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Sync failed");
    }

    // Refresh data after sync
    await fetchData();
  };

  const handleAddTask = async (
    taskData: Omit<Task, "id" | "createdAt" | "updatedAt"> | Partial<Task>,
  ) => {
    // Extract pending subtasks before sending
    const { pendingSubtasks, ...taskPayload } = taskData as any;

    // Optimistically add the task to the UI immediately
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimisticTask: Task = {
      id: tempId,
      name: taskPayload.name || "",
      description: taskPayload.description,
      dueDate: taskPayload.dueDate || taskPayload.due_date,
      dueTime: taskPayload.dueTime || taskPayload.due_time,
      priority: taskPayload.priority || 4,
      reminders: taskPayload.reminders || [],
      deadline: taskPayload.deadline,
      files: taskPayload.files || [],
      projectId: taskPayload.projectId || "",
      assignedTo: taskPayload.assignedTo || taskPayload.assigned_to,
      tags: taskPayload.tags || [],
      completed: false,
      createdAt: now,
      updatedAt: now,
      parentId: taskPayload.parentId,
      recurringPattern: taskPayload.recurringPattern,
      timeEstimate: taskPayload.timeEstimate,
      startDate: taskPayload.startDate,
      startTime: taskPayload.startTime,
      endDate: taskPayload.endDate,
      endTime: taskPayload.endTime,
      // Snake_case variants for rendering compatibility
      ...(taskPayload.due_date !== undefined && {
        due_date: taskPayload.due_date,
      }),
      ...(taskPayload.due_time !== undefined && {
        due_time: taskPayload.due_time,
      }),
      ...(taskPayload.assigned_to !== undefined && {
        assigned_to: taskPayload.assigned_to,
      }),
      ...(taskPayload.project_id !== undefined && {
        project_id: taskPayload.project_id,
      }),
    } as any;

    setDatabase((prev) => {
      if (!prev) return prev;
      const nextTaskSections =
        taskPayload.sectionId && tempId
          ? [
              ...prev.taskSections,
              {
                id: `temp-task-section-${Date.now()}`,
                taskId: tempId,
                sectionId: taskPayload.sectionId,
                createdAt: now,
              },
            ]
          : prev.taskSections;

      return {
        ...prev,
        tasks: [...prev.tasks, optimisticTask],
        taskSections: nextTaskSections,
      };
    });
    setLoadingTaskIds((prev) => new Set(prev).add(tempId));

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(taskPayload),
      });

      if (response.ok) {
        const createdTask = await response.json();

        if (taskPayload.sectionId && createdTask?.id) {
          const taskSectionResponse = await fetch("/api/task-sections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              taskId: createdTask.id,
              sectionId: taskPayload.sectionId,
            }),
          });

          if (!taskSectionResponse.ok) {
            const taskSectionError = await taskSectionResponse.text();
            throw new Error(
              `Failed to attach task to section: ${taskSectionError}`,
            );
          }
        }

        // Create pending subtasks if any
        if (pendingSubtasks?.length > 0 && createdTask?.id) {
          await Promise.all(
            pendingSubtasks.map((name: string) =>
              fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  name,
                  completed: false,
                  priority: 4,
                  projectId: taskPayload.projectId,
                  parentId: createdTask.id,
                  tags: [],
                  files: [],
                  reminders: [],
                  assignedTo: taskPayload.assignedTo,
                }),
              }),
            ),
          );
        }

        await fetchData();
      } else {
        // Remove optimistic task on failure
        setDatabase((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.filter((t) => t.id !== tempId),
            taskSections: prev.taskSections.filter(
              (ts) => ts.taskId !== tempId,
            ),
          };
        });
      }
    } catch (error) {
      console.error("Error creating task:", error);
      // Remove optimistic task on error
      setDatabase((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== tempId),
          taskSections: prev.taskSections.filter((ts) => ts.taskId !== tempId),
        };
      });
    } finally {
      setLoadingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
    }
  };

  const handleTaskToggle = async (taskId: string) => {
    const task = database?.tasks.find((t) => t.id === taskId);
    if (!task || !database) return;

    const isCompleting = !task.completed;
    const subtasks = database.tasks.filter((t) => t.parentId === taskId);
    const affectedIds = [taskId, ...subtasks.map((st) => st.id)];

    // Optimistic update - immediately show as completed
    if (isCompleting) {
      setOptimisticCompletedIds((prev) => new Set(prev).add(taskId));

      // Also mark subtasks as optimistically completed
      if (subtasks.length > 0) {
        setOptimisticCompletedIds((prev) => {
          const next = new Set(prev);
          subtasks.forEach((st) => next.add(st.id));
          return next;
        });
      }
    }

    try {
      // Update the main task
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          completed: isCompleting,
          completedAt: isCompleting ? new Date().toISOString() : undefined,
        }),
      });

      if (response.ok) {
        // If we're completing a parent task, also complete all subtasks
        if (isCompleting) {
          // Update all subtasks in parallel
          const updatePromises = subtasks.map((subtask) =>
            fetch(`/api/tasks/${subtask.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                completed: true,
                completedAt: new Date().toISOString(),
              }),
            }),
          );

          // Wait for all subtask updates to complete
          await Promise.all(updatePromises);

          // Auto-generate next recurring task instance
          const recurringRaw =
            (task as any).recurring_pattern || task.recurringPattern;
          if (recurringRaw) {
            const config = parseRecurringPattern(recurringRaw);
            if (config) {
              const currentDue =
                (task as any).due_date ||
                task.dueDate ||
                new Date().toISOString().split("T")[0];
              const nextDue = getNextDueDate(config, currentDue);
              try {
                await fetch("/api/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    name: task.name,
                    description: task.description || undefined,
                    dueDate: nextDue,
                    dueTime:
                      (task as any).due_time || task.dueTime || undefined,
                    priority: task.priority,
                    projectId: (task as any).project_id || task.projectId,
                    assignedTo:
                      (task as any).assigned_to || task.assignedTo || undefined,
                    tags: task.tags || [],
                    files: [],
                    reminders: [],
                    recurringPattern: recurringRaw,
                    completed: false,
                  }),
                });
              } catch (err) {
                console.error("Failed to create next recurring task:", err);
              }
            }
          }

          // Start fade out animation
          setAnimatingOutTaskIds((prev) => {
            const next = new Set(prev);
            next.add(taskId);
            subtasks.forEach((st) => next.add(st.id));
            return next;
          });

          // Wait for animation to complete
          await new Promise((resolve) => setTimeout(resolve, 400));

          // Refresh data first (while still hiding the task)
          await fetchData();

          // Then clear states after data is refreshed
          setOptimisticCompletedIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            subtasks.forEach((st) => next.delete(st.id));
            return next;
          });
          setAnimatingOutTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            subtasks.forEach((st) => next.delete(st.id));
            return next;
          });
          showUndoCompletion(task, affectedIds);
        } else {
          // Not completing, just refresh
          await fetchData();
          showUndoCompletion(task, affectedIds);
        }
      } else {
        // Revert optimistic update on failure
        if (isCompleting) {
          setOptimisticCompletedIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Error toggling task:", error);
      // Revert optimistic update on error
      if (isCompleting) {
        setOptimisticCompletedIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setShowEditTask(true);
  };

  const handleTaskSave = async (taskData: Partial<Task>) => {
    if (!editingTask) return;

    try {
      const response = await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(taskData),
      });

      if (response.ok) {
        await fetchData();
        setShowEditTask(false);
        setEditingTask(null);
      }
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const handleBulkUpdate = async (updates: Partial<Task>) => {
    try {
      const taskIds = Array.from(selectedTaskIds);
      setShowBulkEditModal(false);

      // Show loading state for all selected tasks
      setLoadingTaskIds(new Set(taskIds));

      // Process tasks sequentially with staggered animations
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];

        // Update the task
        await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updates),
        });

        // Remove from loading, add to animating out
        setLoadingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setAnimatingOutTaskIds((prev) => new Set(prev).add(taskId));

        // Stagger delay between tasks (100ms)
        if (i < taskIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Wait for animations to complete
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Refresh data and reset states
      await fetchData();
      setBulkSelectMode(false);
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    } catch (error) {
      console.error("Error bulk updating tasks:", error);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    }
  };

  const handleBulkDelete = async () => {
    try {
      const taskIds = Array.from(selectedTaskIds);
      setShowBulkEditModal(false);

      // Show loading state for all selected tasks
      setLoadingTaskIds(new Set(taskIds));

      // Process tasks sequentially with staggered animations
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];

        // Delete the task
        await fetch(`/api/tasks/${taskId}`, {
          method: "DELETE",
          credentials: "include",
        });

        // Remove from loading, add to animating out
        setLoadingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setAnimatingOutTaskIds((prev) => new Set(prev).add(taskId));

        // Stagger delay between tasks (100ms)
        if (i < taskIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Wait for animations to complete
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Refresh data and reset states
      await fetchData();
      setBulkSelectMode(false);
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    } catch (error) {
      console.error("Error bulk deleting tasks:", error);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    }
  };

  const handleBulkMerge = async (parentTaskId: string) => {
    try {
      const taskIds = Array.from(selectedTaskIds);
      setShowBulkEditModal(false);
      setLoadingTaskIds(new Set(taskIds));

      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];
        await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ parent_id: parentTaskId }),
        });

        setLoadingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setAnimatingOutTaskIds((prev) => new Set(prev).add(taskId));

        if (i < taskIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
      await fetchData();
      setBulkSelectMode(false);
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    } catch (error) {
      console.error("Error merging tasks:", error);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    }
  };

  const handleBulkCreateAndMerge = async (parentName: string) => {
    if (!database) return;
    try {
      setShowBulkEditModal(false);
      const taskIds = Array.from(selectedTaskIds);

      // Determine project from first selected task
      const firstTask = database.tasks.find((t) => t.id === taskIds[0]);
      const projectId =
        (firstTask as any)?.project_id ||
        firstTask?.projectId ||
        database.projects[0]?.id;
      if (!projectId) return;

      // Create the new parent task with today's date so it appears in the current view
      const today = format(new Date(), "yyyy-MM-dd");
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: parentName,
          projectId,
          dueDate: today,
          priority: 4,
          completed: false,
          tags: [],
          reminders: [],
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to create parent task:", res.status, body);
        return;
      }

      const newParent = await res.json();

      setLoadingTaskIds(new Set(taskIds));

      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];
        await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ parent_id: newParent.id }),
        });

        setLoadingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        setAnimatingOutTaskIds((prev) => new Set(prev).add(taskId));

        if (i < taskIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
      await fetchData();
      setBulkSelectMode(false);
      setSelectedTaskIds(new Set());
      setLastSelectedTaskId(null);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    } catch (error) {
      console.error("Error creating and merging tasks:", error);
      setLoadingTaskIds(new Set());
      setAnimatingOutTaskIds(new Set());
    }
  };

  const handleInviteUser = async (
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<{ userId: string } | null> => {
    if (!database) return null;

    // Get organization from the first selected task's project
    const firstTaskId = Array.from(selectedTaskIds)[0];
    const firstTask = database.tasks.find((t) => t.id === firstTaskId);
    const projectId = firstTask
      ? (firstTask as any).project_id || firstTask.projectId
      : null;
    const project = projectId
      ? database.projects.find((p) => p.id === projectId)
      : null;

    // Handle both snake_case and camelCase for organization ID
    const projectOrgId = project
      ? (project as any).organization_id || project.organizationId
      : null;

    let organization = projectOrgId
      ? database.organizations.find((o) => o.id === projectOrgId)
      : null;

    // Fallback to first organization if none found from project
    if (
      !organization &&
      database.organizations &&
      database.organizations.length > 0
    ) {
      organization = database.organizations[0];
    }

    if (!organization) {
      console.error(
        "No organization found for invite. Organizations:",
        database.organizations,
      );
      throw new Error(
        "No organization available. Please create an organization first.",
      );
    }

    try {
      const response = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          organizationId: organization.id,
          organizationName: organization.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to invite user");
      }

      // Refresh data to get the new user in the list
      await fetchData();

      if (data.user?.id) {
        return { userId: data.user.id };
      }

      return null;
    } catch (error) {
      console.error("Error inviting user:", error);
      throw error;
    }
  };

  const inviteUserToScope = async ({
    email,
    firstName,
    lastName,
    organizationId,
    projectId,
  }: {
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string;
    projectId?: string;
  }): Promise<{
    userId?: string;
    email: string;
    firstName: string;
    lastName: string;
    emailDelivery?: {
      provider?: string | null;
      messageId?: string | null;
    } | null;
  } | null> => {
    if (!database) return null;

    const organization = database.organizations.find(
      (candidate) => candidate.id === organizationId,
    );

    if (!organization) {
      throw new Error("Organization not found for invite.");
    }

    const response = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        organizationId,
        organizationName: organization.name,
        projectId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to invite user");
    }

    await fetchData();

    return {
      userId: data.user?.id,
      email,
      firstName,
      lastName,
      emailDelivery: data.emailDelivery || null,
    };
  };

  const resendInvite = async (userId: string) => {
    const response = await fetch("/api/resend-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to resend invite");
    }

    await fetchData();
    return {
      message: data.message,
      emailDelivery: data.emailDelivery || null,
    };
  };

  const cancelInvite = async ({
    userId,
    organizationId,
    projectId,
  }: {
    userId: string;
    organizationId?: string;
    projectId?: string;
  }) => {
    const response = await fetch("/api/cancel-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId, organizationId, projectId }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to cancel invite");
    }

    await fetchData();
    return { message: data.message };
  };

  const handleTaskDelete = async (taskId: string) => {
    if (showEditTask) {
      setShowEditTask(false);
      setEditingTask(null);
    }
    const task = database?.tasks.find((t) => t.id === taskId);
    setTaskDeleteConfirm({
      show: true,
      taskId,
      taskName: task?.name || "this task",
    });
  };

  const confirmTaskDelete = async () => {
    if (!taskDeleteConfirm.taskId) return;
    try {
      const response = await fetch(`/api/tasks/${taskDeleteConfirm.taskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const handleViewChange = (newView: string) => {
    router.push(`/${newView}`);
  };

  const handleProjectUpdate = async (
    projectId: string,
    updates: Partial<Project>,
  ) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error updating project:", error);
    }
  };

  const handleProjectDelete = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchData();
        // If we're currently viewing the deleted project, go to today view
        if (view === `project-${projectId}`) {
          router.push("/today");
        }
      }
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  const handleAddProject = async (
    projectData: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(projectData),
      });

      if (response.ok) {
        await fetchData();
        setShowAddProject(false);
        setSelectedOrgForProject(null);
      }
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  const handleOpenAddProject = (organizationId: string) => {
    setSelectedOrgForProject(organizationId);
    setShowAddProject(true);
  };

  const handleOpenAddProjectGeneral = () => {
    setSelectedOrgForProject(database?.organizations[0]?.id || null);
    setShowAddProject(true);
  };

  const handleAddOrganization = async (orgData: {
    name: string;
    color: string;
  }) => {
    try {
      // Include the current user as owner and initial member
      const currentUserId = database?.users?.[0]?.id;
      const organizationData = {
        ...orgData,
        ownerId: currentUserId,
        memberIds: currentUserId ? [currentUserId] : [],
      };

      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(organizationData),
      });

      if (response.ok) {
        await fetchData();
        setShowAddOrganization(false);
      }
    } catch (error) {
      console.error("Error creating organization:", error);
    }
  };

  const handleOrganizationDelete = async (orgId: string) => {
    if (!confirmDelete.orgId) return;

    try {
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchData();
        // If we're currently viewing the deleted organization, go to today view
        if (view === `org-${orgId}`) {
          router.push("/today");
        }
      }
    } catch (error) {
      console.error("Error deleting organization:", error);
    }
  };

  const openDeleteConfirmation = (orgId: string) => {
    const org = database?.organizations.find((o) => o.id === orgId);
    if (org) {
      const projectCount =
        database?.projects.filter((p) => p.organizationId === orgId).length ||
        0;
      const taskCount =
        database?.tasks.filter((t) => {
          const projectId = (t as any).project_id || t.projectId;
          const project = database?.projects.find((p) => p.id === projectId);
          return project?.organizationId === orgId;
        }).length || 0;

      setConfirmDelete({
        show: true,
        orgId: orgId,
        orgName: `${org.name} (${projectCount} projects, ${taskCount} tasks)`,
      });
    }
  };

  const handleOrganizationUpdate = async (
    orgId: string,
    updates: Partial<Organization>,
  ) => {
    try {
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error updating organization:", error);
    }
  };

  const handleOrganizationArchive = async (orgId: string) => {
    if (!database) return;

    const org = database.organizations.find((o) => o.id === orgId);
    if (!org) return;

    // Archive all projects in this organization
    const projectsToArchive = database.projects.filter(
      (p) => p.organizationId === orgId && !p.archived,
    );

    try {
      // Archive each project
      for (const project of projectsToArchive) {
        await fetch(`/api/projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ archived: true }),
        });
      }

      // Refresh the data
      await fetchData();
    } catch (error) {
      console.error("Error archiving organization projects:", error);
    }
  };

  const handleOpenEditOrganization = (orgId: string) => {
    const org = database?.organizations.find((o) => o.id === orgId);
    if (org) {
      setEditingOrganization(org);
      setShowEditOrganization(true);
    }
  };

  const handleOpenEditProject = (projectId: string) => {
    const project = database?.projects.find((p) => p.id === projectId);
    if (project) {
      setEditingProject(project);
      setShowEditProject(true);
    }
  };

  const handleProjectsReorder = async (
    organizationId: string,
    projectIds: string[],
  ) => {
    try {
      const response = await fetch("/api/projects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId, projectIds }),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error reordering projects:", error);
    }
  };

  const handleOrganizationsReorder = async (organizationIds: string[]) => {
    try {
      const response = await fetch("/api/organizations/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationIds }),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error reordering organizations:", error);
    }
  };

  const handleAddSection = async (
    section: Omit<Section, "id" | "createdAt" | "updatedAt">,
  ) => {
    try {
      const response = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(section),
      });

      if (response.ok) {
        await fetchData();
        setShowAddSection(false);
        return;
      }

      const errorText = await response.text();
      console.error("Error creating section:", response.status, errorText);
    } catch (error) {
      console.error("Error creating section:", error);
    }
  };

  const handleSectionEdit = (section: Section) => {
    setEditingSection(section);
    // TODO: Open edit modal
  };

  const handleSectionDelete = async (sectionId: string) => {
    const section = database?.sections?.find((s) => s.id === sectionId);
    if (!section) return;

    // Count tasks in this section
    const tasksInSection =
      database?.taskSections?.filter((ts) => ts.sectionId === sectionId)
        .length || 0;

    const confirmMessage =
      tasksInSection > 0
        ? `Are you sure you want to delete "${section.name}"? This section contains ${tasksInSection} task(s). They can be moved to "Unassigned" or deleted.`
        : `Are you sure you want to delete "${section.name}"?`;

    if (confirm(confirmMessage)) {
      if (tasksInSection > 0) {
        const action = confirm(
          'Click OK to delete the tasks, or Cancel to move them to "Unassigned"',
        );
        // TODO: Implement task handling based on user choice
      }

      try {
        const response = await fetch(`/api/sections/${sectionId}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (response.ok) {
          await fetchData();
        }
      } catch (error) {
        console.error("Error deleting section:", error);
      }
    }
  };

  const handleTaskDropToSection = async (taskId: string, sectionId: string) => {
    const movedAt = new Date().toISOString();

    setDatabase((prev) => {
      if (!prev) return prev;

      const nextTasks = prev.tasks.map((task) =>
        task.id === taskId
          ? ({
              ...task,
              sectionId,
              updatedAt: movedAt,
              section_id: sectionId,
              updated_at: movedAt,
            } as any)
          : task,
      );

      const filteredTaskSections = prev.taskSections.filter(
        (taskSection) => taskSection.taskId !== taskId,
      );

      return {
        ...prev,
        tasks: nextTasks,
        taskSections: [
          ...filteredTaskSections,
          {
            id: `temp-task-section-drop-${taskId}`,
            taskId,
            sectionId,
            createdAt: movedAt,
          },
        ],
      };
    });

    try {
      const taskUpdateResponse = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sectionId }),
      });

      if (!taskUpdateResponse.ok) {
        const taskUpdateError = await taskUpdateResponse.text();
        throw new Error(`Failed to update task section: ${taskUpdateError}`);
      }

      const taskSectionResponse = await fetch("/api/task-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId, sectionId }),
      });

      if (!taskSectionResponse.ok) {
        const taskSectionError = await taskSectionResponse.text();
        console.error(
          "Failed to upsert task-section association:",
          taskSectionError,
        );
      }

      await fetchData();
    } catch (error) {
      console.error("Error adding task to section:", error);
      await fetchData();
    }
  };

  const handleTaskDropToUnassigned = async (taskId: string) => {
    if (!database) return;

    const movedAt = new Date().toISOString();
    const task = database.tasks.find((candidate) => candidate.id === taskId);
    const existingSectionIds = new Set(
      database.taskSections
        .filter((taskSection) => taskSection.taskId === taskId)
        .map((taskSection) => taskSection.sectionId),
    );
    const directSectionId = task?.sectionId || (task as any)?.section_id;
    if (directSectionId) {
      existingSectionIds.add(directSectionId);
    }

    setDatabase((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        tasks: prev.tasks.map((candidate) =>
          candidate.id === taskId
            ? ({
                ...candidate,
                sectionId: null,
                updatedAt: movedAt,
                section_id: null,
                updated_at: movedAt,
              } as any)
            : candidate,
        ),
        taskSections: prev.taskSections.filter(
          (taskSection) => taskSection.taskId !== taskId,
        ),
      };
    });

    try {
      const taskUpdateResponse = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sectionId: null }),
      });

      if (!taskUpdateResponse.ok) {
        const taskUpdateError = await taskUpdateResponse.text();
        throw new Error(`Failed to clear task section: ${taskUpdateError}`);
      }

      await Promise.all(
        Array.from(existingSectionIds).map((sectionId) =>
          fetch(
            `/api/task-sections?taskId=${encodeURIComponent(taskId)}&sectionId=${encodeURIComponent(sectionId)}`,
            {
              method: "DELETE",
              credentials: "include",
            },
          ),
        ),
      );

      await fetchData();
    } catch (error) {
      console.error("Error removing task from section:", error);
      await fetchData();
    }
  };

  const handleSectionReorder = async (sectionId: string, newOrder: number) => {
    try {
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order: newOrder }),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error reordering section:", error);
    }
  };

  const openAddSection = (
    projectId: string,
    parentId?: string,
    order?: number,
  ) => {
    setSectionParentId(parentId);
    setSectionOrder(order || 0);
    setShowAddSection(true);
  };

  const openAddTask = (projectId?: string, sectionId?: string) => {
    setAddTaskDefaults({ projectId, sectionId });
    setShowAddTask(true);
  };

  const focusTaskRow = useCallback(
    (taskId: string, options?: { row?: HTMLElement; scroll?: boolean }) => {
      if (focusedTaskRowRef.current) {
        focusedTaskRowRef.current.removeAttribute("data-task-row-focused");
        focusedTaskRowRef.current.removeAttribute("aria-selected");
      }

      focusedTaskIdRef.current = taskId;
      const nextRow =
        options?.row ||
        getVisibleTaskRows().find((row) => row.dataset.taskId === taskId) ||
        null;
      focusedTaskRowRef.current = nextRow;

      if (!nextRow) return;

      nextRow.setAttribute("data-task-row-focused", "true");
      nextRow.setAttribute("aria-selected", "true");
      if (options?.scroll !== false) {
        nextRow.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [],
  );

  useEffect(() => {
    const focusedTaskId = focusedTaskIdRef.current;
    if (focusedTaskId) {
      focusTaskRow(focusedTaskId, { scroll: false });
    }
  }, [database, focusTaskRow]);

  const applyTaskShortcutUpdate = useCallback(
    async (
      taskId: string,
      updates: Record<string, unknown>,
      successMessage: string,
    ) => {
      const now = new Date().toISOString();
      const persistUpdates = {
        ...updates,
        updatedAt: now,
        updated_at: now,
      };

      setDatabase((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((task) => {
            if (task.id !== taskId) return task;

            const updatesAny = persistUpdates as any;
            const hasAssignedTo =
              Object.prototype.hasOwnProperty.call(updatesAny, "assignedTo") ||
              Object.prototype.hasOwnProperty.call(updatesAny, "assigned_to");
            const hasDueDate =
              Object.prototype.hasOwnProperty.call(updatesAny, "dueDate") ||
              Object.prototype.hasOwnProperty.call(updatesAny, "due_date");
            const hasDueTime =
              Object.prototype.hasOwnProperty.call(updatesAny, "dueTime") ||
              Object.prototype.hasOwnProperty.call(updatesAny, "due_time");

            const nextAssignedTo = hasAssignedTo
              ? (updatesAny.assignedTo ?? updatesAny.assigned_to ?? null)
              : getTaskAssignedTo(task);
            const nextDueDate = hasDueDate
              ? (updatesAny.dueDate ?? updatesAny.due_date ?? null)
              : ((task as any).due_date ?? task.dueDate ?? null);
            const nextDueTime = hasDueTime
              ? (updatesAny.dueTime ?? updatesAny.due_time ?? null)
              : ((task as any).due_time ?? task.dueTime ?? null);

            return {
              ...task,
              ...updates,
              assignedTo: nextAssignedTo ?? undefined,
              assigned_to: nextAssignedTo,
              assignedToName:
                hasAssignedTo && nextAssignedTo === currentUserId
                  ? currentUserDisplayName
                  : hasAssignedTo
                    ? undefined
                    : task.assignedToName,
              assignedToColor:
                hasAssignedTo && !nextAssignedTo
                  ? undefined
                  : (task as any).assignedToColor,
              assignedToMemoji:
                hasAssignedTo && !nextAssignedTo
                  ? undefined
                  : (task as any).assignedToMemoji,
              dueDate: nextDueDate ?? undefined,
              due_date: nextDueDate,
              dueTime: nextDueTime ?? undefined,
              due_time: nextDueTime,
              updatedAt: now,
              updated_at: now,
            } as any;
          }),
        };
      });

      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(persistUpdates),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(errorText || "Failed to update task.");
        }

        showInfo("Task updated", successMessage);
        await fetchData();
      } catch (error) {
        console.error("Error applying task shortcut:", error);
        showError(
          "Shortcut failed",
          error instanceof Error ? error.message : "Unable to update task.",
        );
        await fetchData();
      }
    },
    [currentUserDisplayName, currentUserId, fetchData, showError, showInfo],
  );

  useEffect(() => {
    if (!database || isEmailThreadPopout) return;

    const shortcutsBlocked =
      showShortcutHelp ||
      showAddTask ||
      showEditTask ||
      showAddProject ||
      showAddOrganization ||
      showEditOrganization ||
      showEditProject ||
      showAddSection ||
      showBulkEditModal ||
      showProjectNotesModal ||
      showAutoSectionConfirm ||
      showRescheduleConfirm ||
      showTodoistSync ||
      showTodaySpamReview ||
      Boolean(selectedTodayEmailId) ||
      confirmDelete.show ||
      taskDeleteConfirm.show;

    if (shortcutsBlocked) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        ),
      );
    };

    const getFocusedVisibleTaskId = () => {
      const rows = getVisibleTaskRows();
      const focusedTaskId = focusedTaskIdRef.current;
      if (!rows.length || !focusedTaskId) return null;
      return rows.some((row) => row.dataset.taskId === focusedTaskId)
        ? focusedTaskId
        : null;
    };

    const getFocusedTask = () => {
      const activeTaskId = getFocusedVisibleTaskId();
      if (!activeTaskId) return null;
      return database.tasks.find((candidate) => candidate.id === activeTaskId);
    };

    const moveFocus = (direction: 1 | -1) => {
      const rows = getVisibleTaskRows();
      if (!rows.length) return;

      const focusedTaskId = focusedTaskIdRef.current;
      const currentIndex = focusedTaskId
        ? rows.findIndex((row) => row.dataset.taskId === focusedTaskId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? direction > 0
            ? 0
            : rows.length - 1
          : Math.min(Math.max(currentIndex + direction, 0), rows.length - 1);
      const nextRow = rows[nextIndex];
      const nextTaskId = nextRow?.dataset.taskId;
      if (nextTaskId) focusTaskRow(nextTaskId, { row: nextRow });
    };

    const updateFocusedTask = (
      updates: Record<string, unknown>,
      label: string,
    ) => {
      const focusedTask = getFocusedTask();
      if (!focusedTask) {
        showInfo("No task focused", "Use j or k to focus a task first.");
        return;
      }
      if (!currentUserId) {
        showError("No active user", "Could not resolve your user account.");
        return;
      }
      void applyTaskShortcutUpdate(focusedTask.id, updates, label);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isEditableTarget(event.target) &&
        (event.key === "?" ||
          ((event.metaKey || event.ctrlKey) && event.key === "/"))
      ) {
        event.preventDefault();
        setShowShortcutHelp(true);
        return;
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key === "j") {
        event.preventDefault();
        moveFocus(1);
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        moveFocus(-1);
        return;
      }

      if (event.key === "Enter" || event.key === "o") {
        const task = getFocusedTask();
        if (task) {
          event.preventDefault();
          handleTaskEdit(task);
        }
        return;
      }

      if (event.key === "x") {
        const task = getFocusedTask();
        if (!task) return;
        event.preventDefault();
        void handleTaskToggle(task.id);
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        openAddTask(
          view.startsWith("project-")
            ? view.replace("project-", "")
            : undefined,
        );
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        const searchInput =
          document.querySelector<HTMLInputElement>(
            "[data-task-search-input='true']",
          ) ||
          document.querySelector<HTMLInputElement>(
            "input[placeholder*='Search']",
          );
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (event.key === "m") {
        event.preventDefault();
        updateFocusedTask(
          {
            assignedTo: currentUserId,
            assigned_to: currentUserId,
          },
          "Assigned to you.",
        );
        return;
      }

      if (event.key === "M") {
        const task = getFocusedTask();
        event.preventDefault();
        if (!task) {
          showInfo("No task focused", "Use j or k to focus a task first.");
          return;
        }
        if (!currentUserId || getTaskAssignedTo(task) !== currentUserId) {
          showInfo("Not assigned to you", "This task is not assigned to you.");
          return;
        }
        void applyTaskShortcutUpdate(
          task.id,
          {
            assignedTo: null,
            assigned_to: null,
          },
          "Unassigned from you.",
        );
        return;
      }

      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        const dueDate =
          event.key === "T"
            ? (() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return getLocalDateString(tomorrow);
              })()
            : getLocalDateString();

        updateFocusedTask(
          {
            assignedTo: currentUserId,
            assigned_to: currentUserId,
            dueDate,
            due_date: dueDate,
          },
          event.key === "T"
            ? "Assigned to you for tomorrow."
            : "Assigned to you for today.",
        );
        return;
      }

      if (event.key === "r") {
        event.preventDefault();
        updateFocusedTask(
          {
            dueDate: null,
            due_date: null,
            dueTime: null,
            due_time: null,
          },
          "Removed from Today.",
        );
        return;
      }

      if (event.key === "R") {
        const task = getFocusedTask();
        event.preventDefault();
        if (!task) {
          showInfo("No task focused", "Use j or k to focus a task first.");
          return;
        }
        if (!currentUserId || getTaskAssignedTo(task) !== currentUserId) {
          showInfo("Not assigned to you", "This task is not assigned to you.");
          return;
        }
        void applyTaskShortcutUpdate(
          task.id,
          {
            assignedTo: null,
            assigned_to: null,
            dueDate: null,
            due_date: null,
            dueTime: null,
            due_time: null,
          },
          "Unassigned from you and removed from Today.",
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    applyTaskShortcutUpdate,
    confirmDelete.show,
    currentUserId,
    database,
    focusTaskRow,
    handleTaskEdit,
    handleTaskToggle,
    isEmailThreadPopout,
    openAddTask,
    selectedTodayEmailId,
    showAddOrganization,
    showAddProject,
    showAddSection,
    showAddTask,
    showAutoSectionConfirm,
    showBulkEditModal,
    showEditOrganization,
    showEditProject,
    showEditTask,
    showError,
    showInfo,
    showShortcutHelp,
    showProjectNotesModal,
    showRescheduleConfirm,
    showTodaySpamReview,
    showTodoistSync,
    taskDeleteConfirm.show,
    view,
  ]);

  useEffect(() => {
    if (!showShortcutHelp) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowShortcutHelp(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShortcutHelp]);

  const handleAutoOrganizeUnassignedTasks = async (projectId: string) => {
    try {
      setAutoSectioning(true);
      const response = await fetch("/api/ai-planner/auto-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to auto-organize tasks");
      }

      await fetchData();

      if (data.movedTasks > 0 || data.createdSections > 0) {
        showSuccess(
          "AI organized tasks",
          `${data.movedTasks} task(s) moved${data.createdSections ? `, ${data.createdSections} section(s) created` : ""}.`,
        );
      } else {
        showInfo(
          "AI organizer",
          data.summary || "No unassigned tasks to organize.",
        );
      }
    } catch (error: any) {
      showError("AI organizer failed", error?.message || "Unknown error");
    } finally {
      setAutoSectioning(false);
    }
  };

  const projectViewData = useMemo(() => {
    if (!database || !view.startsWith("project-")) return null;

    const projectId = view.replace("project-", "");
    const project = database.projects.find((p) => p.id === projectId);
    const projectTasks = database.tasks.filter(
      (t) => ((t as any).project_id || t.projectId) === projectId,
    );
    const taskIdsWithSections = new Set(
      (database.taskSections || []).map((taskSection) => taskSection.taskId),
    );
    const projectSections =
      database.sections
        ?.filter((s) => s.projectId === projectId && !s.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0)) || [];

    const unassignedTasks = projectTasks.filter((task) => {
      return (
        !taskIdsWithSections.has(task.id) &&
        !task.sectionId &&
        !(task as any).section_id
      );
    });

    return {
      projectId,
      project,
      projectTasks,
      projectSections,
      unassignedTasks,
    };
  }, [database, view]);

  const blockedTaskIds = useMemo(
    () => (database ? getBlockedTaskIds(database.tasks) : new Set<string>()),
    [database],
  );

  const visibleProjectTaskIdsForSelection = useMemo(() => {
    if (!database || !projectViewData || !view.startsWith("project-")) {
      return [];
    }

    const currentProjectUserId = currentUserId || "";
    const projectSearchValue = projectTaskSearchQuery.trim().toLowerCase();

    return projectViewData.projectTasks
      .filter((task) => {
        const assignedTo = getTaskAssignedTo(task);

        if (projectStatusFilter === "active" && task.completed) return false;
        if (projectStatusFilter === "completed" && !task.completed)
          return false;

        if (projectAssigneeFilter === "assigned" && !assignedTo) {
          return false;
        }
        if (projectAssigneeFilter === "unassigned" && assignedTo) {
          return false;
        }
        if (projectAssigneeFilter === "me" && assignedTo !== currentUserId) {
          return false;
        }
        if (
          !["all", "assigned", "unassigned", "me"].includes(
            projectAssigneeFilter,
          ) &&
          assignedTo !== projectAssigneeFilter
        ) {
          return false;
        }

        const creatorId =
          ((task as any).created_by as string | undefined) ||
          task.createdBy ||
          null;
        if (
          projectCreatorFilter === "me" &&
          creatorId !== currentProjectUserId
        ) {
          return false;
        }
        if (
          projectCreatorFilter !== "all" &&
          projectCreatorFilter !== "me" &&
          creatorId !== projectCreatorFilter
        ) {
          return false;
        }

        if (
          projectPriorityFilter !== "all" &&
          String(task.priority) !== projectPriorityFilter
        ) {
          return false;
        }

        if (!taskMatchesTagFilter(task, projectTagFilter)) {
          return false;
        }

        if (!showBlockedTasks && blockedTaskIds.has(task.id)) {
          return false;
        }

        const taskSearchText = [
          task.name,
          richTextToPlainText(task.description),
          task.assignedToName,
          database.users.find((candidate) => candidate.id === creatorId)?.name,
          database.users.find((candidate) => candidate.id === creatorId)?.email,
          ...getTaskTagNames(task, database.tags),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (
          projectSearchValue &&
          !taskSearchText.includes(projectSearchValue)
        ) {
          return false;
        }

        return true;
      })
      .map((task) => task.id);
  }, [
    database,
    projectAssigneeFilter,
    projectCreatorFilter,
    projectPriorityFilter,
    projectTagFilter,
    projectStatusFilter,
    projectTaskSearchQuery,
    projectViewData,
    blockedTaskIds,
    showBlockedTasks,
    currentUserId,
    view,
  ]);

  useEffect(() => {
    if (!view.startsWith("project-")) return;

    const visibleTaskIds = new Set(visibleProjectTaskIdsForSelection);
    setSelectedTaskIds((prev) => {
      const next = new Set(
        [...prev].filter((taskId) => visibleTaskIds.has(taskId)),
      );
      if (next.size === prev.size) {
        return prev;
      }
      return next;
    });

    if (lastSelectedTaskId && !visibleTaskIds.has(lastSelectedTaskId)) {
      setLastSelectedTaskId(null);
    }
  }, [lastSelectedTaskId, view, visibleProjectTaskIdsForSelection]);

  if (!database) {
    return (
      <div className="h-screen app-shell-background flex">
        <SkeletonSidebar />
        <main className="flex-1 text-white overflow-y-auto">
          <SkeletonViewContent view={view} />
        </main>
      </div>
    );
  }

  const sortTasks = (tasks: Task[]) => {
    return [...tasks].sort((a, b) => {
      switch (sortBy) {
        case "dueDate":
          // Handle both snake_case and camelCase fields
          const aDueDate = (a as any).due_date || a.dueDate;
          const bDueDate = (b as any).due_date || b.dueDate;
          if (!aDueDate && !bDueDate) return 0;
          if (!aDueDate) return 1;
          if (!bDueDate) return -1;
          return new Date(aDueDate).getTime() - new Date(bDueDate).getTime();

        case "deadline":
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return (
            new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          );

        case "priority":
          return a.priority - b.priority; // Lower number = higher priority

        default:
          return 0;
      }
    });
  };

  const getCurrentUserId = () => {
    return currentUserId || null;
  };

  // Get current user's priority color preference
  const getCurrentUserPriorityColor = () => {
    if (!database?.users || !currentUserId) return undefined;
    const currentUser = database.users.find((u) => u.id === currentUserId);
    return (
      (currentUser as any)?.priorityColor ||
      (currentUser as any)?.priority_color ||
      undefined
    );
  };

  const userPriorityColor = getCurrentUserPriorityColor();
  const filterTasks = (tasks: Task[]) => {
    if (filterAssignedTo === "all") {
      return tasks;
    }

    const currentUserId = getCurrentUserId();

    if (filterAssignedTo === "me-unassigned" && currentUserId) {
      return tasks.filter((task) => {
        const assignedTo = getTaskAssignedTo(task);
        return assignedTo === currentUserId || !assignedTo;
      });
    }

    if (filterAssignedTo === "me" && currentUserId) {
      return tasks.filter((task) => {
        const assignedTo = getTaskAssignedTo(task);
        return assignedTo === currentUserId;
      });
    }

    if (filterAssignedTo === "unassigned") {
      return tasks.filter((task) => {
        const assignedTo = getTaskAssignedTo(task);
        return !assignedTo;
      });
    }

    // Filter by specific user ID
    return tasks.filter((task) => {
      const assignedTo = getTaskAssignedTo(task);
      return assignedTo === filterAssignedTo;
    });
  };

  const getTaskCreatorId = (task: Task) =>
    ((task as any).created_by as string | undefined) || task.createdBy || null;

  const getTaskProjectSearchText = (task: Task) =>
    [
      task.name,
      richTextToPlainText(task.description),
      task.assignedToName,
      database?.users.find((user) => user.id === getTaskCreatorId(task))?.name,
      database?.users.find((user) => user.id === getTaskCreatorId(task))?.email,
      ...(database ? getTaskTagNames(task, database.tags) : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const renderContent = () => {
    if (
      view === "email-inbox" ||
      view === "email-sent" ||
      view === "email-trash" ||
      view === "email-quarantine" ||
      view === "email-rules" ||
      view === "email-ai-lab"
    ) {
      return (
        <EmailInboxView
          view={view}
          data={database}
          onRefresh={fetchData}
          currentUserId={currentUserId}
        />
      );
    }

    if (view === "today") {
      // Get all tasks with due dates up to end of week
      let allWeekTasks = database.tasks.filter((task) => {
        const dueDate = (task as any).due_date || task.dueDate;
        if (!dueDate) return false;
        // Include overdue, today, tomorrow, and rest of week
        return (
          isOverdue(dueDate) ||
          isToday(dueDate) ||
          isTomorrow(dueDate) ||
          isRestOfWeek(dueDate)
        );
      });

      // Pull in parent tasks so subtasks always appear under their parent,
      // and pull in children so parent tasks show their subtask accordion
      const allTaskMap = new Map(database.tasks.map((t) => [t.id, t]));
      const weekTaskIds = new Set(allWeekTasks.map((t) => t.id));
      for (const task of [...allWeekTasks]) {
        // Pull in ancestors
        let parentId = task.parentId;
        while (parentId && !weekTaskIds.has(parentId)) {
          const parent = allTaskMap.get(parentId);
          if (!parent) break;
          allWeekTasks.push(parent);
          weekTaskIds.add(parent.id);
          parentId = parent.parentId;
        }
      }
      // Pull in children of included parent tasks
      for (const task of [...allWeekTasks]) {
        for (const child of database.tasks) {
          if (child.parentId === task.id && !weekTaskIds.has(child.id)) {
            allWeekTasks.push(child);
            weekTaskIds.add(child.id);
          }
        }
      }

      // Apply filters and sorting
      allWeekTasks = filterTasks(allWeekTasks);
      allWeekTasks = sortTasks(allWeekTasks);

      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        allWeekTasks = allWeekTasks.filter(
          (task) => !blockedTaskIds.has(task.id),
        );
      }

      // Apply search filter
      if (taskSearchQuery.trim()) {
        const query = taskSearchQuery.toLowerCase();
        allWeekTasks = allWeekTasks.filter(
          (task) =>
            task.name.toLowerCase().includes(query) ||
            richTextToPlainText(task.description).toLowerCase().includes(query),
        );
      }

      // Group tasks by section
      const completedWeekTasks = allWeekTasks.filter((task) => task.completed);
      const activeWeekTasks = allWeekTasks.filter((task) => !task.completed);
      const todayEmailItems = database.inboxItems.filter((item) => {
        if (!shouldShowInboxItemInToday(item)) return false;

        if (!taskSearchQuery.trim()) {
          return true;
        }

        const query = taskSearchQuery.toLowerCase();
        return (
          item.actionTitle.toLowerCase().includes(query) ||
          item.subject.toLowerCase().includes(query) ||
          (item.summaryText || item.previewText || "")
            .toLowerCase()
            .includes(query)
        );
      });

      // Helper: ensure parent tasks appear in sections with their children,
      // and children appear alongside their parents
      const addMissingFamily = (sectionTasks: Task[], allActive: Task[]) => {
        const sectionIds = new Set(sectionTasks.map((t) => t.id));
        const activeMap = new Map(allActive.map((t) => [t.id, t]));
        // Pull in ancestors
        for (const task of [...sectionTasks]) {
          let parentId = task.parentId;
          while (parentId && !sectionIds.has(parentId)) {
            const parent = activeMap.get(parentId);
            if (!parent) break;
            sectionTasks.push(parent);
            sectionIds.add(parent.id);
            parentId = parent.parentId;
          }
        }
        // Pull in children of included parents
        for (const task of [...sectionTasks]) {
          for (const child of allActive) {
            if (child.parentId === task.id && !sectionIds.has(child.id)) {
              sectionTasks.push(child);
              sectionIds.add(child.id);
            }
          }
        }
        return sectionTasks;
      };

      const overdueTasks = addMissingFamily(
        activeWeekTasks.filter((task) => {
          const dueDate = (task as any).due_date || task.dueDate;
          return dueDate && isOverdue(dueDate);
        }),
        activeWeekTasks,
      );

      const todayTasks = addMissingFamily(
        activeWeekTasks.filter((task) => {
          const dueDate = (task as any).due_date || task.dueDate;
          return dueDate && isToday(dueDate);
        }),
        activeWeekTasks,
      );

      const tomorrowTasks = addMissingFamily(
        activeWeekTasks.filter((task) => {
          const dueDate = (task as any).due_date || task.dueDate;
          return dueDate && isTomorrow(dueDate);
        }),
        activeWeekTasks,
      );

      const restOfWeekTasks = addMissingFamily(
        activeWeekTasks.filter((task) => {
          const dueDate = (task as any).due_date || task.dueDate;
          return dueDate && isRestOfWeek(dueDate);
        }),
        activeWeekTasks,
      );

      // Count overdue tasks specifically (for reschedule button)
      const overdueCount = overdueTasks.filter((t) => !t.completed).length;

      // Toggle section expansion
      const toggleSection = (section: keyof typeof todaySections) => {
        setTodaySections((prev) => ({ ...prev, [section]: !prev[section] }));
      };

      // Section header component
      const SectionHeader = ({
        title,
        count,
        section,
        isOpen,
        actions,
      }: {
        title: string;
        count: number;
        section: keyof typeof todaySections;
        isOpen: boolean;
        actions?: ReactNode;
      }) => (
        <div className="flex items-center gap-3 border-b border-zinc-700 py-2 px-1">
          <button
            onClick={() => toggleSection(section)}
            className="group flex flex-1 items-center justify-between"
          >
            <span className="text-sm font-medium text-zinc-500 transition-colors group-hover:text-zinc-400">
              {title}{" "}
              {count > 0 && <span className="text-zinc-600">({count})</span>}
            </span>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-zinc-500" />
            ) : (
              <ChevronUp className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-zinc-500" />
            )}
          </button>
          {actions ? <div className="flex items-center">{actions}</div> : null}
        </div>
      );

      const handleTaskUpdate = async (
        taskId: string,
        updates: Partial<Task>,
      ) => {
        setDatabase((prev) => {
          if (!prev) return prev;
          const updatesAny = updates as any;
          return {
            ...prev,
            tasks: prev.tasks.map((task) => {
              if (task.id !== taskId) return task;
              const hasDueDate =
                Object.prototype.hasOwnProperty.call(updatesAny, "due_date") ||
                Object.prototype.hasOwnProperty.call(updatesAny, "dueDate");
              const hasDueTime =
                Object.prototype.hasOwnProperty.call(updatesAny, "due_time") ||
                Object.prototype.hasOwnProperty.call(updatesAny, "dueTime");
              const nextDueDate = hasDueDate
                ? (updatesAny.due_date ?? updatesAny.dueDate ?? null)
                : ((task as any).due_date ?? task.dueDate ?? null);
              const nextDueTime = hasDueTime
                ? (updatesAny.due_time ?? updatesAny.dueTime ?? null)
                : ((task as any).due_time ?? task.dueTime ?? null);
              return {
                ...task,
                ...updates,
                dueDate: nextDueDate ?? undefined,
                dueTime: nextDueTime ?? undefined,
                due_date: nextDueDate,
                due_time: nextDueTime,
              } as any;
            }),
          };
        });
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          });

          if (response.ok) {
            await fetchData();
          } else {
            await fetchData();
          }
        } catch (error) {
          console.error("Error updating task:", error);
          await fetchData();
        }
      };

      // Common TaskList props
      const getTaskListProps = (
        tasks: typeof allWeekTasks,
        accordionKey: string,
      ) => ({
        tasks,
        allTasks: database.tasks,
        projects: database.projects,
        tags: database.tags,
        currentUserId,
        priorityColor: userPriorityColor,
        showCompleted: database.settings?.showCompletedTasks ?? true,
        completedAccordionKey: accordionKey,
        revealActionsOnHover: true,
        uniformDueBadgeWidth: dueDateLayout === "inline",
        dueDateLayout,
        onTaskToggle: handleTaskToggle,
        onTaskEdit: handleTaskEdit,
        onTaskDelete: handleTaskDelete,
        onTaskUpdate: handleTaskUpdate,
        enableDueDateQuickEdit: true,
        bulkSelectMode,
        selectedTaskIds,
        loadingTaskIds,
        animatingOutTaskIds,
        optimisticCompletedIds,
        onTaskFocus: focusTaskRow,
        onTaskSelect: (taskId: string, event?: React.MouseEvent) => {
          if (event?.ctrlKey || event?.metaKey) {
            setSelectedTaskIds((prev) => {
              const next = new Set(prev);
              next.delete(taskId);
              return next;
            });
            return;
          }
          if (event?.shiftKey && lastSelectedTaskId) {
            const taskIds = allWeekTasks.map((t) => t.id);
            const lastIndex = taskIds.indexOf(lastSelectedTaskId);
            const currentIndex = taskIds.indexOf(taskId);
            if (lastIndex !== -1 && currentIndex !== -1) {
              const start = Math.min(lastIndex, currentIndex);
              const end = Math.max(lastIndex, currentIndex);
              const rangeIds = taskIds.slice(start, end + 1);
              setSelectedTaskIds((prev) => {
                const next = new Set(prev);
                rangeIds.forEach((id) => next.add(id));
                return next;
              });
              return;
            }
          }
          setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
              next.delete(taskId);
            } else {
              next.add(taskId);
            }
            return next;
          });
          setLastSelectedTaskId(taskId);
        },
      });

      const todayDate = new Date();
      const todayLabel = `${format(todayDate, "EEE")}. ${format(todayDate, "MMM")}. ${format(todayDate, "do")} '${format(todayDate, "yy")}`;

      return (
        <div className="relative">
          {/* Header bar */}
          <div className="sticky top-0 z-40 w-full bg-zinc-900 border-b border-zinc-800">
            <div className="w-full px-4 py-4">
              <div className="flex items-center justify-between gap-4 overflow-x-auto">
                <div className="flex items-center gap-4 shrink-0">
                  <div className="px-4 py-1 bg-zinc-800 border border-zinc-700">
                    <span className="text-sm font-medium text-zinc-300">
                      {todayLabel}
                    </span>
                  </div>
                </div>
                <div className="relative flex items-center flex-1 min-w-[220px] max-w-[360px]">
                  <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    data-task-search-input="true"
                    value={taskSearchQuery}
                    onChange={(e) => setTaskSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    className="bg-zinc-800 text-white text-sm pl-9 pr-3 py-1.5 rounded border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all w-full"
                  />
                  {taskSearchQuery && (
                    <button
                      onClick={() => setTaskSearchQuery("")}
                      className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end gap-4 shrink-0">
                  <div className="flex items-center gap-2">
                    {user && (
                      <button
                        onClick={() => setShowTodoistSync(true)}
                        className="p-2.5 hover:bg-zinc-800 rounded-lg transition-colors text-red-500 hover:text-red-400"
                        title="Sync with Todoist"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {overdueCount > 0 && (
                      <button
                        onClick={() => setShowRescheduleConfirm(true)}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-orange-400 hover:text-orange-300"
                        title={`Reschedule ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`}
                      >
                        <CalendarClock className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setDueDateLayout((prev) =>
                        prev === "inline"
                          ? "below"
                          : prev === "below"
                            ? "right"
                            : "inline",
                      )
                    }
                    className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                    title={`Date: ${dueDateLayout === "inline" ? "Inline" : dueDateLayout === "below" ? "Below" : "Right"}`}
                  >
                    <CalendarDays className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                          aria-label="Sort options"
                        >
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="bottom"
                          align="center"
                          sideOffset={8}
                          className="z-50 w-44 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl p-2"
                        >
                          <div className="text-[11px] text-zinc-500 px-1 pb-1">
                            Sort by
                          </div>
                          <Select
                            value={sortBy}
                            onValueChange={(value) =>
                              setSortBy(value as typeof sortBy)
                            }
                          >
                            <SelectTrigger className="h-8 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                              <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dueDate">Due Date</SelectItem>
                              <SelectItem value="deadline">Deadline</SelectItem>
                              <SelectItem value="priority">Priority</SelectItem>
                            </SelectContent>
                          </Select>
                          <Popover.Arrow
                            className="fill-zinc-900 stroke-zinc-800"
                            width={10}
                            height={6}
                          />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>

                  <div className="flex items-center gap-1">
                    <span title="Assigned to">
                      <User className="w-4 h-4 text-zinc-400" />
                    </span>
                    <Select
                      value={filterAssignedTo}
                      onValueChange={(value) => setFilterAssignedTo(value)}
                    >
                      <SelectTrigger className="h-8 w-[170px] bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Assigned to" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="me-unassigned">
                          Me + Unassigned
                        </SelectItem>
                        <SelectItem value="me">Me</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {database.users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.firstName} {user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <button
                    onClick={() => setShowBlockedTasks(!showBlockedTasks)}
                    className={`p-2 rounded border transition-colors ${
                      showBlockedTasks
                        ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600"
                    }`}
                    title={
                      showBlockedTasks
                        ? "Currently Showing Blocked Tasks"
                        : "Currently Hiding Blocked Tasks"
                    }
                  >
                    {showBlockedTasks ? (
                      <Link2 className="w-4 h-4" />
                    ) : (
                      <Link2Off className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (bulkSelectMode) {
                        setBulkSelectMode(false);
                        setSelectedTaskIds(new Set());
                        setLastSelectedTaskId(null);
                      } else {
                        setBulkSelectMode(true);
                      }
                    }}
                    className={`p-2 rounded border transition-colors ${
                      bulkSelectMode
                        ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600"
                    }`}
                    title={
                      bulkSelectMode ? "Cancel Bulk Select" : "Bulk Select"
                    }
                  >
                    {bulkSelectMode ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {bulkSelectMode && selectedTaskIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkEditModal(true)}
                      className="px-3 py-1.5 rounded border bg-[rgb(var(--theme-primary-rgb))] text-white border-[rgb(var(--theme-primary-rgb))] hover:bg-[rgb(var(--theme-primary-rgb))]/80 transition-colors text-sm font-medium"
                    >
                      Apply to {selectedTaskIds.size} task
                      {selectedTaskIds.size > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Task List with dark container - Grouped by time period */}
          <div className="w-full pb-8 pt-6">
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2 mx-4">
              {todayEmailItems.length > 0 && (
                <div>
                  <SectionHeader
                    title="Email Work"
                    count={todayEmailItems.length}
                    section="email"
                    isOpen={todaySections.email}
                    actions={
                      <Tooltip
                        content="AI + Spam"
                        className="w-auto"
                        side="bottom"
                        align="end"
                      >
                        <button
                          type="button"
                          onClick={() => setShowTodaySpamReview(true)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                          aria-label="AI + Spam"
                        >
                          <Bot className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    }
                  />
                  {todaySections.email && (
                    <div className="mt-2">
                      <EmailWorkList
                        items={todayEmailItems}
                        mailboxes={database.mailboxes}
                        projects={database.projects}
                        selectedId={selectedTodayEmailId}
                        onSelect={(item) => setSelectedTodayEmailId(item.id)}
                        emptyLabel="No email work is waiting in Today."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Overdue Section */}
              {overdueTasks.length > 0 && (
                <div>
                  <SectionHeader
                    title="Overdue"
                    count={overdueTasks.filter((t) => !t.completed).length}
                    section="overdue"
                    isOpen={todaySections.overdue}
                  />
                  {todaySections.overdue && (
                    <div className="mt-1">
                      <TaskList
                        {...getTaskListProps(overdueTasks, "today-overdue")}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Today Section */}
              <div>
                <SectionHeader
                  title="Today"
                  count={todayTasks.filter((t) => !t.completed).length}
                  section="today"
                  isOpen={todaySections.today}
                />
                {todaySections.today && (
                  <div className="mt-1">
                    {todayTasks.length > 0 ? (
                      <TaskList
                        {...getTaskListProps(todayTasks, "today-today")}
                      />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">
                        No tasks due today
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Tomorrow Section */}
              <div>
                <SectionHeader
                  title="Tomorrow"
                  count={tomorrowTasks.filter((t) => !t.completed).length}
                  section="tomorrow"
                  isOpen={todaySections.tomorrow}
                />
                {todaySections.tomorrow && (
                  <div className="mt-1">
                    {tomorrowTasks.length > 0 ? (
                      <TaskList
                        {...getTaskListProps(tomorrowTasks, "today-tomorrow")}
                      />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">
                        No tasks due tomorrow
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Rest of Week Section */}
              <div>
                <SectionHeader
                  title="Rest of the Week"
                  count={restOfWeekTasks.filter((t) => !t.completed).length}
                  section="restOfWeek"
                  isOpen={todaySections.restOfWeek}
                />
                {todaySections.restOfWeek && (
                  <div className="mt-1">
                    {restOfWeekTasks.length > 0 ? (
                      <TaskList
                        {...getTaskListProps(
                          restOfWeekTasks,
                          "today-restofweek",
                        )}
                      />
                    ) : (
                      <p className="text-sm text-zinc-600 py-2 px-1">
                        No tasks for the rest of the week
                      </p>
                    )}
                  </div>
                )}
              </div>

              {completedWeekTasks.length > 0 && (
                <div className="mt-4">
                  <TaskList
                    {...getTaskListProps(completedWeekTasks, "today-completed")}
                    showCompleted={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (view === "upcoming") {
      // Filter tasks based on selected date type
      let upcomingTasks = database.tasks.filter((task) => {
        if (task.completed) return false;
        if (upcomingFilterType === "dueDate") {
          // Handle both snake_case and camelCase fields
          const dueDate = (task as any).due_date || task.dueDate;
          return dueDate !== null && dueDate !== undefined;
        } else {
          return task.deadline !== null && task.deadline !== undefined;
        }
      });

      // Filter blocked tasks if needed
      if (!showBlockedTasks && database) {
        upcomingTasks = upcomingTasks.filter(
          (task) => !blockedTaskIds.has(task.id),
        );
      }

      const handleTaskUpdate = async (
        taskId: string,
        updates: Partial<Task>,
      ) => {
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          });

          if (response.ok) {
            await fetchData();
          }
        } catch (error) {
          console.error("Error updating task:", error);
        }
      };

      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Upcoming</h1>
              <div className="px-4 py-1 rounded-lg bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 backdrop-filter backdrop-blur-xl border border-zinc-600/30">
                <span className="text-sm font-medium text-zinc-300">
                  Next 7 Days
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Date Filter Toggle */}
              <div className="flex bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setUpcomingFilterType("dueDate")}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    upcomingFilterType === "dueDate"
                      ? "bg-theme-gradient text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Due Date
                </button>
                <button
                  onClick={() => setUpcomingFilterType("deadline")}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    upcomingFilterType === "deadline"
                      ? "bg-theme-gradient text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Deadline
                </button>
              </div>

              {/* Blocked Tasks Toggle */}
              <span className="relative group/blocked">
                <button
                  onClick={() => setShowBlockedTasks(!showBlockedTasks)}
                  className={`p-2 rounded border transition-colors ${
                    showBlockedTasks
                      ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600"
                  }`}
                >
                  {showBlockedTasks ? (
                    <Link2 className="w-4 h-4" />
                  ) : (
                    <Link2Off className="w-4 h-4" />
                  )}
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/blocked:opacity-100 transition-opacity pointer-events-none z-50">
                  {showBlockedTasks
                    ? "Currently Showing Blocked Tasks"
                    : "Currently Hiding Blocked Tasks"}
                </span>
              </span>
            </div>
          </div>
          <KanbanView
            tasks={upcomingTasks}
            allTasks={database.tasks}
            projects={database.projects}
            onTaskToggle={handleTaskToggle}
            onTaskEdit={handleTaskEdit}
            onTaskUpdate={handleTaskUpdate}
            dateType={upcomingFilterType}
          />
        </div>
      );
    }

    if (view === "search") {
      // Filter tasks based on search query
      const filteredTasks = database.tasks.filter((task) => {
        const query = searchQuery.toLowerCase();
        return (
          task.name.toLowerCase().includes(query) ||
          richTextToPlainText(task.description).toLowerCase().includes(query) ||
          (task.tagBadges &&
            task.tagBadges.some((tag) =>
              tag.name.toLowerCase().includes(query),
            ))
        );
      });

      // Filter projects based on search query
      const filteredProjects = database.projects.filter((project) => {
        const query = searchQuery.toLowerCase();
        return (
          project.name.toLowerCase().includes(query) ||
          richTextToPlainText(project.description).toLowerCase().includes(query)
        );
      });

      // Filter organizations based on search query
      const filteredOrganizations = database.organizations.filter((org) => {
        const query = searchQuery.toLowerCase();
        return (
          org.name.toLowerCase().includes(query) ||
          richTextToPlainText(org.description).toLowerCase().includes(query)
        );
      });

      return (
        <div>
          <h1 className="text-2xl font-bold mb-6">Search</h1>

          {/* Search Input */}
          <div className="mb-6">
            <input
              type="text"
              data-task-search-input="true"
              placeholder="Search tasks, projects, and organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:ring-2 ring-theme focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Search Filters */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setSearchFilter("all")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "all"
                  ? "bg-theme-primary text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSearchFilter("tasks")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "tasks"
                  ? "bg-theme-primary text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Tasks ({filteredTasks.length})
            </button>
            <button
              onClick={() => setSearchFilter("projects")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "projects"
                  ? "bg-theme-primary text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Projects ({filteredProjects.length})
            </button>
            <button
              onClick={() => setSearchFilter("organizations")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "organizations"
                  ? "bg-theme-primary text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Organizations ({filteredOrganizations.length})
            </button>
          </div>

          {/* Search Results */}
          <div className="space-y-6">
            {/* Tasks Results */}
            {(searchFilter === "all" || searchFilter === "tasks") &&
              filteredTasks.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Tasks</h2>
                  <TaskList
                    tasks={filteredTasks}
                    allTasks={database.tasks}
                    projects={database.projects}
                    tags={database.tags}
                    currentUserId={currentUserId}
                    priorityColor={userPriorityColor}
                    showCompleted={
                      database.settings?.showCompletedTasks ?? true
                    }
                    completedAccordionKey="search"
                    onTaskToggle={handleTaskToggle}
                    onTaskEdit={handleTaskEdit}
                    onTaskDelete={handleTaskDelete}
                    onTaskFocus={focusTaskRow}
                  />
                </div>
              )}

            {/* Projects Results */}
            {(searchFilter === "all" || searchFilter === "projects") &&
              filteredProjects.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Projects</h2>
                  <div className="grid gap-3">
                    {filteredProjects.map((project) => {
                      const org = database.organizations.find(
                        (o) => o.id === project.organizationId,
                      );
                      const taskCount = database.tasks.filter(
                        (t) =>
                          ((t as any).project_id || t.projectId) === project.id,
                      ).length;

                      return (
                        <Link
                          key={project.id}
                          href={`/project-${project.id}`}
                          className="block p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <div className="flex-1">
                              <h3 className="font-medium">{project.name}</h3>
                              {project.description && (
                                <p className="text-sm text-zinc-400 mt-1">
                                  {getRichTextPreview(project.description, 120)}
                                </p>
                              )}
                              <p className="text-xs text-zinc-500 mt-1">
                                {org?.name} • {taskCount} tasks
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Organizations Results */}
            {(searchFilter === "all" || searchFilter === "organizations") &&
              filteredOrganizations.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3">Organizations</h2>
                  <div className="grid gap-3">
                    {filteredOrganizations.map((org) => {
                      const projectCount = database.projects.filter(
                        (p) => p.organizationId === org.id,
                      ).length;

                      return (
                        <Link
                          key={org.id}
                          href={`/org-${org.id}`}
                          className="block p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: org.color }}
                            />
                            <div className="flex-1">
                              <h3 className="font-medium">{org.name}</h3>
                              {org.description && (
                                <p className="text-sm text-zinc-400 mt-1">
                                  {org.description}
                                </p>
                              )}
                              <p className="text-xs text-zinc-500 mt-1">
                                {projectCount} projects
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* No Results */}
            {searchQuery &&
              filteredTasks.length === 0 &&
              filteredProjects.length === 0 &&
              filteredOrganizations.length === 0 && (
                <p className="text-zinc-400 text-center py-8">
                  No results found for &quot;{searchQuery}&quot;
                </p>
              )}

            {/* Empty State */}
            {!searchQuery && (
              <p className="text-zinc-400 text-center py-8">
                Start typing to search across your tasks, projects, and
                organizations
              </p>
            )}
          </div>
        </div>
      );
    }

    if (view === "favorites") {
      return (
        <div>
          <h1 className="text-2xl font-bold mb-6">Favorites</h1>
          <p className="text-zinc-400">
            Your favorite projects will appear here
          </p>
        </div>
      );
    }

    if (view === "time") {
      return <TimeTrackingView />;
    }

    if (view.startsWith("org-")) {
      const orgId = view.replace("org-", "");
      const organization = database.organizations.find((o) => o.id === orgId);
      const orgProjects = database.projects.filter(
        (p) => p.organizationId === orgId,
      );
      const activeProjects = orgProjects.filter((p) => !p.archived);
      const archivedProjects = orgProjects.filter((p) => p.archived);

      return (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold">
                {organization?.name || "Organization"}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditOrganization(orgId)}
                  className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                  title="Edit organization"
                >
                  <Edit className="w-5 h-5" />
                </button>
                {organization?.archived ? (
                  <button
                    onClick={() =>
                      handleOrganizationUpdate(orgId, { archived: false })
                    }
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                    title="Restore organization"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleOrganizationUpdate(orgId, { archived: true })
                    }
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                    title="Archive organization"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => openDeleteConfirmation(orgId)}
                  className="p-2 hover:bg-zinc-800 rounded transition-colors text-red-400 hover:text-red-300"
                  title="Delete organization"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <p className="text-zinc-400 mb-4">
              {activeProjects.length} active projects, {archivedProjects.length}{" "}
              archived
            </p>

            {editingOrgDescription === orgId ? (
              <textarea
                value={organization?.description || ""}
                onChange={(e) => {
                  handleOrganizationUpdate(orgId, {
                    description: e.target.value,
                  });
                }}
                onBlur={() => setEditingOrgDescription(null)}
                placeholder="Add a description..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 ring-theme transition-all"
                rows={3}
                autoFocus
              />
            ) : (
              <div
                onClick={() => setEditingOrgDescription(orgId)}
                className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300 p-3 bg-zinc-800/50 rounded-lg border border-transparent hover:border-zinc-700"
              >
                {organization?.description || "Click to add description..."}
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Projects</h2>
              <div className="grid gap-4">
                {activeProjects.map((project) => {
                  const taskCount = database.tasks.filter(
                    (t) =>
                      ((t as any).project_id || t.projectId) === project.id,
                  ).length;
                  const completedCount = database.tasks.filter(
                    (t) =>
                      ((t as any).project_id || t.projectId) === project.id &&
                      t.completed,
                  ).length;

                  return (
                    <div
                      key={project.id}
                      className="bg-zinc-900 rounded-lg p-4 border border-zinc-800"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <Link
                          href={`/project-${project.id}`}
                          className="flex items-center gap-2 text-lg font-medium hover:text-zinc-300 transition-colors"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          {project.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleProjectUpdate(project.id, {
                                archived: false,
                              })
                            }
                            className="p-1 hover:bg-zinc-800 rounded transition-colors"
                            title="Unarchive project"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to delete "${project.name}"? This will also delete all tasks in this project.`,
                                )
                              ) {
                                handleProjectDelete(project.id);
                              }
                            }}
                            className="p-1 hover:bg-zinc-800 rounded transition-colors text-red-400"
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {project.description && (
                        <p className="text-sm text-zinc-400 mb-2">
                          {getRichTextPreview(project.description, 180)}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-zinc-500">
                        <span>
                          {taskCount} tasks ({completedCount} completed)
                        </span>
                        {project.budget && (
                          <span>Budget: ${project.budget}</span>
                        )}
                        {project.deadline && (
                          <span>
                            Deadline:{" "}
                            {new Date(project.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {activeProjects.length === 0 && (
                  <p className="text-zinc-500">No active projects</p>
                )}
              </div>
            </div>

            {archivedProjects.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 text-zinc-400">
                  Archived Projects
                </h2>
                <div className="grid gap-4">
                  {archivedProjects.map((project) => {
                    const taskCount = database.tasks.filter(
                      (t) =>
                        ((t as any).project_id || t.projectId) === project.id,
                    ).length;

                    return (
                      <div
                        key={project.id}
                        className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800 opacity-60"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 text-lg font-medium">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleProjectUpdate(project.id, {
                                  archived: false,
                                })
                              }
                              className="p-1 hover:bg-zinc-800 rounded transition-colors"
                              title="Restore project"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `Are you sure you want to permanently delete "${project.name}"? This will also delete all tasks in this project.`,
                                  )
                                ) {
                                  handleProjectDelete(project.id);
                                }
                              }}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors text-red-400"
                              title="Delete project permanently"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-zinc-500">
                          <span>{taskCount} tasks</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (view.startsWith("project-")) {
      const projectId =
        projectViewData?.projectId || view.replace("project-", "");
      const project = projectViewData?.project;
      const projectTasks = projectViewData?.projectTasks || [];
      const projectSections = projectViewData?.projectSections || [];
      const unassignedTasks = projectViewData?.unassignedTasks || [];
      const projectInboxItems = database.inboxItems.filter(
        (item) =>
          item.projectId === projectId &&
          item.status !== "resolved" &&
          item.status !== "archived" &&
          item.status !== "deleted",
      );
      const projectSearchValue = projectTaskSearchQuery.trim().toLowerCase();

      const currentProjectUserId = currentUserId || "";

      const visibleProjectTasks = projectTasks.filter((task) => {
        const assignedTo = getTaskAssignedTo(task);

        if (projectStatusFilter === "active" && task.completed) return false;
        if (projectStatusFilter === "completed" && !task.completed)
          return false;

        if (projectAssigneeFilter === "assigned" && !assignedTo) {
          return false;
        }
        if (projectAssigneeFilter === "unassigned" && assignedTo) {
          return false;
        }
        if (projectAssigneeFilter === "me" && assignedTo !== currentUserId) {
          return false;
        }
        if (
          !["all", "assigned", "unassigned", "me"].includes(
            projectAssigneeFilter,
          ) &&
          assignedTo !== projectAssigneeFilter
        ) {
          return false;
        }

        const creatorId = getTaskCreatorId(task);
        if (
          projectCreatorFilter === "me" &&
          creatorId !== currentProjectUserId
        ) {
          return false;
        }
        if (
          projectCreatorFilter !== "all" &&
          projectCreatorFilter !== "me" &&
          creatorId !== projectCreatorFilter
        ) {
          return false;
        }

        if (
          projectPriorityFilter !== "all" &&
          String(task.priority) !== projectPriorityFilter
        ) {
          return false;
        }

        if (!taskMatchesTagFilter(task, projectTagFilter)) {
          return false;
        }

        if (!showBlockedTasks && blockedTaskIds.has(task.id)) {
          return false;
        }

        if (
          projectSearchValue &&
          !getTaskProjectSearchText(task).includes(projectSearchValue)
        ) {
          return false;
        }

        return true;
      });

      const visibleProjectTaskIds = new Set(
        visibleProjectTasks.map((task) => task.id),
      );
      const visibleProjectTaskIdList = visibleProjectTasks.map(
        (task) => task.id,
      );
      const { visibleSelectedCount, hasVisibleSelection, allVisibleSelected } =
        getBulkSelectionState(visibleProjectTaskIdList, selectedTaskIds);
      const visibleUnassignedTasks = unassignedTasks.filter((task) =>
        visibleProjectTaskIds.has(task.id),
      );
      const sectionChildrenByParent = new Map<string, Section[]>();
      for (const section of database.sections || []) {
        if (!section.parentId) continue;
        const siblings = sectionChildrenByParent.get(section.parentId) || [];
        siblings.push(section);
        sectionChildrenByParent.set(section.parentId, siblings);
      }
      sectionChildrenByParent.forEach((sections) => {
        sections.sort((a, b) => (a.order || 0) - (b.order || 0));
      });
      const taskSectionIdsByTaskId = new Map<string, string[]>();
      for (const taskSection of database.taskSections || []) {
        const sectionIds = taskSectionIdsByTaskId.get(taskSection.taskId) || [];
        sectionIds.push(taskSection.sectionId);
        taskSectionIdsByTaskId.set(taskSection.taskId, sectionIds);
      }
      const sectionTasksBySectionId = new Map<string, Task[]>();
      const addTaskToSection = (sectionId: string, task: Task) => {
        const sectionTasks = sectionTasksBySectionId.get(sectionId) || [];
        sectionTasks.push(task);
        sectionTasksBySectionId.set(sectionId, sectionTasks);
      };
      for (const task of visibleProjectTasks) {
        const assignedSectionIds = new Set<string>();
        const directSectionId = task.sectionId || (task as any).section_id;
        if (directSectionId) {
          assignedSectionIds.add(directSectionId);
        }
        for (const sectionId of taskSectionIdsByTaskId.get(task.id) || []) {
          assignedSectionIds.add(sectionId);
        }
        assignedSectionIds.forEach((sectionId) =>
          addTaskToSection(sectionId, task),
        );
      }
      const sectionHasVisibleTasks = (sectionId: string): boolean => {
        if ((sectionTasksBySectionId.get(sectionId)?.length || 0) > 0) {
          return true;
        }

        const childSections = sectionChildrenByParent.get(sectionId) || [];
        return childSections.some((childSection) =>
          sectionHasVisibleTasks(childSection.id),
        );
      };

      const visibleProjectSections = projectSections.filter((section) =>
        sectionHasVisibleTasks(section.id),
      );
      const projectCreatorIds = Array.from(
        new Set(
          projectTasks
            .map((task) => getTaskCreatorId(task))
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const handleProjectTaskUpdate = async (
        taskId: string,
        updates: Partial<Task>,
      ) => {
        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          });

          if (response.ok) {
            await fetchData();
          } else {
            await fetchData();
          }
        } catch (error) {
          console.error("Error updating task:", error);
          await fetchData();
        }
      };

      const handleProjectTaskSelect = (
        taskId: string,
        event?: React.MouseEvent,
      ) => {
        if (event?.shiftKey && lastSelectedTaskId) {
          const lastIndex =
            visibleProjectTaskIdList.indexOf(lastSelectedTaskId);
          const currentIndex = visibleProjectTaskIdList.indexOf(taskId);
          if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const rangeIds = visibleProjectTaskIdList.slice(start, end + 1);
            setSelectedTaskIds((prev) =>
              setBulkSelectionForTaskIds(prev, rangeIds, true),
            );
            setLastSelectedTaskId(taskId);
            return;
          }
        }

        setSelectedTaskIds((prev) => {
          const next = new Set(prev);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return next;
        });
        setLastSelectedTaskId(taskId);
      };

      return (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="relative">
                <span
                  className="w-4 h-4 rounded-full block cursor-pointer hover:ring-2 hover:ring-zinc-400 transition-all"
                  style={{ backgroundColor: project?.color }}
                  onMouseEnter={() => setShowProjectColorPicker(true)}
                  onMouseLeave={() => setShowProjectColorPicker(false)}
                ></span>
                {showProjectColorPicker && project && (
                  <div
                    onMouseEnter={() => setShowProjectColorPicker(true)}
                    onMouseLeave={() => setShowProjectColorPicker(false)}
                  >
                    <ColorPicker
                      currentColor={project.color}
                      onColorChange={(color) => {
                        handleProjectUpdate(project.id, { color });
                        setShowProjectColorPicker(false);
                      }}
                      onClose={() => setShowProjectColorPicker(false)}
                    />
                  </div>
                )}
              </div>
              {project?.name || "Project"}
            </h1>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {project ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowProjectNotesModal(true)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                    title="Project description and notes"
                    aria-label="Project description and notes"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditProject(projectId)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                    title="Project settings and DevNotes"
                    aria-label="Project settings and DevNotes"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <ProjectAiExportControls projectId={project.id} />
                </>
              ) : null}
              <button
                onClick={() => openAddTask(project?.id)}
                className="btn-theme-primary text-white rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                Task
              </button>
            </div>
          </div>

          {project && (
            <ProjectProgressTimeline project={project} tasks={projectTasks} />
          )}

          <ProjectWorkTabs
            activeTab={projectWorkTab}
            emailCount={projectInboxItems.length}
            onTabChange={setProjectWorkTab}
            emailContent={
              <EmailWorkList
                items={projectInboxItems}
                mailboxes={database.mailboxes}
                projects={database.projects}
                emptyLabel="No email work linked to this project."
              />
            }
            taskContent={
              <>
                <div className="mb-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Project Task Filters
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-zinc-500">
                        {visibleProjectTasks.length} visible
                      </div>
                      <div
                        className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-1"
                        aria-label="Project section layout"
                      >
                        <button
                          type="button"
                          onClick={() => updateProjectSectionLayout("list")}
                          aria-pressed={projectSectionLayout === "list"}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            projectSectionLayout === "list"
                              ? "bg-[rgb(var(--theme-primary-rgb))] text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                          title="Section list layout"
                        >
                          <LayoutList className="h-3.5 w-3.5" />
                          List
                        </button>
                        <button
                          type="button"
                          onClick={() => updateProjectSectionLayout("board")}
                          aria-pressed={projectSectionLayout === "board"}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            projectSectionLayout === "board"
                              ? "bg-[rgb(var(--theme-primary-rgb))] text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                          title="Horizontal section board"
                        >
                          <Columns3 className="h-3.5 w-3.5" />
                          Board
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (bulkSelectMode) {
                            setBulkSelectMode(false);
                            setSelectedTaskIds(new Set());
                            setLastSelectedTaskId(null);
                            return;
                          }

                          setBulkSelectMode(true);
                          setSelectedTaskIds(new Set());
                          setLastSelectedTaskId(null);
                        }}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          bulkSelectMode
                            ? "border-[rgb(var(--theme-primary-rgb))]/30 bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))]"
                            : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
                        }`}
                      >
                        {bulkSelectMode ? (
                          <CheckSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                        {bulkSelectMode ? "Cancel Bulk Select" : "Bulk Select"}
                      </button>
                      {bulkSelectMode &&
                        visibleProjectTaskIdList.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTaskIds((prev) =>
                                setBulkSelectionForTaskIds(
                                  prev,
                                  visibleProjectTaskIdList,
                                  !allVisibleSelected,
                                ),
                              );
                              if (!allVisibleSelected) {
                                setLastSelectedTaskId(
                                  visibleProjectTaskIdList[
                                    visibleProjectTaskIdList.length - 1
                                  ] || null,
                                );
                              }
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                          >
                            {allVisibleSelected
                              ? "Clear Visible"
                              : "Select Visible"}
                          </button>
                        )}
                      {bulkSelectMode && hasVisibleSelection && (
                        <button
                          type="button"
                          onClick={() => setShowBulkEditModal(true)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--theme-primary-rgb))] bg-[rgb(var(--theme-primary-rgb))] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[rgb(var(--theme-primary-rgb))]/80"
                        >
                          Apply to {visibleSelectedCount} task
                          {visibleSelectedCount === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        data-task-search-input="true"
                        value={projectTaskSearchQuery}
                        onChange={(e) =>
                          setProjectTaskSearchQuery(e.target.value)
                        }
                        placeholder="Search this project..."
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-9 text-sm text-white transition-all focus:outline-none focus:ring-2 ring-theme"
                      />
                      {projectTaskSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setProjectTaskSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <Select
                      value={projectAssigneeFilter}
                      onValueChange={setProjectAssigneeFilter}
                    >
                      <SelectTrigger className="h-10 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Assigned To" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Assigned To: All</SelectItem>
                        <SelectItem value="assigned">
                          Assigned To: Assigned
                        </SelectItem>
                        <SelectItem value="me">Assigned To: Me</SelectItem>
                        <SelectItem value="unassigned">
                          Assigned To: Unassigned
                        </SelectItem>
                        {database.users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            Assigned To: {user.firstName} {user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={projectCreatorFilter}
                      onValueChange={setProjectCreatorFilter}
                    >
                      <SelectTrigger className="h-10 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Created By" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Created By: All</SelectItem>
                        <SelectItem value="me">Created By: Me</SelectItem>
                        {projectCreatorIds.map((creatorId) => {
                          const creator = database.users.find(
                            (user) => user.id === creatorId,
                          );
                          if (!creator) return null;
                          return (
                            <SelectItem key={creator.id} value={creator.id}>
                              Created By: {creator.firstName} {creator.lastName}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <Select
                      value={projectPriorityFilter}
                      onValueChange={setProjectPriorityFilter}
                    >
                      <SelectTrigger className="h-10 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Priority: All</SelectItem>
                        <SelectItem value="1">Priority 1</SelectItem>
                        <SelectItem value="2">Priority 2</SelectItem>
                        <SelectItem value="3">Priority 3</SelectItem>
                        <SelectItem value="4">Priority 4</SelectItem>
                      </SelectContent>
                    </Select>

                    <ProjectTagFilter
                      tags={database.tags}
                      value={projectTagFilter}
                      onChange={setProjectTagFilter}
                    />

                    <Select
                      value={projectStatusFilter}
                      onValueChange={(value) =>
                        setProjectStatusFilter(
                          value as typeof projectStatusFilter,
                        )
                      }
                    >
                      <SelectTrigger className="h-10 w-full bg-zinc-800 text-white text-sm border border-zinc-700">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Status: Active</SelectItem>
                        <SelectItem value="completed">
                          Status: Completed
                        </SelectItem>
                        <SelectItem value="all">Status: All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {projectSectionLayout === "list" ? (
                  <>
                    <AddSectionDivider
                      onClick={() => openAddSection(projectId, undefined, 0)}
                    />

                    {visibleProjectSections.map((section) => (
                      <div key={section.id} className="group/section">
                        <SectionView
                          section={section}
                          tasks={visibleProjectTasks}
                          allTasks={database.tasks}
                          database={database}
                          priorityColor={userPriorityColor}
                          currentUserId={currentUserId}
                          completedAccordionKey={`project-${projectId}`}
                          revealActionsOnHover={true}
                          dueDateLayout={dueDateLayout}
                          bulkSelectMode={bulkSelectMode}
                          selectedTaskIds={selectedTaskIds}
                          loadingTaskIds={loadingTaskIds}
                          animatingOutTaskIds={animatingOutTaskIds}
                          optimisticCompletedIds={optimisticCompletedIds}
                          sectionTasksBySectionId={sectionTasksBySectionId}
                          childSectionsByParentId={sectionChildrenByParent}
                          enableDueDateQuickEdit={true}
                          onTaskFocus={focusTaskRow}
                          onTaskUpdate={handleProjectTaskUpdate}
                          onTaskToggle={handleTaskToggle}
                          onTaskEdit={handleTaskEdit}
                          onTaskDelete={handleTaskDelete}
                          onTaskSelect={handleProjectTaskSelect}
                          onSectionEdit={handleSectionEdit}
                          onSectionDelete={handleSectionDelete}
                          onAddTask={(section) =>
                            openAddTask(section.projectId, section.id)
                          }
                          onAddSection={(parentId) =>
                            openAddSection(projectId, parentId)
                          }
                          onAddSectionAfter={(section) =>
                            openAddSection(
                              projectId,
                              undefined,
                              (section.order || 0) + 1,
                            )
                          }
                          onTaskDrop={handleTaskDropToSection}
                          onSectionReorder={handleSectionReorder}
                          userId={currentUserId || ""}
                        />
                      </div>
                    ))}

                    {visibleUnassignedTasks.length > 0 && (
                      <div className="mt-6">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-medium text-zinc-400">
                            Unassigned Tasks
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowAutoSectionConfirm(true)}
                            disabled={autoSectioning}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                            title="AI organize unassigned tasks"
                          >
                            <Bot
                              className={`h-4 w-4 ${autoSectioning ? "animate-pulse" : ""}`}
                            />
                          </button>
                        </div>
                        <TaskList
                          tasks={visibleUnassignedTasks}
                          allTasks={database.tasks}
                          projects={database.projects}
                          tags={database.tags}
                          currentUserId={currentUserId}
                          priorityColor={userPriorityColor}
                          showCompleted={
                            database.settings?.showCompletedTasks ?? true
                          }
                          completedAccordionKey={`project-${projectId}-unassigned`}
                          revealActionsOnHover={true}
                          dueDateLayout={dueDateLayout}
                          uniformDueBadgeWidth={dueDateLayout === "inline"}
                          bulkSelectMode={bulkSelectMode}
                          selectedTaskIds={selectedTaskIds}
                          loadingTaskIds={loadingTaskIds}
                          animatingOutTaskIds={animatingOutTaskIds}
                          optimisticCompletedIds={optimisticCompletedIds}
                          enableDueDateQuickEdit={true}
                          onTaskFocus={focusTaskRow}
                          onTaskUpdate={handleProjectTaskUpdate}
                          onTaskToggle={handleTaskToggle}
                          onTaskEdit={handleTaskEdit}
                          onTaskDelete={handleTaskDelete}
                          onTaskSelect={handleProjectTaskSelect}
                        />
                      </div>
                    )}

                    {visibleUnassignedTasks.length === 0 &&
                      visibleProjectSections.length === 0 && (
                        <div className="text-center py-8 text-zinc-500">
                          <p className="mb-4">
                            No matching tasks or sections for the current
                            filters.
                          </p>
                        </div>
                      )}
                  </>
                ) : (
                  <ProjectSectionBoard
                    sections={visibleProjectSections}
                    unassignedTasks={visibleUnassignedTasks}
                    visibleTasks={visibleProjectTasks}
                    database={database}
                    projectId={projectId}
                    currentUserId={currentUserId}
                    bulkSelectMode={bulkSelectMode}
                    selectedTaskIds={selectedTaskIds}
                    loadingTaskIds={loadingTaskIds}
                    animatingOutTaskIds={animatingOutTaskIds}
                    optimisticCompletedIds={optimisticCompletedIds}
                    sectionTasksBySectionId={sectionTasksBySectionId}
                    childSectionsByParentId={sectionChildrenByParent}
                    autoSectioning={autoSectioning}
                    onTaskFocus={focusTaskRow}
                    onTaskToggle={handleTaskToggle}
                    onTaskEdit={handleTaskEdit}
                    onTaskDelete={handleTaskDelete}
                    onTaskSelect={handleProjectTaskSelect}
                    onSectionEdit={handleSectionEdit}
                    onSectionDelete={handleSectionDelete}
                    onAddTask={(targetProjectId, sectionId) =>
                      openAddTask(targetProjectId, sectionId)
                    }
                    onAddSection={(parentId, order) =>
                      openAddSection(projectId, parentId, order)
                    }
                    onTaskDropToSection={handleTaskDropToSection}
                    onTaskDropToUnassigned={handleTaskDropToUnassigned}
                    onAutoOrganizeUnassigned={() =>
                      setShowAutoSectionConfirm(true)
                    }
                  />
                )}
              </>
            }
          />

          {showProjectNotesModal && (
            <ProjectNotesModal
              isOpen
              projectId={projectId}
              projectName={project?.name || "Project"}
              initialDescription={project?.description || ""}
              onClose={() => setShowProjectNotesModal(false)}
              onSaveDescription={async (description) => {
                await handleProjectUpdate(projectId, { description });
              }}
            />
          )}

          <ConfirmModal
            isOpen={showAutoSectionConfirm}
            onClose={() => setShowAutoSectionConfirm(false)}
            onConfirm={() => {
              void handleAutoOrganizeUnassignedTasks(projectId);
            }}
            title="AI Organizer"
            description="Would you like AI to automatically move Unassigned Tasks into Existing and New Sections?"
            confirmText="Yes"
            cancelText="No"
          />
        </div>
      );
    }

    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Not Found</h1>
        <p className="text-zinc-400">This view does not exist</p>
      </div>
    );
  };

  const handleCloseEmailThreadPopout = () => {
    if (typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }

    router.replace(`/${view}`);
  };

  if (isEmailThreadPopout && popoutThreadId) {
    return (
      <div className="min-h-screen app-shell-background">
        <EmailThreadModal
          open
          threadId={popoutThreadId}
          projects={database.projects}
          onRefresh={fetchData}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleCloseEmailThreadPopout();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen app-shell-background flex">
      <Sidebar
        data={database}
        onAddTask={() => openAddTask()}
        currentView={view}
        onViewChange={handleViewChange}
        onProjectUpdate={handleProjectUpdate}
        onProjectDelete={handleProjectDelete}
        onAddProject={handleOpenAddProject}
        onAddProjectGeneral={handleOpenAddProjectGeneral}
        onAddOrganization={() => setShowAddOrganization(true)}
        onOrganizationDelete={openDeleteConfirmation}
        onOrganizationEdit={handleOpenEditOrganization}
        onOrganizationArchive={handleOrganizationArchive}
        onProjectEdit={handleOpenEditProject}
        onProjectsReorder={handleProjectsReorder}
        onOrganizationsReorder={handleOrganizationsReorder}
        isAddingTask={showAddTask}
      />

      <main className="flex-1 min-w-0 text-white overflow-y-auto">
        <div
          className={
            view === "upcoming"
              ? "p-8"
              : view === "today"
                ? "p-0"
                : view.startsWith("email-")
                  ? "px-3 pr-6 py-6"
                  : view === "time"
                    ? "p-6"
                    : view.startsWith("project-") &&
                        projectSectionLayout === "board"
                      ? "p-6"
                      : "max-w-4xl mx-auto p-8"
          }
        >
          {renderContent()}
        </div>
      </main>

      {showShortcutHelp && (
        <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />
      )}

      {selectedTodayEmailId && (
        <EmailThreadModal
          open
          threadId={selectedTodayEmailId}
          projects={database.projects}
          onRefresh={fetchData}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setSelectedTodayEmailId(null);
            }
          }}
        />
      )}

      {showTodaySpamReview && (
        <EmailSpamReviewModal
          open
          onOpenChange={setShowTodaySpamReview}
          items={database.inboxItems}
          mailboxes={database.mailboxes}
          rules={database.emailRules}
          onRefresh={fetchData}
        />
      )}

      {undoCompletion && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`${undoExiting ? "animate-slide-down-out" : "animate-slide-up-in"}`}
          >
            <div className="flex items-center gap-3 bg-black text-white border border-zinc-800 rounded-lg px-4 py-3 shadow-lg">
              <span className="text-sm">
                Completed &quot;{undoCompletion.taskName}&quot;
              </span>
              <button
                onClick={handleUndoComplete}
                className="text-sm font-semibold text-white hover:text-zinc-200 underline underline-offset-4"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <AddTaskModal
          isOpen
          onClose={() => {
            setShowAddTask(false);
            setAddTaskDefaults({});
          }}
          data={database}
          onAddTask={handleAddTask}
          onDataRefresh={fetchData}
          defaultProjectId={
            addTaskDefaults.projectId ||
            (view.startsWith("project-")
              ? view.replace("project-", "")
              : undefined)
          }
          defaultSectionId={addTaskDefaults.sectionId}
        />
      )}

      {view.startsWith("project-") && projectViewData?.project && (
        <AiPlannerFloatingChat
          projectId={projectViewData.project.id}
          projectName={projectViewData.project.name}
          onCreated={fetchData}
        />
      )}

      {showEditTask && (
        <EditTaskModal
          isOpen
          onClose={() => {
            setShowEditTask(false);
            setEditingTask(null);
          }}
          task={editingTask}
          data={database}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
          onDataRefresh={fetchData}
          onTaskSelect={(task) => {
            setEditingTask(task);
          }}
        />
      )}

      {showBulkEditModal && (
        <BulkEditModal
          isOpen
          onClose={() => setShowBulkEditModal(false)}
          selectedTaskIds={selectedTaskIds}
          database={database}
          onApply={handleBulkUpdate}
          onDelete={handleBulkDelete}
          onMerge={handleBulkMerge}
          onCreateAndMerge={handleBulkCreateAndMerge}
          onInviteUser={handleInviteUser}
        />
      )}

      {showAddProject && selectedOrgForProject && (
        <AddProjectModal
          isOpen
          onClose={() => {
            setShowAddProject(false);
            setSelectedOrgForProject(null);
          }}
          organizationId={selectedOrgForProject}
          onAddProject={handleAddProject}
        />
      )}

      {showAddOrganization && (
        <AddOrganizationModal
          isOpen
          onClose={() => setShowAddOrganization(false)}
          onAddOrganization={handleAddOrganization}
        />
      )}

      {showEditOrganization && editingOrganization && database && (
        <OrganizationSettingsModal
          organization={editingOrganization}
          projects={database.projects.filter(
            (project) =>
              ((project as any).organization_id || project.organizationId) ===
              editingOrganization.id,
          )}
          allProjects={database.projects}
          users={database.users}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          canManageApiKeys={
            currentUserRole === "admin" || currentUserRole === "super_admin"
          }
          onClose={() => {
            setShowEditOrganization(false);
            setEditingOrganization(null);
          }}
          onSave={async (updates) => {
            await handleOrganizationUpdate(editingOrganization.id, updates);
            setShowEditOrganization(false);
            setEditingOrganization(null);
          }}
          onProjectAssociation={async (projectId, organizationIds) => {
            await handleProjectUpdate(projectId, {
              organizationId: organizationIds[0],
            });
          }}
          onUserInvite={async (email, organizationId, firstName, lastName) => {
            return await inviteUserToScope({
              email,
              firstName,
              lastName,
              organizationId,
            });
          }}
          onUserAdd={async (userId, organizationId) => {
            const organization = database.organizations.find(
              (candidate) => candidate.id === organizationId,
            );
            if (!organization) return;

            const memberIds = Array.from(
              new Set([...(organization.memberIds || []), userId]),
            );
            const response = await fetch(
              `/api/organizations/${organizationId}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ memberIds }),
              },
            );

            if (!response.ok) {
              const result = await response.json().catch(() => null);
              throw new Error(
                result?.error || "Failed to add user to organization.",
              );
            }

            await fetchData();
          }}
          onUserRemove={async (userId, organizationId) => {
            const organization = database.organizations.find(
              (candidate) => candidate.id === organizationId,
            );
            if (!organization) return;

            const memberIds = (organization.memberIds || []).filter(
              (memberId) => memberId !== userId,
            );
            const response = await fetch(
              `/api/organizations/${organizationId}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ memberIds }),
              },
            );

            if (!response.ok) {
              const result = await response.json().catch(() => null);
              throw new Error(
                result?.error || "Failed to remove user from organization.",
              );
            }

            await fetchData();
          }}
          onResendInvite={async (userId) => {
            return await resendInvite(userId);
          }}
          onCancelInvite={async (userId, organizationId) => {
            return await cancelInvite({ userId, organizationId });
          }}
        />
      )}

      {showEditProject && (
        <EditProjectModal
          isOpen
          onClose={() => {
            setShowEditProject(false);
            setEditingProject(null);
          }}
          project={editingProject}
          users={database?.users || []}
          organization={
            editingProject
              ? database?.organizations.find(
                  (candidate) =>
                    candidate.id ===
                    ((editingProject as any).organization_id ||
                      editingProject.organizationId),
                ) || null
              : null
          }
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onUpdate={(updates) => {
            if (editingProject) {
              handleProjectUpdate(editingProject.id, updates);
            }
          }}
          onUserInvite={async (email, projectId, firstName, lastName) => {
            const project = database?.projects.find(
              (candidate) => candidate.id === projectId,
            );
            if (!project) {
              throw new Error("Project not found for invite.");
            }

            return await inviteUserToScope({
              email,
              firstName,
              lastName,
              organizationId:
                (project as any).organization_id || project.organizationId,
              projectId: project.id,
            });
          }}
          onUserAdd={async (userId, projectId) => {
            const project = database?.projects.find(
              (candidate) => candidate.id === projectId,
            );
            if (!project) return;

            const memberIds = Array.from(
              new Set([...(project.memberIds || []), userId]),
            );
            await handleProjectUpdate(projectId, { memberIds });
          }}
          onUserRemove={async (userId, projectId) => {
            const project = database?.projects.find(
              (candidate) => candidate.id === projectId,
            );
            if (!project) return;

            const memberIds = (project.memberIds || []).filter(
              (memberId) => memberId !== userId,
            );
            await handleProjectUpdate(projectId, { memberIds });
          }}
          onResendInvite={async (userId) => {
            return await resendInvite(userId);
          }}
          onCancelInvite={async (userId, projectId) => {
            return await cancelInvite({ userId, projectId });
          }}
          onArchive={async (projectId) => {
            await handleProjectUpdate(projectId, { archived: true });
          }}
          onDelete={async (projectId) => {
            await handleProjectDelete(projectId);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() =>
          setConfirmDelete({ show: false, orgId: null, orgName: "" })
        }
        onConfirm={() => {
          if (confirmDelete.orgId) {
            handleOrganizationDelete(confirmDelete.orgId);
          }
        }}
        title="Delete Organization"
        description={`Are you sure you want to delete "${confirmDelete.orgName}"? This will permanently delete the organization and all its projects and tasks.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      <ConfirmModal
        isOpen={taskDeleteConfirm.show}
        onClose={() =>
          setTaskDeleteConfirm({ show: false, taskId: null, taskName: "" })
        }
        onConfirm={confirmTaskDelete}
        title="Delete Task"
        description={`Are you sure you want to delete "${taskDeleteConfirm.taskName}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      {view.startsWith("project-") && showAddSection && (
        <AddSectionModal
          isOpen
          onClose={() => {
            setShowAddSection(false);
            setSectionParentId(undefined);
            setSectionOrder(0);
          }}
          onSave={handleAddSection}
          projectId={view.replace("project-", "")}
          parentId={sectionParentId}
          order={sectionOrder}
        />
      )}

      <ConfirmModal
        isOpen={showRescheduleConfirm}
        onClose={() => setShowRescheduleConfirm(false)}
        onConfirm={async () => {
          // Find all overdue tasks
          const overdueTasks = database.tasks.filter((task) => {
            const dueDate = (task as any).due_date || task.dueDate;
            if (!dueDate || task.completed) return false;
            return isOverdue(dueDate);
          });

          // Update each overdue task to today's date
          const todayDate = getLocalDateString();
          const updatePromises = overdueTasks.map((task) =>
            fetch(`/api/tasks/${task.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                dueDate: todayDate,
              }),
            }),
          );

          try {
            await Promise.all(updatePromises);
            await fetchData(); // Refresh the data
            setShowRescheduleConfirm(false);
          } catch (error) {
            console.error("Error rescheduling tasks:", error);
          }
        }}
        title="Reschedule Overdue Tasks"
        description={`Are you sure you want to reschedule ${
          database.tasks.filter((task) => {
            const dueDate = (task as any).due_date || task.dueDate;
            if (!dueDate || task.completed) return false;
            return isOverdue(dueDate);
          }).length
        } overdue task(s) to today?`}
        confirmText="Reschedule All"
        cancelText="Cancel"
        variant="default"
      />

      {showTodoistSync && (
        <TodoistQuickSyncModal
          isOpen
          onClose={() => setShowTodoistSync(false)}
          onSync={handleTodoistSync}
          userId={user?.id}
        />
      )}
    </div>
  );
}
