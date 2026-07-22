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
  Share2,
  Bot,
  Target,
  FolderPlus,
  ListChecks,
  ListTodo,
  Link2,
  Link2Off,
  CalendarClock,
  RefreshCw,
  Mailbox,
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
  FolderKanban,
  LayoutGrid,
  Columns3,
  LayoutList,
  History,
  ChevronRight,
  Menu,
  Pencil,
  Calendar,
  CalendarPlus,
  CalendarCheck,
  Palette,
} from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTasksRealtime } from "@/hooks/use-tasks-realtime";
import { EstimatesView } from "@/components/estimates-view";
import { TimeTrackingView } from "@/components/time-tracking-view";
import { getBlockedTaskIds } from "@/lib/dependency-utils";
import { ConfirmModal } from "@/components/confirm-modal";
import { TaskList } from "@/components/task-list";
import { AiTaskRefinementModal } from "@/components/ai-task-refinement-modal";
import { KanbanView } from "@/components/kanban-view";
import { ColorPicker } from "@/components/color-picker";
import { ColorWheelPicker } from "@/components/color-wheel-picker";
import { formatDate } from "@/lib/format-date";
import {
  Database,
  Task,
  Project,
  Organization,
  Section,
  Goal,
} from "@/lib/types";
import { SectionView } from "@/components/section-view";
import { SupplyTotal } from "@/components/supply-total";
import { hasSupplies, type SupplyLike } from "@/lib/supply";
import { AddSectionModal } from "@/components/add-section-modal";
import { AddGoalModal, AddGoalPayload } from "@/components/add-goal-modal";
import { GoalGroupShell } from "@/components/goal-group";
import { GoalEdits } from "@/components/edit-goal-modal";
import { CreateMenuButton } from "@/components/create-menu-button";
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
import { HistoryTimelineScrubber } from "@/components/history-timeline-scrubber";
import { ProjectAiExportControls } from "@/components/project-ai-export-controls";
import { ProjectSectionBoard } from "@/components/project-section-board";
import {
  ProjectWorkTabs,
  type ProjectWorkTab,
} from "@/components/project-work-tabs";
import {
  SkeletonTaskList,
  SkeletonSectionedTasks,
} from "@/components/skeleton-loader";
import { Skeleton } from "@/components/ui/skeleton";
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
import { diffFreshTaskIds, diffFreshInboxItemIds } from "@/lib/fresh-data-diff";
import { DailyPlanCard } from "@/components/daily-plan-card";
import type { DominoTaskSummary } from "@/lib/daily-plan/types";

// How often the app asks the server to pull new mail (POST /sync-due). The
// server enforces its own per-mailbox poll floor, so these only bound how
// quickly a *server-side* change is surfaced to this client. We poll faster
// when the tab is visible (user is actively waiting on mail) and back off when
// hidden to avoid needless round-trips and provider pressure.
const EMAIL_BACKGROUND_SYNC_INTERVAL_VISIBLE_MS = 15 * 1000;
const EMAIL_BACKGROUND_SYNC_INTERVAL_HIDDEN_MS = 60 * 1000;
const DATABASE_CORE_CACHE_VERSION = 1;
const DATABASE_CORE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const PROJECT_SECTION_LAYOUT_STORAGE_KEY = "focus-forge:project-section-layout";

const getDatabaseCoreCacheKey = (userId?: string | null) =>
  `focus-forge:database-core:v${DATABASE_CORE_CACHE_VERSION}:${userId || "anonymous"}`;

// Whether the project view should hydrate its header (name + color) from the
// sessionStorage core snapshot on mount / view change. Scoped to project views
// so a repeat visit paints the real title + color at 0ms instead of a skeleton
// while the server data (loadDatabaseForUser) is still gating. This does NOT
// affect the fetch — inbox items are always included below so the sidebar
// Email badges never go to 0.
const shouldHydrateProjectHeaderFromCache = (view: string) =>
  view.startsWith("project-");

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

const BulkEditModal = dynamic(
  () => import("@/components/bulk-edit-modal").then((mod) => mod.BulkEditModal),
  { ssr: false },
);
const TaskModalStack = dynamic(
  () => import("@/components/task-modal-stack").then((mod) => mod.TaskModalStack),
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
const ProjectShareModal = dynamic(
  () =>
    import("@/components/project-share-modal").then(
      (mod) => mod.ProjectShareModal,
    ),
  { ssr: false },
);
const EmailInboxView = dynamic(
  () =>
    import("@/components/email-inbox-view").then((mod) => mod.EmailInboxView),
  { ssr: false },
);
const EmailDraftsView = dynamic(
  () =>
    import("@/components/email-drafts-view").then((mod) => mod.EmailDraftsView),
  { ssr: false },
);
const EmailStarredView = dynamic(
  () =>
    import("@/components/email-starred-view").then(
      (mod) => mod.EmailStarredView,
    ),
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

/**
 * Overlay an optimistic edit patch onto a task, normalizing the camelCase /
 * snake_case pairs the quick-edit shortcuts touch (due date/time, project,
 * section, assignee). Used both when applying the optimistic update and when
 * re-applying still-pending edits over a fresh fetchData payload so a
 * concurrent refetch cannot revert them.
 */
const overlayTaskPatch = (task: any, updates: Record<string, unknown>) => {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(updates, k);
  const pick = (camel: string, snake: string, current: any) =>
    has(camel) || has(snake)
      ? ((updates as any)[camel] ?? (updates as any)[snake] ?? null)
      : current;

  const dueDate = pick(
    "dueDate",
    "due_date",
    task.due_date ?? task.dueDate ?? null,
  );
  const dueTime = pick(
    "dueTime",
    "due_time",
    task.due_time ?? task.dueTime ?? null,
  );
  const projectId = pick(
    "projectId",
    "project_id",
    task.project_id ?? task.projectId ?? null,
  );
  const sectionId = pick(
    "sectionId",
    "section_id",
    task.section_id ?? task.sectionId ?? null,
  );
  const assignedTo = pick(
    "assignedTo",
    "assigned_to",
    task.assigned_to ?? task.assignedTo ?? null,
  );

  return {
    ...task,
    ...updates,
    dueDate: dueDate ?? undefined,
    due_date: dueDate,
    dueTime: dueTime ?? undefined,
    due_time: dueTime,
    projectId: projectId ?? undefined,
    project_id: projectId,
    sectionId: sectionId ?? undefined,
    section_id: sectionId,
    assignedTo: assignedTo ?? undefined,
    assigned_to: assignedTo,
  };
};

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
          className="z-50 w-[260px] max-w-[min(var(--radix-popper-available-width,100vw),calc(100vw-1rem))] rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
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
              <div className="mb-2 text-xs sm:text-[11px] font-medium uppercase tracking-wide text-zinc-500">
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

export default function ViewPage({
  initialData = null,
  chromeOnly = false,
}: {
  // Server-streamed initial database payload (RSC). When present, seeds
  // `databaseState` so the first client paint shows real data and the first
  // client fetch is skipped (the background refresh still runs).
  initialData?: Database | null;
  // When true (used by loading.tsx), render only the instant chrome + skeletons
  // with no data fetching. Guarantees the loading fallback is pixel-identical
  // to the real first paint without duplicating the Sidebar markup.
  chromeOnly?: boolean;
} = {}) {
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

  // Seed from server-streamed initial data when present. Run the payload
  // through the same merge path the client fetch uses so the shape matches
  // exactly (timeBlocks, etc.). The first client fetch is then skipped.
  const [databaseState, setDatabase] = useState<Database | null>(() =>
    initialData ? mergeDatabasePayload(null, initialData as any, {}) : null,
  );
  // When seeded from the server, skip the very first client fetch.
  const skipInitialFetchRef = useRef<boolean>(initialData != null);

  // Stable empty database used to render real chrome instantly while the real
  // data is still loading. Identity is stable across renders so memoized
  // derivations and effects don't churn while `databaseState` is null.
  const emptyDatabaseRef = useRef<Database | null>(null);
  if (emptyDatabaseRef.current === null) {
    emptyDatabaseRef.current = createEmptyDatabase();
  }
  // `database` is ALWAYS non-null in the render body so every view's static
  // chrome (sidebar, headers, search, buttons, tabs) renders immediately.
  // `isDataLoading` is true only on the true first load (no cached data yet)
  // and drives the granular, data-region-only skeletons.
  const database = databaseState ?? emptyDatabaseRef.current;
  const isDataLoading = databaseState === null;
  // Mirror of databaseState readable synchronously inside fetchData without
  // adding it to the callback's dependency array.
  const databaseStateRef = useRef<Database | null>(null);
  databaseStateRef.current = databaseState;

  // On a repeat visit the real project data streams in ~5s late (server
  // `loadDatabaseForUser` gate), so the header title/color would otherwise
  // flash a skeleton. Read the sessionStorage core snapshot synchronously so
  // the project header paints its real name + color at 0ms. Scoped to the
  // project view only — we deliberately DON'T seed the whole `database` from
  // cache (that snapshot strips inbox items and would zero the sidebar badges).
  const [cachedProjectHeader, setCachedProjectHeader] = useState<{
    id: string;
    name: string;
    color?: string;
  } | null>(() => {
    if (typeof window === "undefined" || !view.startsWith("project-")) {
      return null;
    }
    const cachedProjectId = view.replace("project-", "");
    const cached = readCachedDatabaseCore(user?.id);
    const cachedProject = cached?.projects.find(
      (project) => project.id === cachedProjectId,
    );
    return cachedProject
      ? {
          id: cachedProject.id,
          name: cachedProject.name,
          color: cachedProject.color,
        }
      : null;
  });
  // Synchronous mirror of recentlySavedTaskIds so the background-refresh diff
  // can exclude self-edited rows without depending on render state.
  const recentlySavedTaskIdsRef = useRef<Set<string>>(new Set());
  // Optimistic task edits (clear date, change project, reassign, …) that have
  // not yet been confirmed by their own post-save refetch. A concurrent
  // background/realtime fetchData that started before the edit can otherwise
  // resolve afterwards and resurrect the old value, causing a flicker
  // (disappear → reappear → disappear). We overlay these patches on every
  // fetchData result until the edit's own refetch clears the entry.
  const pendingTaskMutationsRef = useRef<Map<string, Record<string, unknown>>>(
    new Map(),
  );
  const [showTodoistSync, setShowTodoistSync] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDefaults, setAddTaskDefaults] = useState<{
    projectId?: string;
    sectionId?: string;
    goalId?: string;
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
  const [colorPickerProjectId, setColorPickerProjectId] = useState<
    string | null
  >(null);
  const [orgColorGradientMode, setOrgColorGradientMode] = useState<
    Record<string, boolean>
  >({});
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
  // Inline edit state for the project Goal shown under the title.
  const [isEditingProjectGoal, setIsEditingProjectGoal] = useState(false);
  const [projectGoalDraft, setProjectGoalDraft] = useState("");
  const [sortBy, setSortBy] = useState<"dueDate" | "deadline" | "priority">(
    "dueDate",
  );
  // Assignee filter is URL-backed so a filtered view is bookmarkable. The
  // default ("me-unassigned") is left out of the query string.
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>(
    () => searchParams.get("assignee") || "me-unassigned",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<
    "all" | "tasks" | "projects" | "organizations"
  >("all");
  const [showBlockedTasks, setShowBlockedTasks] = useState(false);
  const [groupTasksByProject, setGroupTasksByProject] = useState(false);
  const [showTaskDescriptions, setShowTaskDescriptions] = useState(false);
  const [todayViewMode, setTodayViewMode] = useState<"list" | "kanban">("list");
  const [deletingTaskIds, setDeletingTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [emailTaskLinks, setEmailTaskLinks] = useState<Record<string, string>>(
    {},
  );
  const [aiCreatedTasks, setAiCreatedTasks] = useState<
    Record<
      string,
      { threadId: string; generatedBy: string; rationale: string | null }
    >
  >({});
  const [emailPublicByTaskId, setEmailPublicByTaskId] = useState<
    Record<string, boolean>
  >({});
  const [emailSenderByTaskId, setEmailSenderByTaskId] = useState<
    Record<string, string>
  >({});
  const [aiRationaleModal, setAiRationaleModal] = useState<{
    taskId: string;
    taskName: string;
    threadId: string;
    rationale: string | null;
  } | null>(null);
  const [taskEmailThreadId, setTaskEmailThreadId] = useState<string | null>(
    null,
  );
  // Per-task domino summaries + rationales surfaced by the daily plan, used to
  // render domino badges on Today / Next Up task rows.
  const [dominoByTaskId, setDominoByTaskId] = useState<
    Record<string, DominoTaskSummary>
  >({});
  const [dominoRationaleByTaskId, setDominoRationaleByTaskId] = useState<
    Record<string, string>
  >({});
  // Stable identity: DailyPlanCard's effect depends on this callback, so an
  // inline function here would re-fire the effect every render → setState →
  // re-render → infinite loop (React #185). useCallback breaks that cycle.
  const handlePlanLoaded = useCallback(
    (maps: {
      dominoByTaskId: Record<string, DominoTaskSummary>;
      dominoRationaleByTaskId: Record<string, string>;
    }) => {
      setDominoByTaskId(maps.dominoByTaskId);
      setDominoRationaleByTaskId(maps.dominoRationaleByTaskId);
    },
    [],
  );
  const [todaySections, setTodaySections] = useState({
    email: true,
    overdue: true,
    today: true,
    tomorrow: true,
    restOfWeek: true,
  });
  const [showTodaySpamReview, setShowTodaySpamReview] = useState(false);
  // Email Work sort/filter controls and the mailbox-sync modal now live solely
  // on the /email-inbox full view; the Today view no longer renders raw emails.
  const [showAddSection, setShowAddSection] = useState(false);
  // Sections whose save is still in flight — they breathe until it settles.
  const [savingSectionIds, setSavingSectionIds] = useState<Set<string>>(
    new Set(),
  );
  const [sectionParentId, setSectionParentId] = useState<string | undefined>(
    undefined,
  );
  const [sectionOrder, setSectionOrder] = useState(0);
  // The add-section modal is reachable outside project views (e.g. from a goal
  // in a Goals view), so it carries its own target instead of parsing `view`.
  const [sectionProjectId, setSectionProjectId] = useState<string | undefined>(
    undefined,
  );
  const [sectionGoalId, setSectionGoalId] = useState<string | undefined>(
    undefined,
  );
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [addGoalSectionId, setAddGoalSectionId] = useState<string | undefined>(
    undefined,
  );
  const [addGoalProjectId, setAddGoalProjectId] = useState<string>("");
  const [addGoalOrder, setAddGoalOrder] = useState(0);
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
  const [showProjectHistory, setShowProjectHistory] = useState(false);
  const [projectFiltersExpanded, setProjectFiltersExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProjectFiltersExpanded(
      window.localStorage.getItem("projectFiltersExpanded") === "true",
    );
  }, []);

  const toggleProjectFiltersExpanded = useCallback(() => {
    setProjectFiltersExpanded((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("projectFiltersExpanded", String(next));
      }
      return next;
    });
  }, []);
  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(
    null,
  );
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  // Mobile navigation drawer: on mobile viewports the sidebar is hidden by
  // default and slides in as an overlay when the hamburger is tapped. On
  // desktop this state is ignored (the sidebar is always rendered inline).
  const isMobile = useIsMobile();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Close the drawer whenever we drop back to mobile width fresh, and any time
  // the viewport grows to desktop (so it can't get "stuck" open behind the
  // inline sidebar).
  useEffect(() => {
    if (!isMobile) {
      setIsMobileNavOpen(false);
    }
  }, [isMobile]);
  const [loadingTaskIds, setLoadingTaskIds] = useState<Set<string>>(new Set());
  const [animatingOutTaskIds, setAnimatingOutTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [undoCompletion, setUndoCompletion] = useState<{
    taskId: string;
    taskName: string;
    affectedIds: string[];
  } | null>(null);
  const [undoDelete, setUndoDelete] = useState<{
    batchId: string;
    taskName: string;
  } | null>(null);
  const [undoExiting, setUndoExiting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticCompletedIds, setOptimisticCompletedIds] = useState<
    Set<string>
  >(new Set());
  // Background task-save indicators: spinner while the PUT is in flight, then a
  // green checkmark that fades out for ~3s after a successful save.
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [recentlySavedTaskIds, setRecentlySavedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  // Phase 2 background-refresh UX. `isRefreshing` is true only while a
  // background refetch runs with data already present (drives the inline
  // header spinners). `freshlyUpdated*Ids` hold ids that a background refetch
  // added/changed so their rows briefly flash green; cleared after the fade.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [freshlyUpdatedTaskIds, setFreshlyUpdatedTaskIds] = useState<
    Set<string>
  >(new Set());
  const [freshlyUpdatedInboxIds, setFreshlyUpdatedInboxIds] = useState<
    Set<string>
  >(new Set());
  const freshHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [taskDeleteConfirm, setTaskDeleteConfirm] = useState<{
    show: boolean;
    taskId: string | null;
    taskName: string;
    emailThreadId: string | null;
    emailAction: "none" | "archive" | "delete";
  }>({
    show: false,
    taskId: null,
    taskName: "",
    emailThreadId: null,
    emailAction: "none",
  });
  // Pending section delete. `taskIds` are the live tasks currently filed under
  // the section; `taskAction` is the user's choice for what happens to them.
  const [sectionDeleteConfirm, setSectionDeleteConfirm] = useState<{
    show: boolean;
    sectionId: string | null;
    sectionName: string;
    taskIds: string[];
    taskAction: "unassign" | "delete";
  }>({
    show: false,
    sectionId: null,
    sectionName: "",
    taskIds: [],
    taskAction: "unassign",
  });
  const [showProjectNotesModal, setShowProjectNotesModal] = useState(false);
  const [showProjectShareModal, setShowProjectShareModal] = useState(false);
  const [showAutoSectionConfirm, setShowAutoSectionConfirm] = useState(false);
  const [autoSectioning, setAutoSectioning] = useState(false);
  const [selectedTodayEmailId, setSelectedTodayEmailId] = useState<
    string | null
  >(null);
  const [projectWorkTab, setProjectWorkTab] = useState<ProjectWorkTab>("tasks");
  const focusedTaskIdRef = useRef<string | null>(null);
  const focusedTaskRowRef = useRef<HTMLElement | null>(null);
  // The main content area is the scroll container for the Today/list views.
  // Deleting a task triggers a full fetchData() that rebuilds the list; the
  // removed row collapses the content height and the container would otherwise
  // re-anchor (jump). We capture scrollTop before the delete and restore it
  // across the resulting DOM commits to keep the view visually stable.
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const restoreMainScrollTop = useCallback((target: number) => {
    const container = mainScrollRef.current;
    if (!container) return;
    // Restore immediately and again on the next two frames: the list rebuild
    // (and any layout/skeleton transitions) commits across a couple of frames,
    // so a single set can be clobbered by a later reflow.
    const apply = () => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = target;
      }
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }, []);
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
    recentlySavedTaskIdsRef.current = recentlySavedTaskIds;
  }, [recentlySavedTaskIds]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoHideTimerRef.current) clearTimeout(undoHideTimerRef.current);
      if (freshHighlightTimerRef.current)
        clearTimeout(freshHighlightTimerRef.current);
    };
  }, []);

  const fetchData = useCallback(
    async (options?: {
      includeEmailData?: boolean;
      includeInboxItems?: boolean;
    }) => {
      const controller = new AbortController();
      // Core load must finish sooner; email pass can take longer.
      const abortMs =
        options?.includeEmailData === false &&
        options?.includeInboxItems === false
          ? 12_000
          : 20_000;
      const timeoutId = window.setTimeout(() => controller.abort(), abortMs);
      // Show the inline header refresh spinners only when we already have data
      // on screen (i.e. this is a background refresh, not the first load).
      const isBackgroundRefresh = databaseStateRef.current !== null;
      if (isBackgroundRefresh) {
        setIsRefreshing(true);
      }
      // Always include inbox items on the initial fetch: the sidebar Email
      // badges render on every view and read from data.inboxItems, so omitting
      // them would zero the badges wherever the user lands or refreshes.
      const includeInboxItems = options?.includeInboxItems ?? true;
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

          setDatabase((previous) => {
            const mergedRaw = mergeDatabasePayload(previous, data, {
              preserveInboxItems: !includeInboxItems,
              preserveEmailData: !includeEmailData,
            });

            // Re-apply any still-pending optimistic task edits so a refetch
            // that started before the edit can't resurrect the old value.
            const pending = pendingTaskMutationsRef.current;
            const merged =
              pending.size > 0
                ? {
                    ...mergedRaw,
                    tasks: mergedRaw.tasks.map((task: any) =>
                      pending.has(task.id)
                        ? overlayTaskPatch(task, pending.get(task.id)!)
                        : task,
                    ),
                  }
                : mergedRaw;

            // Diff only on a background refresh (previous data present). The
            // diff is cheap (id → updatedAt maps) and returns empty on first
            // load, so first paint never lights up every row.
            if (previous) {
              const freshTasks = diffFreshTaskIds(previous, merged);
              const freshInbox = includeInboxItems
                ? diffFreshInboxItemIds(previous, merged)
                : new Set<string>();

              if (freshTasks.size > 0 || freshInbox.size > 0) {
                setFreshlyUpdatedTaskIds((prev) => {
                  // Don't double-highlight rows the user just saved themselves.
                  const next = new Set(prev);
                  freshTasks.forEach((id) => {
                    if (!recentlySavedTaskIdsRef.current.has(id)) next.add(id);
                  });
                  return next;
                });
                setFreshlyUpdatedInboxIds((prev) => {
                  const next = new Set(prev);
                  freshInbox.forEach((id) => next.add(id));
                  return next;
                });

                if (freshHighlightTimerRef.current) {
                  clearTimeout(freshHighlightTimerRef.current);
                }
                freshHighlightTimerRef.current = setTimeout(() => {
                  setFreshlyUpdatedTaskIds(new Set());
                  setFreshlyUpdatedInboxIds(new Set());
                }, 2600);
              }
            }

            return merged;
          });

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
        if (isBackgroundRefresh) {
          setIsRefreshing(false);
        }
      }
    },
    [router, user?.id, view],
  );

  useEffect(() => {
    // loading.tsx renders this component purely for its chrome; never fetch.
    if (chromeOnly) return;

    // Skip exactly one initial fetch when the very first render was seeded with
    // server-streamed initial data (it is as fresh as a fetch would be). Any
    // subsequent view change / dep change still triggers the normal fetch.
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }

    // Repeat-visit fast paint: hydrate the project header (name + color) from
    // the core snapshot so it's correct immediately, without seeding the whole
    // `database` from cache (that snapshot strips inbox items and would zero
    // the sidebar badges until the fetch below completes).
    if (shouldHydrateProjectHeaderFromCache(view)) {
      const cachedProjectId = view.replace("project-", "");
      const cachedDatabase = readCachedDatabaseCore(user?.id);
      const cachedProject = cachedDatabase?.projects.find(
        (project) => project.id === cachedProjectId,
      );
      setCachedProjectHeader(
        cachedProject
          ? {
              id: cachedProject.id,
              name: cachedProject.name,
              color: cachedProject.color,
            }
          : null,
      );
    } else {
      setCachedProjectHeader(null);
    }

    // Core data first (no email) so the shell leaves skeletons quickly even when
    // the email/inbox path is slow or hung. Email loads in a follow-up fetch.
    void (async () => {
      await fetchData({ includeEmailData: false, includeInboxItems: false });
      if (!chromeOnly) {
        void fetchData({ includeEmailData: true, includeInboxItems: true });
      }
    })();
  }, [fetchData, user?.id, view, chromeOnly]);

  // Refresh the in-memory database whenever something changes the data outside
  // the normal render flow — the AI assistant (focusforge:data-changed) and the
  // voice task button (voice-tasks:*). Keeps the visible list in sync without a
  // manual page refresh.
  useEffect(() => {
    const refresh = () => {
      void fetchData();
    };
    window.addEventListener("focusforge:data-changed", refresh);
    window.addEventListener("voice-tasks:created", refresh);
    window.addEventListener("voice-tasks:reverted", refresh);
    return () => {
      window.removeEventListener("focusforge:data-changed", refresh);
      window.removeEventListener("voice-tasks:created", refresh);
      window.removeEventListener("voice-tasks:reverted", refresh);
    };
  }, [fetchData]);

  // Realtime: tasks arrive via DB push (INSERT/UPDATE/DELETE on public.tasks for
  // accessible projects) instead of refetch-on-render. Additive to the load-once
  // initial fetch above — the scoped channel only refetches when a row actually
  // changes. project ids are derived from the already-loaded projects.
  const realtimeProjectIds = database.projects.map((project) => project.id);
  useTasksRealtime({
    userId: user?.id,
    enabled: !chromeOnly && !isEmailThreadPopout,
    projectIds: realtimeProjectIds,
    onChange: () => {
      void fetchData();
    },
  });

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

    let interval: number | undefined;

    const scheduleInterval = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      const hidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";
      const delay = hidden
        ? EMAIL_BACKGROUND_SYNC_INTERVAL_HIDDEN_MS
        : EMAIL_BACKGROUND_SYNC_INTERVAL_VISIBLE_MS;
      interval = window.setInterval(() => {
        void runBackgroundEmailSync();
      }, delay);
    };

    const handleVisibilityChange = () => {
      // Re-pace the timer, and sync immediately on becoming visible so mail
      // that arrived while the tab was hidden shows up without waiting a tick.
      if (document.visibilityState === "visible") {
        void runBackgroundEmailSync();
      }
      scheduleInterval();
    };

    scheduleInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData, isEmailThreadPopout, user, view]);

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/email/task-links", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.links) setEmailTaskLinks(payload.links);
        if (payload?.aiCreated) setAiCreatedTasks(payload.aiCreated);
        if (payload?.publicByTaskId)
          setEmailPublicByTaskId(payload.publicByTaskId);
        if (payload?.senderByTaskId)
          setEmailSenderByTaskId(payload.senderByTaskId);
      })
      .catch(() => undefined);
  }, [user?.id, view]);

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
            pendingSubtasks.map((entry: any) => {
              const sub =
                typeof entry === "string" ? { name: entry } : entry || {};
              const estimateRaw = sub.timeEstimate;
              const timeEstimate =
                estimateRaw !== undefined &&
                estimateRaw !== null &&
                estimateRaw !== ""
                  ? parseInt(String(estimateRaw), 10)
                  : undefined;
              return fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  name: sub.name,
                  completed: false,
                  priority: 4,
                  projectId: taskPayload.projectId,
                  parentId: createdTask.id,
                  tags: [],
                  files: [],
                  reminders: [],
                  assignedTo: taskPayload.assignedTo,
                  ...(timeEstimate !== undefined ? { timeEstimate } : {}),
                  ...(sub.dueDate ? { dueDate: sub.dueDate } : {}),
                  // Supplies on a pending subtask: only sent when the row was
                  // actually flagged, so ordinary subtasks keep the column
                  // defaults rather than writing explicit nulls.
                  ...(sub.isSupply
                    ? {
                        isSupply: true,
                        supplyQuantity:
                          sub.supplyQuantity !== undefined &&
                          sub.supplyQuantity !== ""
                            ? Number(sub.supplyQuantity)
                            : null,
                        supplyPrice:
                          sub.supplyPrice !== undefined && sub.supplyPrice !== ""
                            ? Number(sub.supplyPrice)
                            : null,
                        supplyVendor: sub.supplyVendor || null,
                        supplyMake: sub.supplyMake || null,
                        supplyModel: sub.supplyModel || null,
                        supplyType: sub.supplyType || null,
                      }
                    : {}),
                }),
              });
            }),
          );
        }

        await fetchData();
        // Returned so callers that need the saved row can act on it — the
        // subtask drill-down saves the parent first, then opens the record it
        // just created.
        return createdTask as Task;
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
        return null;
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
      return null;
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
            // Only spawn a next occurrence for a recognized recurrence. An
            // unparseable free-text pattern parses to `custom`, for which we
            // can't compute a real next date — spawning would clone the task
            // +1 day on every completion (e.g. "Prepare for Mothers Day"
            // reappearing daily), so skip it.
            if (config && config.frequency !== "custom") {
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

  // Open the unified task edit modal given only a task id (e.g. from the
  // EmailThreadModal "Linked Tasks" Edit button). Looks the task up from the
  // current database snapshot and reuses the standard edit flow.
  const handleEditTaskById = (taskId: string) => {
    const task = database?.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    handleTaskEdit(task);
  };

  const handleTaskSave = (taskData: Partial<Task>) => {
    // Capture the id of the task being edited NOW (synchronously). The modal
    // closes itself immediately on submit and `editingTask` may be reassigned
    // (e.g. the user opens a different task), so we must not rely on it after
    // any await. This is what keeps task A's save from closing task B's modal:
    // the save is keyed entirely on the captured id and never touches modal
    // state.
    const savedTask = editingTask;
    if (!savedTask) return;
    const savedTaskId = savedTask.id;

    // Optimistically apply the edited fields to the row so the UI doesn't snap
    // back while the request is in flight.
    setDatabase((prev) => {
      if (!prev) return prev;
      const taskDataAny = taskData as any;
      // The modal payload only carries camelCase keys (e.g. `assignedTo`), but
      // the project grouping/filter helpers read snake_case first
      // (`getTaskAssignedTo` prefers `assigned_to`). If we only spread the
      // camelCase value, the stale snake_case value wins and the task is
      // mis-classified (e.g. stays under "Unassigned"/hidden by the "me"
      // filter) until the next full fetch. Keep both casings in sync here, and
      // refresh the assignee badge fields so the row updates instantly.
      const hasAssignedTo = Object.prototype.hasOwnProperty.call(
        taskDataAny,
        "assignedTo",
      );
      const nextAssignedTo = hasAssignedTo
        ? (taskDataAny.assignedTo ?? null)
        : null;
      const assignedUser = hasAssignedTo
        ? prev.users?.find((u) => u.id === nextAssignedTo)
        : undefined;

      return {
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === savedTaskId
            ? {
                ...task,
                ...taskData,
                ...(hasAssignedTo
                  ? {
                      assigned_to: nextAssignedTo,
                      assignedTo: nextAssignedTo ?? undefined,
                      assignedToName: assignedUser
                        ? assignedUser.name ||
                          `${assignedUser.firstName || ""} ${assignedUser.lastName || ""}`.trim() ||
                          assignedUser.email ||
                          null
                        : null,
                      assignedToColor: assignedUser?.profileColor ?? null,
                      assignedToMemoji: assignedUser?.profileMemoji ?? null,
                    }
                  : {}),
              }
            : task,
        ) as typeof prev.tasks,
      };
    });

    // Show the spinner next to the title and clear any lingering "saved" check.
    setSavingTaskIds((prev) => new Set(prev).add(savedTaskId));
    setRecentlySavedTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(savedTaskId);
      return next;
    });

    // Run the save in the background; never block the modal close on it.
    void (async () => {
      try {
        const response = await fetch(`/api/tasks/${savedTaskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(taskData),
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        await fetchData();

        // Success: swap spinner for the fading green checkmark, then drop it
        // after the 3s CSS fade completes.
        setSavingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(savedTaskId);
          return next;
        });
        setRecentlySavedTaskIds((prev) => new Set(prev).add(savedTaskId));
        setTimeout(() => {
          setRecentlySavedTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(savedTaskId);
            return next;
          });
        }, 3000);
      } catch (error) {
        console.error("Error updating task:", error);
        // Failure: clear the spinner, surface a toast, and refresh so the row
        // reverts to the persisted state rather than silently dropping the edit.
        setSavingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(savedTaskId);
          return next;
        });
        showError(
          `Failed to save "${savedTask.name || "task"}". Your changes were not saved.`,
        );
        void fetchData();
      }
    })();
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
      emailThreadId: emailTaskLinks[taskId] || null,
      emailAction: "none",
    });
  };

  const confirmTaskDelete = async () => {
    if (!taskDeleteConfirm.taskId) return;
    const deletedName = taskDeleteConfirm.taskName;
    const deletingId = taskDeleteConfirm.taskId;
    const emailThreadId = taskDeleteConfirm.emailThreadId;
    const emailAction = taskDeleteConfirm.emailAction;
    // Capture the scroll container position before the delete so the list
    // rebuild from fetchData() doesn't re-anchor / jump the view.
    const savedScrollTop = mainScrollRef.current?.scrollTop ?? 0;

    // Remove the task and its descendants from view immediately. The snapshot
    // is kept so a failed delete can put them back exactly as they were —
    // the row should only reappear if the delete actually failed.
    const descendantIds = new Set<string>([deletingId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of database?.tasks || []) {
        const parentId = (candidate as any).parent_id ?? candidate.parentId;
        if (
          parentId &&
          descendantIds.has(parentId) &&
          !descendantIds.has(candidate.id)
        ) {
          descendantIds.add(candidate.id);
          grew = true;
        }
      }
    }
    const removedTasks = (database?.tasks || []).filter((t) =>
      descendantIds.has(t.id),
    );
    const removedTaskSections = (database?.taskSections || []).filter((ts) =>
      descendantIds.has(ts.taskId),
    );
    setDatabase((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.filter((t) => !descendantIds.has(t.id)),
            taskSections: prev.taskSections.filter(
              (ts) => !descendantIds.has(ts.taskId),
            ),
          }
        : prev,
    );

    const restoreDeletedTasks = () => {
      setDatabase((prev) => {
        if (!prev) return prev;
        const presentIds = new Set(prev.tasks.map((t) => t.id));
        return {
          ...prev,
          tasks: [
            ...prev.tasks,
            ...removedTasks.filter((t) => !presentIds.has(t.id)),
          ],
          taskSections: [...prev.taskSections, ...removedTaskSections],
        };
      });
    };

    setDeletingTaskIds((prev) => new Set(prev).add(deletingId));
    try {
      const response = await fetch(`/api/tasks/${taskDeleteConfirm.taskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.batchId) {
          setUndoDelete({ batchId: payload.batchId, taskName: deletedName });
          setTimeout(() => {
            setUndoDelete((current) =>
              current?.batchId === payload.batchId ? null : current,
            );
          }, 15000);
        }
        // Optionally act on the source email the task was created from.
        if (
          emailThreadId &&
          (emailAction === "archive" || emailAction === "delete")
        ) {
          try {
            await fetch(`/api/email/threads/${emailThreadId}/actions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ action: emailAction }),
            });
          } catch (emailError) {
            console.error("Failed to act on linked email:", emailError);
          }
        }
        await fetchData();
        restoreMainScrollTop(savedScrollTop);
        showSuccess(`Deleted "${deletedName}"`);
      } else {
        restoreDeletedTasks();
        const detail = await response.text().catch(() => "");
        console.error("Error deleting task:", detail);
        showError(
          `Could not delete "${deletedName}"`,
          "It has been put back. Please try again.",
        );
      }
    } catch (error) {
      restoreDeletedTasks();
      console.error("Error deleting task:", error);
      showError(
        `Could not delete "${deletedName}"`,
        "It has been put back. Please try again.",
      );
    } finally {
      setDeletingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingId);
        return next;
      });
    }
  };

  const handleUndoDelete = async () => {
    if (!undoDelete) return;
    const { batchId } = undoDelete;
    setUndoDelete(null);
    try {
      const response = await fetch("/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batchId }),
      });
      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error restoring task:", error);
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

  // Brand gradient string used for project dots when an org is in
  // "brand gradient" color mode, and by the animated color wheel picker.
  const brandGradient =
    resolvedCurrentUser?.profileColor &&
    resolvedCurrentUser.profileColor.includes("gradient")
      ? resolvedCurrentUser.profileColor
      : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

  const toggleOrgColorMode = (orgId: string) => {
    setOrgColorGradientMode((prev) => {
      const next = { ...prev, [orgId]: !prev[orgId] };
      try {
        localStorage.setItem(
          `focus-forge-org-color-mode:${orgId}`,
          next[orgId] ? "gradient" : "manual",
        );
      } catch {}
      return next;
    });
  };

  // Hydrate the current org's color mode from localStorage when the view
  // switches to an org page (mirrors the theme-preference localStorage pattern).
  useEffect(() => {
    if (!view.startsWith("org-")) return;
    const orgId = view.replace("org-", "");
    try {
      const stored = localStorage.getItem(
        `focus-forge-org-color-mode:${orgId}`,
      );
      setOrgColorGradientMode((prev) => ({
        ...prev,
        [orgId]: stored === "gradient",
      }));
    } catch {}
  }, [view]);

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
    setSectionProjectId(section.projectId);
    setSectionParentId(section.parentId);
    setSectionGoalId(section.goalId);
    setSectionOrder(section.order || 0);
    setShowAddSection(true);
  };

  const handleUpdateSection = async (
    updates: Omit<Section, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!editingSection) return;
    const sectionId = editingSection.id;
    // Snapshot for rollback, then close and apply straight away: the modal is
    // in the way of the thing being edited, so it goes as soon as the values
    // are captured and the row itself reports progress by breathing.
    const previous = (database?.sections || []).find((s) => s.id === sectionId);
    closeSectionModal();
    setSavingSectionIds((prev) => new Set(prev).add(sectionId));
    setDatabase((prev) =>
      prev
        ? {
            ...prev,
            sections: prev.sections.map((s) =>
              s.id === sectionId ? { ...s, ...updates } : s,
            ),
          }
        : prev,
    );

    const rollback = () => {
      if (!previous) return;
      setDatabase((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) =>
                s.id === sectionId ? previous : s,
              ),
            }
          : prev,
      );
    };

    try {
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: updates.name,
          description: updates.description ?? null,
          color: updates.color,
          icon: updates.icon,
        }),
      });

      if (response.ok) {
        await fetchData();
        showSuccess(`Saved "${updates.name}"`);
        return;
      }

      rollback();
      const errorText = await response.text();
      console.error("Error updating section:", response.status, errorText);
      showError(
        `Could not save "${updates.name}"`,
        "Your changes have been rolled back. Please try again.",
      );
    } catch (error) {
      rollback();
      console.error("Error updating section:", error);
      showError(
        `Could not save "${updates.name}"`,
        "Your changes have been rolled back. Please try again.",
      );
    } finally {
      setSavingSectionIds((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  // Write the assignee filter into the query string so the view can be
  // bookmarked and shared; the default value stays out of the URL.
  const applyAssigneeFilter = (value: string) => {
    setFilterAssignedTo(value);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (value === "me-unassigned") {
      nextParams.delete("assignee");
    } else {
      nextParams.set("assignee", value);
    }
    const query = nextParams.toString();
    router.replace(query ? `/${view}?${query}` : `/${view}`, { scroll: false });
  };

  // Keep the filter in step with browser back/forward navigation.
  useEffect(() => {
    setFilterAssignedTo(searchParams.get("assignee") || "me-unassigned");
  }, [searchParams]);

  const handleSectionDelete = (sectionId: string) => {
    const section = database?.sections?.find((s) => s.id === sectionId);
    if (!section) return;

    // Tasks land in a section either through a task_sections association or a
    // direct section_id on the task, so collect both.
    const taskIds = Array.from(
      new Set([
        ...(database?.taskSections || [])
          .filter((ts) => ts.sectionId === sectionId)
          .map((ts) => ts.taskId),
        ...(database?.tasks || [])
          .filter(
            (task) =>
              (((task as any).section_id || task.sectionId) ?? null) ===
              sectionId,
          )
          .map((task) => task.id),
      ]),
    );

    setSectionDeleteConfirm({
      show: true,
      sectionId,
      sectionName: section.name,
      taskIds,
      taskAction: "unassign",
    });
  };

  const confirmSectionDelete = async () => {
    const { sectionId, taskIds, taskAction } = sectionDeleteConfirm;
    if (!sectionId) return;

    try {
      // Resolve the tasks first so deleting the section never strands them.
      if (taskIds.length > 0) {
        if (taskAction === "delete") {
          await Promise.all(
            taskIds.map((taskId) =>
              fetch(`/api/tasks/${taskId}`, {
                method: "DELETE",
                credentials: "include",
              }),
            ),
          );
        } else {
          await Promise.all(
            taskIds.map(async (taskId) => {
              const response = await fetch(`/api/tasks/${taskId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ sectionId: null, goalId: null }),
              });
              if (!response.ok) {
                console.error(
                  "Failed to unassign task from deleted section:",
                  await response.text(),
                );
              }
              await fetch(
                `/api/task-sections?taskId=${encodeURIComponent(taskId)}&sectionId=${encodeURIComponent(sectionId)}`,
                { method: "DELETE", credentials: "include" },
              );
            }),
          );
        }
      }

      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Error deleting section:", await response.text());
      }
      await fetchData();
    } catch (error) {
      console.error("Error deleting section:", error);
      await fetchData();
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
              goalId: null,
              updatedAt: movedAt,
              section_id: sectionId,
              goal_id: null,
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
        body: JSON.stringify({ sectionId, goalId: null }),
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
                goalId: null,
                updatedAt: movedAt,
                section_id: null,
                goal_id: null,
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
        body: JSON.stringify({ sectionId: null, goalId: null }),
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
    goalId?: string,
  ) => {
    setSectionProjectId(projectId);
    setSectionParentId(parentId);
    setSectionGoalId(goalId);
    setSectionOrder(order || 0);
    setEditingSection(null);
    setShowAddSection(true);
  };

  const closeSectionModal = () => {
    setShowAddSection(false);
    setSectionParentId(undefined);
    setSectionGoalId(undefined);
    setSectionProjectId(undefined);
    setSectionOrder(0);
    setEditingSection(null);
  };

  const openAddGoal = (
    projectId: string,
    sectionId?: string,
    order?: number,
  ) => {
    setAddGoalProjectId(projectId);
    setAddGoalSectionId(sectionId);
    setAddGoalOrder(order || 0);
    setShowAddGoal(true);
  };

  const handleAddGoal = async (goal: AddGoalPayload) => {
    // Close the modal instantly and show the goal optimistically with a
    // "saving" (breathing) state, then reconcile in place — no full reload.
    setShowAddGoal(false);
    setAddGoalSectionId(undefined);
    setAddGoalOrder(0);

    const tempId = `goal-temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: Goal = {
      id: tempId,
      sectionId: goal.sectionId || undefined,
      projectId: goal.projectId,
      name: goal.name,
      description: goal.description || undefined,
      completed: false,
      order: goal.order ?? 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      _saving: true,
    };
    setDatabase((prev: any) =>
      prev ? { ...prev, goals: [...(prev.goals || []), optimistic] } : prev,
    );

    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(goal),
      });

      if (response.ok) {
        const created = await response.json();
        const real = (created?.data ?? created) as Goal;
        setDatabase((prev: any) =>
          prev
            ? {
                ...prev,
                goals: (prev.goals || []).map((g: Goal) =>
                  g.id === tempId ? { ...real, _saving: false } : g,
                ),
              }
            : prev,
        );
        return;
      }

      // Failed: drop the optimistic goal.
      setDatabase((prev: any) =>
        prev
          ? {
              ...prev,
              goals: (prev.goals || []).filter((g: Goal) => g.id !== tempId),
            }
          : prev,
      );
      console.error("Error creating goal:", response.status);
    } catch (error) {
      setDatabase((prev: any) =>
        prev
          ? {
              ...prev,
              goals: (prev.goals || []).filter((g: Goal) => g.id !== tempId),
            }
          : prev,
      );
      console.error("Error creating goal:", error);
    }
  };

  const handleTaskDropToGoal = async (
    taskId: string,
    goalId: string,
    sectionId?: string,
  ) => {
    const movedAt = new Date().toISOString();
    // Resolve the goal's own section so a cross-section drop pulls the task
    // into the goal's section too.
    const goal = database?.goals?.find((g) => g.id === goalId);
    const goalSectionId =
      (goal?.sectionId || (goal as any)?.section_id || sectionId) ?? null;

    setDatabase((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === taskId
            ? ({
                ...task,
                goalId,
                sectionId: goalSectionId,
                updatedAt: movedAt,
                goal_id: goalId,
                section_id: goalSectionId,
                updated_at: movedAt,
              } as any)
            : task,
        ),
      };
    });

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ goalId, sectionId: goalSectionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to move task to goal: ${errorText}`);
      }

      await fetchData();
    } catch (error) {
      console.error("Error moving task to goal:", error);
      await fetchData();
    }
  };

  // Nest a section (task list) inside a goal by dragging it onto the goal.
  const handleSectionDropToGoal = async (sectionId: string, goalId: string) => {
    const movedAt = new Date().toISOString();
    setDatabase((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId
            ? ({
                ...s,
                goalId,
                goal_id: goalId,
                updatedAt: movedAt,
                updated_at: movedAt,
              } as any)
            : s,
        ),
      };
    });
    try {
      const response = await fetch(`/api/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ goalId }),
      });
      if (!response.ok) throw new Error(await response.text());
      await fetchData();
    } catch (error) {
      console.error("Error nesting section into goal:", error);
      await fetchData();
    }
  };

  // Create a new task list (section) directly inside a goal. Opens the same
  // modal the project view uses so the list is named on creation.
  const handleAddSectionToGoal = (goalId: string) => {
    const goal = database?.goals?.find((g) => g.id === goalId);
    if (!goal) return;
    const siblingCount =
      database?.sections?.filter((s) => s.goalId === goalId).length || 0;
    openAddSection(goal.projectId, undefined, siblingCount, goalId);
  };

  const handleCompleteGoal = async (goalId: string, completed: boolean) => {
    setDatabase((prev) => {
      if (!prev || !prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map((goal) =>
          goal.id === goalId
            ? { ...goal, completed, updatedAt: new Date().toISOString() }
            : goal,
        ),
      };
    });
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) {
        console.error("Error completing goal:", await response.text());
      }
      await fetchData();
    } catch (error) {
      console.error("Error completing goal:", error);
      await fetchData();
    }
  };

  const handleRenameGoal = async (goalId: string, name: string) => {
    setDatabase((prev) => {
      if (!prev || !prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map((goal) =>
          goal.id === goalId
            ? { ...goal, name, updatedAt: new Date().toISOString() }
            : goal,
        ),
      };
    });
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        console.error("Error renaming goal:", await response.text());
      }
      await fetchData();
    } catch (error) {
      console.error("Error renaming goal:", error);
      await fetchData();
    }
  };

  const handleUpdateGoal = async (goalId: string, edits: GoalEdits) => {
    setDatabase((prev) => {
      if (!prev || !prev.goals) return prev;
      return {
        ...prev,
        goals: prev.goals.map((goal) =>
          goal.id === goalId
            ? { ...goal, ...edits, updatedAt: new Date().toISOString() }
            : goal,
        ),
      };
    });
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: edits.name,
          description: edits.description ?? null,
          completed: edits.completed,
        }),
      });
      if (!response.ok) {
        console.error("Error updating goal:", await response.text());
      }
      await fetchData();
    } catch (error) {
      console.error("Error updating goal:", error);
      await fetchData();
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        await fetchData();
      } else {
        console.error("Error deleting goal:", await response.text());
      }
    } catch (error) {
      console.error("Error deleting goal:", error);
    }
  };

  const openAddTask = (
    projectId?: string,
    sectionId?: string,
    goalId?: string,
  ) => {
    setAddTaskDefaults({ projectId, sectionId, goalId });
    setShowAddTask(true);
  };

  // Create a task directly inside a goal (opens the task modal pre-scoped).
  const handleAddTaskToGoal = (goalId: string) => {
    const goal = database?.goals?.find((g) => g.id === goalId);
    if (!goal) return;
    openAddTask(
      goal.projectId,
      goal.sectionId || (goal as any).section_id || undefined,
      goalId,
    );
  };

  // Create a sub-goal nested inside a parent goal.
  const handleAddSubGoal = async (goalId: string) => {
    const goal = database?.goals?.find((g) => g.id === goalId);
    if (!goal) return;
    try {
      const response = await fetch(`/api/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: "New goal",
          projectId: goal.projectId,
          sectionId: goal.sectionId || (goal as any).section_id || undefined,
          parentGoalId: goalId,
        }),
      });
      if (response.ok) await fetchData();
    } catch (error) {
      console.error("Error adding sub-goal:", error);
    }
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

      pendingTaskMutationsRef.current.set(taskId, persistUpdates);

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
      } finally {
        pendingTaskMutationsRef.current.delete(taskId);
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
      showAddGoal ||
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
    showAddGoal,
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

    const projectGoals =
      (database.goals || [])
        .filter((g) => ((g as any).project_id || g.projectId) === projectId)
        .sort((a, b) => (a.order || 0) - (b.order || 0)) || [];

    return {
      projectId,
      project,
      projectTasks,
      projectSections,
      unassignedTasks,
      projectGoals,
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
    if (view === "estimates") {
      return <EstimatesView />;
    }

    if (view === "email-drafts") {
      return <EmailDraftsView />;
    }

    if (view === "email-starred") {
      return (
        <EmailStarredView
          data={database}
          onRefresh={fetchData}
          onEditTask={handleEditTaskById}
        />
      );
    }

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
          isDataLoading={isDataLoading}
          isRefreshing={isRefreshing}
          freshlyUpdatedInboxIds={freshlyUpdatedInboxIds}
          onRefresh={fetchData}
          currentUserId={currentUserId}
          onEditTask={handleEditTaskById}
        />
      );
    }

    if (view === "today") {
      // Get all tasks with due dates up to end of week (excluding snoozed)
      const nowMs = Date.now();
      let allWeekTasks = database.tasks.filter((task) => {
        const dueDate = (task as any).due_date || task.dueDate;
        if (!dueDate) return false;
        const snoozedUntil =
          (task as any).snoozed_until || (task as any).snoozedUntil;
        if (snoozedUntil) {
          const snoozedMs = new Date(snoozedUntil).getTime();
          if (Number.isFinite(snoozedMs) && snoozedMs > nowMs) {
            return false;
          }
        }
        // Recurring tasks: only surface their overdue/today occurrence, not
        // future ones. Otherwise completing one (which spawns the next
        // occurrence) immediately re-populates Today with the later-this-week
        // instance and looks like the completed task "reappeared".
        const isRecurring = Boolean(
          (task as any).recurring_pattern ||
          task.recurringPattern ||
          (task as any).is_recurring ||
          (task as any).isRecurring,
        );
        if (isRecurring) {
          return isOverdue(dueDate) || isToday(dueDate);
        }
        // Non-recurring: overdue, today, tomorrow, and rest of week.
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

      // Raw email items no longer render on the Today view. Tasks created from
      // emails appear inline in the task sections below (flagged with a Mail
      // icon in TaskList). Mailbox sync indicators and the Email Work list now
      // live exclusively on the /email-inbox full view.

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
        <div className="flex items-center gap-3 border-b border-[rgba(var(--theme-primary-rgb),0.30)] py-2 px-1">
          <button
            onClick={() => toggleSection(section)}
            className="group flex flex-1 items-center justify-between"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-[rgba(var(--theme-primary-rgb),0.9)] transition-colors group-hover:text-[rgb(var(--theme-primary-rgb))]">
              <span>
                {title}{" "}
                {count > 0 && <span className="text-zinc-600">({count})</span>}
              </span>
              {isRefreshing && (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
              )}
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
        // Track this edit as pending so a concurrent refetch can't revert it
        // (fetchData re-overlays pending edits until we clear this below).
        pendingTaskMutationsRef.current.set(taskId, updates as any);
        setDatabase((prev) => {
          if (!prev) return prev;
          // When the assignee changes, refresh the row's avatar badge fields
          // immediately (overlayTaskPatch only syncs the id) so the change is
          // visible before the server round-trip completes.
          const hasAssignee = Object.prototype.hasOwnProperty.call(
            updates as any,
            "assignedTo",
          );
          const nextAssignee = hasAssignee
            ? ((updates as any).assignedTo ?? null)
            : undefined;
          const assignedUser =
            hasAssignee && nextAssignee
              ? prev.users?.find((u) => u.id === nextAssignee)
              : undefined;
          return {
            ...prev,
            tasks: prev.tasks.map((task) => {
              if (task.id !== taskId) return task;
              const patched = overlayTaskPatch(task, updates as any);
              if (!hasAssignee) return patched;
              return {
                ...patched,
                assignedToName: assignedUser
                  ? assignedUser.name ||
                    `${assignedUser.firstName || ""} ${assignedUser.lastName || ""}`.trim() ||
                    assignedUser.email ||
                    null
                  : null,
                assignedToColor: assignedUser?.profileColor ?? null,
                assignedToMemoji: assignedUser?.profileMemoji ?? null,
              };
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
          if (!response.ok) {
            console.error("Failed to update task:", response.status);
          }
          await fetchData();
        } catch (error) {
          console.error("Error updating task:", error);
          await fetchData();
        } finally {
          // Server state is now authoritative (the awaited fetchData reflects
          // the committed value); stop overlaying this edit.
          pendingTaskMutationsRef.current.delete(taskId);
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
        members: database.users,
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
        deletingTaskIds,
        savingTaskIds,
        recentlySavedTaskIds,
        freshlyUpdatedTaskIds,
        emailThreadIdByTaskId: emailTaskLinks,
        aiCreatedByTaskId: aiCreatedTasks,
        emailSenderByTaskId,
        onOpenAiRationale: ({
          taskId,
          taskName,
          threadId,
          rationale,
        }: {
          taskId: string;
          taskName: string;
          threadId: string;
          rationale: string | null;
        }) => setAiRationaleModal({ taskId, taskName, threadId, rationale }),
        dominoByTaskId,
        dominoRationaleByTaskId,
        onOpenEmailThread: (threadId: string) => setTaskEmailThreadId(threadId),
        onAddDependency: (task: Task) => handleTaskEdit(task),
        showDescriptions: showTaskDescriptions,
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

      const renderTaskSection = (
        sectionTasks: typeof allWeekTasks,
        accordionKey: string,
      ) => {
        if (!groupTasksByProject) {
          return <TaskList {...getTaskListProps(sectionTasks, accordionKey)} />;
        }
        const groups = new Map<string, typeof allWeekTasks>();
        sectionTasks.forEach((task) => {
          const pid = (task as any).project_id || task.projectId || "__none__";
          const bucket = groups.get(pid) || [];
          bucket.push(task);
          groups.set(pid, bucket);
        });
        const dueMs = (task: any) => {
          const due = task.due_date || task.dueDate;
          return due ? new Date(due).getTime() : Number.POSITIVE_INFINITY;
        };
        const ranked = Array.from(groups.entries())
          .map(([pid, bucket]) => ({
            pid,
            bucket,
            earliest: Math.min(...bucket.map(dueMs)),
          }))
          .sort((a, b) => a.earliest - b.earliest);
        return ranked.map(({ pid, bucket }) => {
          const project = database.projects.find((p) => p.id === pid);
          return (
            <div key={`${accordionKey}-${pid}`} className="mb-2">
              <div className="flex items-center gap-2 px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: project?.color || "#52525b" }}
                />
                {project?.name || "No project"}
              </div>
              <TaskList
                {...getTaskListProps(bucket, `${accordionKey}-${pid}`)}
              />
            </div>
          );
        });
      };

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
                      <Tooltip
                        content="Sync with Todoist"
                        side="bottom"
                        className="inline-flex"
                      >
                        <button
                          onClick={() => setShowTodoistSync(true)}
                          className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-zinc-600 transition-colors"
                          aria-label="Sync with Todoist"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    )}
                    {overdueCount > 0 && (
                      <Tooltip
                        content={`Reschedule ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`}
                        side="bottom"
                        className="inline-flex"
                      >
                        <button
                          onClick={() => setShowRescheduleConfirm(true)}
                          className="relative p-2 rounded border border-zinc-700 text-zinc-400 hover:text-orange-400 hover:border-zinc-600 transition-colors"
                          aria-label={`Reschedule ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`}
                        >
                          <CalendarClock className="w-4 h-4" />
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-xs sm:text-[9px] font-semibold leading-none text-white">
                            {overdueCount}
                          </span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <Tooltip
                    content={`Date layout: ${dueDateLayout === "inline" ? "Inline" : dueDateLayout === "below" ? "Below" : "Right"}`}
                    side="bottom"
                    className="inline-flex"
                  >
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
                      className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-sky-400 hover:border-zinc-600 transition-colors"
                      aria-label="Cycle date layout"
                    >
                      <CalendarDays className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip
                    content={
                      groupTasksByProject
                        ? "Grouped by project (click to ungroup)"
                        : "Group by project"
                    }
                    side="bottom"
                    className="inline-flex"
                  >
                    <button
                      onClick={() => setGroupTasksByProject((prev) => !prev)}
                      className={`p-2 rounded border transition-colors ${
                        groupTasksByProject
                          ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30"
                          : "border-zinc-700 text-zinc-400 hover:text-violet-400 hover:border-zinc-600"
                      }`}
                      aria-label="Group by project"
                    >
                      <FolderKanban className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip
                    content={
                      showTaskDescriptions
                        ? "Hide description excerpts"
                        : "Show description excerpts"
                    }
                    side="bottom"
                    className="inline-flex"
                  >
                    <button
                      onClick={() => setShowTaskDescriptions((prev) => !prev)}
                      className={`p-2 rounded border transition-colors ${
                        showTaskDescriptions
                          ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30"
                          : "border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
                      }`}
                      aria-label="Toggle description excerpts"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </Tooltip>
                  <Tooltip
                    content={
                      todayViewMode === "kanban"
                        ? "Switch to list view"
                        : "Switch to kanban view"
                    }
                    side="bottom"
                    className="inline-flex"
                  >
                    <button
                      onClick={() =>
                        setTodayViewMode((prev) =>
                          prev === "list" ? "kanban" : "list",
                        )
                      }
                      className={`p-2 rounded border transition-colors ${
                        todayViewMode === "kanban"
                          ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30"
                          : "border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-zinc-600"
                      }`}
                      aria-label="Toggle list/kanban view"
                    >
                      {todayViewMode === "kanban" ? (
                        <LayoutList className="w-4 h-4" />
                      ) : (
                        <LayoutGrid className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>
                  <div className="flex items-center gap-1">
                    <Popover.Root>
                      <Tooltip
                        content="Sort tasks"
                        side="bottom"
                        className="inline-flex"
                      >
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            className="p-2 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                            aria-label="Sort options"
                          >
                            <ArrowUpDown className="w-4 h-4" />
                          </button>
                        </Popover.Trigger>
                      </Tooltip>
                      <Popover.Portal>
                        <Popover.Content
                          side="bottom"
                          align="center"
                          sideOffset={8}
                          className="z-50 w-44 max-w-[min(var(--radix-popper-available-width,100vw),calc(100vw-1rem))] rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl p-2"
                        >
                          <div className="text-xs sm:text-[11px] text-zinc-500 px-1 pb-1">
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
                    <Tooltip
                      content="Assignee filter"
                      side="bottom"
                      className="inline-flex"
                    >
                      <span aria-label="Assignee filter">
                        <User className="w-4 h-4 text-zinc-400" />
                      </span>
                    </Tooltip>
                    <Select
                      value={filterAssignedTo}
                      onValueChange={applyAssigneeFilter}
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

                  <Tooltip
                    content={
                      showBlockedTasks
                        ? "Showing blocked tasks (click to hide)"
                        : "Hiding blocked tasks (click to show)"
                    }
                    side="bottom"
                    className="inline-flex"
                  >
                    <button
                      onClick={() => setShowBlockedTasks(!showBlockedTasks)}
                      className={`p-2 rounded border transition-colors ${
                        showBlockedTasks
                          ? "bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/30 hover:bg-[rgb(var(--theme-primary-rgb))]/20"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-600"
                      }`}
                      aria-label="Toggle blocked tasks"
                    >
                      {showBlockedTasks ? (
                        <Link2 className="w-4 h-4" />
                      ) : (
                        <Link2Off className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>

                  <Tooltip
                    content={
                      bulkSelectMode ? "Cancel bulk select" : "Bulk select"
                    }
                    side="bottom"
                    className="inline-flex"
                  >
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
                      aria-label="Bulk select"
                    >
                      {bulkSelectMode ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </Tooltip>

                  {bulkSelectMode && selectedTaskIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkEditModal(true)}
                      className="px-3 py-1.5 rounded border bg-theme-gradient text-white border-[rgb(var(--theme-primary-rgb))] hover:opacity-80 transition-colors text-sm font-medium"
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
            <div className="mx-4 mb-4">
              <DailyPlanCard
                capacityMinutes={Math.min(
                  1440,
                  Math.max(
                    30,
                    Number(
                      (resolvedCurrentUser as any)?.dailyCapacityMinutes ?? 300,
                    ) || 300,
                  ),
                )}
                plannedMinutesActual={todayTasks.reduce((acc, task) => {
                  if (task.completed) return acc;
                  const minutes = Number(
                    (task as any).time_estimate ?? task.timeEstimate ?? 0,
                  );
                  return acc + (Number.isFinite(minutes) ? minutes : 0);
                }, 0)}
                resolveContext={({ kind, id }) => {
                  if (kind === "task") {
                    const task = database.tasks.find((t) => t.id === id);
                    if (!task) return null;
                    const project = database.projects.find(
                      (p) => p.id === task.projectId,
                    );
                    return {
                      task: {
                        id: task.id,
                        name: task.name,
                        projectName: project?.name || null,
                      },
                    };
                  }
                  const item = database.inboxItems.find(
                    (entry) => entry.id === id,
                  );
                  if (!item) return null;
                  return {
                    inboxItem: {
                      id: item.id,
                      actionTitle: item.actionTitle,
                      subject: item.subject,
                    },
                  };
                }}
                onStartTask={(taskId) => {
                  const task = database.tasks.find((t) => t.id === taskId);
                  if (task) {
                    handleTaskEdit(task);
                  }
                }}
                onCompleteTask={(taskId) => {
                  void handleTaskToggle(taskId);
                }}
                onSnoozeTask={(taskId, iso) => {
                  void handleTaskUpdate(taskId, {
                    snoozedUntil: iso,
                  } as any);
                }}
                onSnoozeInboxItem={(inboxItemId, iso) => {
                  void fetch(`/api/email/threads/${inboxItemId}/actions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "snooze",
                      snoozedUntil: iso,
                    }),
                  })
                    .then(() => fetchData())
                    .catch(() => undefined);
                }}
                onPlanLoaded={handlePlanLoaded}
                onConvertInboxToTask={(inboxItemId) => {
                  void fetch(`/api/email/threads/${inboxItemId}/actions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "to_task" }),
                  })
                    .then(() => fetchData())
                    .catch(() => undefined);
                }}
              />
            </div>
            {/* Today list card: DailyPlanCard sits above; this card holds the
                day's task sections (Today / Overdue / Tomorrow / Rest of the
                Week). Raw email items no longer render here — tasks created
                from emails appear inline in the task sections below with a Mail
                icon indicator (see TaskList). */}
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2 mx-4">
              {isDataLoading ? (
                <SkeletonSectionedTasks
                  sections={[
                    { title: "Today", count: 4 },
                    { title: "Tomorrow", count: 3 },
                    { title: "Rest of Week", count: 2 },
                  ]}
                />
              ) : todayViewMode === "kanban" ? (
                <div className="mt-2">
                  <KanbanView
                    tasks={[
                      ...overdueTasks,
                      ...todayTasks,
                      ...tomorrowTasks,
                      ...restOfWeekTasks,
                    ].filter((t) => !t.completed)}
                    allTasks={database.tasks}
                    projects={database.projects}
                    onTaskToggle={handleTaskToggle}
                    onTaskEdit={handleTaskEdit}
                    onTaskUpdate={handleTaskUpdate}
                  />
                </div>
              ) : (
                <>
                  {/* Today Section — rendered first so it sits directly beneath
                      the Email Work list above, forming the single unified
                      "today work" list (email items, then today's tasks). */}
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
                          <>{renderTaskSection(todayTasks, "today-today")}</>
                        ) : (
                          <p className="text-sm text-zinc-600 py-2 px-1">
                            No tasks due today
                          </p>
                        )}
                      </div>
                    )}
                  </div>

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
                          <>
                            {renderTaskSection(overdueTasks, "today-overdue")}
                          </>
                        </div>
                      )}
                    </div>
                  )}

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
                          <>
                            {renderTaskSection(tomorrowTasks, "today-tomorrow")}
                          </>
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
                          <>
                            {renderTaskSection(
                              restOfWeekTasks,
                              "today-restofweek",
                            )}
                          </>
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
                        {...getTaskListProps(
                          completedWeekTasks,
                          "today-completed",
                        )}
                        showCompleted={false}
                      />
                    </div>
                  )}
                </>
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
          {isDataLoading ? (
            <SkeletonTaskList count={6} />
          ) : (
            <KanbanView
              tasks={upcomingTasks}
              allTasks={database.tasks}
              projects={database.projects}
              onTaskToggle={handleTaskToggle}
              onTaskEdit={handleTaskEdit}
              onTaskUpdate={handleTaskUpdate}
              dateType={upcomingFilterType}
            />
          )}
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
                  ? "bg-theme-gradient text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSearchFilter("tasks")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "tasks"
                  ? "bg-theme-gradient text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Tasks ({filteredTasks.length})
            </button>
            <button
              onClick={() => setSearchFilter("projects")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "projects"
                  ? "bg-theme-gradient text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Projects ({filteredProjects.length})
            </button>
            <button
              onClick={() => setSearchFilter("organizations")}
              className={`px-3 py-1 rounded-md transition-colors ${
                searchFilter === "organizations"
                  ? "bg-theme-gradient text-white"
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
                    savingTaskIds={savingTaskIds}
                    recentlySavedTaskIds={recentlySavedTaskIds}
                    freshlyUpdatedTaskIds={freshlyUpdatedTaskIds}
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
      const gradientMode = orgColorGradientMode[orgId] === true;

      // A project's stored color is either a solid hex or a gradient string /
      // "brand-gradient" sentinel. In org gradient mode, every dot renders as
      // the brand gradient regardless of its stored color.
      const projectDotStyle = (color: string): React.CSSProperties => {
        if (gradientMode) return { background: brandGradient };
        if (!color) return { backgroundColor: "#6B7280" };
        if (color === "brand-gradient") return { background: brandGradient };
        if (color.includes("gradient")) return { background: color };
        return { backgroundColor: color };
      };

      return (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold">
                {organization?.name || "Organization"}
              </h1>
              <div className="flex items-center gap-2">
                <Tooltip
                  content="New project"
                  side="bottom"
                  align="end"
                  className="inline-flex"
                >
                  <button
                    onClick={() => handleOpenAddProject(orgId)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded bg-theme-gradient text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    aria-label="New project"
                  >
                    <Plus className="w-4 h-4" />
                    New Project
                  </button>
                </Tooltip>
                <Tooltip
                  content={
                    orgColorGradientMode[orgId]
                      ? "Show project colors"
                      : "Show brand gradient for all projects"
                  }
                  side="bottom"
                  align="end"
                  className="inline-flex"
                >
                  <button
                    onClick={() => toggleOrgColorMode(orgId)}
                    className={`p-2 hover:bg-zinc-800 rounded transition-colors ${
                      orgColorGradientMode[orgId]
                        ? "text-white bg-zinc-800"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    aria-label="Color mode"
                  >
                    <Palette className="w-5 h-5" />
                  </button>
                </Tooltip>
                <Tooltip
                  content="Edit organization"
                  side="bottom"
                  align="end"
                  className="inline-flex"
                >
                  <button
                    onClick={() => handleOpenEditOrganization(orgId)}
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                    aria-label="Edit organization"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                </Tooltip>
                {organization?.archived ? (
                  <Tooltip
                    content="Restore organization"
                    side="bottom"
                    align="end"
                    className="inline-flex"
                  >
                    <button
                      onClick={() =>
                        handleOrganizationUpdate(orgId, { archived: false })
                      }
                      className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                      aria-label="Restore organization"
                    >
                      <Archive className="w-5 h-5" />
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip
                    content="Archive organization"
                    side="bottom"
                    align="end"
                    className="inline-flex"
                  >
                    <button
                      onClick={() =>
                        handleOrganizationUpdate(orgId, { archived: true })
                      }
                      className="p-2 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-white"
                      aria-label="Archive organization"
                    >
                      <Archive className="w-5 h-5" />
                    </button>
                  </Tooltip>
                )}
                <Tooltip
                  content="Delete organization"
                  side="bottom"
                  align="end"
                  className="inline-flex"
                >
                  <button
                    onClick={() => openDeleteConfirmation(orgId)}
                    className="p-2 hover:bg-zinc-800 rounded transition-colors text-red-400 hover:text-red-300"
                    aria-label="Delete organization"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </Tooltip>
              </div>
            </div>

            <p className="text-zinc-400 mb-4">
              {activeProjects.length} active projects, {archivedProjects.length}{" "}
              archived
            </p>

            <HistoryTimelineScrubber
              scope={{ organizationId: orgId }}
              title="History"
              className="mb-4"
            />

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
              <div className="grid gap-1.5">
                {isDataLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={`org-project-skeleton-${i}`}
                      className="bg-zinc-900 rounded-lg p-4 border border-zinc-800"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="w-3 h-3 rounded-full" />
                          <Skeleton className="h-6 w-40" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-2/3 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                {!isDataLoading &&
                  activeProjects.map((project) => {
                    const taskCount = database.tasks.filter(
                      (t) =>
                        ((t as any).project_id || t.projectId) === project.id,
                    ).length;
                    const completedCount = database.tasks.filter(
                      (t) =>
                        ((t as any).project_id || t.projectId) === project.id &&
                        t.completed,
                    ).length;

                    const openTasks = taskCount - completedCount;
                    const endValue = project.endDate ?? project.deadline;

                    return (
                      <div
                        key={project.id}
                        className="bg-zinc-900 rounded-lg px-3 py-1.5 border border-zinc-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Clickable color dot → animated wheel picker */}
                            <div className="relative flex-shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setColorPickerProjectId((prev) =>
                                    prev === project.id ? null : project.id,
                                  )
                                }
                                className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20 hover:ring-white/60 transition-all"
                                style={projectDotStyle(project.color)}
                                title="Change project color"
                                aria-label="Change project color"
                              />
                              {colorPickerProjectId === project.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() =>
                                      setColorPickerProjectId(null)
                                    }
                                  />
                                  <ColorWheelPicker
                                    currentColor={project.color}
                                    brandGradient={brandGradient}
                                    className="left-0 top-6"
                                    onColorChange={(color) => {
                                      handleProjectUpdate(project.id, {
                                        color,
                                      });
                                    }}
                                    onClose={() =>
                                      setColorPickerProjectId(null)
                                    }
                                  />
                                </>
                              )}
                            </div>
                            <Link
                              href={`/project-${project.id}`}
                              className="text-lg font-normal no-underline-link hover:text-zinc-300 transition-colors truncate"
                            >
                              {project.name}
                            </Link>
                            <Tooltip
                              content={`${openTasks} Tasks Open out of ${taskCount} Total`}
                              side="top"
                              className="flex-shrink-0"
                            >
                              <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                                {openTasks}/{taskCount}
                              </span>
                            </Tooltip>
                            <div className="flex items-center gap-x-3 text-sm text-zinc-500 flex-shrink-0">
                              {project.budget && (
                                <span>Budget: ${project.budget}</span>
                              )}
                              <Tooltip content="Created" side="top">
                                <span className="inline-flex items-center gap-1 text-zinc-400">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {formatDate(
                                    project.createdAt,
                                    resolvedCurrentUser?.dateFormat,
                                  )}
                                </span>
                              </Tooltip>
                              {project.startDate && (
                                <Tooltip content="Start date" side="top">
                                  <span className="inline-flex items-center gap-1 text-zinc-400">
                                    <CalendarPlus className="w-3.5 h-3.5" />
                                    {formatDate(
                                      project.startDate,
                                      resolvedCurrentUser?.dateFormat,
                                    )}
                                  </span>
                                </Tooltip>
                              )}
                              {endValue && (
                                <Tooltip content="End date" side="top">
                                  <span className="inline-flex items-center gap-1 text-zinc-400">
                                    <CalendarCheck className="w-3.5 h-3.5" />
                                    {formatDate(
                                      endValue,
                                      resolvedCurrentUser?.dateFormat,
                                    )}
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingProject(project);
                                setShowEditProject(true);
                              }}
                              className="p-1 hover:bg-zinc-800 rounded transition-colors"
                              title="Edit project"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleProjectUpdate(project.id, {
                                  archived: true,
                                })
                              }
                              className="p-1 hover:bg-zinc-800 rounded transition-colors"
                              title="Archive project"
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
                      </div>
                    );
                  })}
                {!isDataLoading && activeProjects.length === 0 && (
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
                              style={projectDotStyle(project.color)}
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

      // Goal indexes (parallel to sectionTasksBySectionId). Group this
      // project's goals by sectionId (null key = project-level) and group
      // visible tasks by goalId.
      const projectGoals = projectViewData?.projectGoals || [];
      const goalsBySectionId = new Map<string | null, Goal[]>();
      for (const goal of projectGoals) {
        const key = (goal.sectionId || (goal as any).section_id || null) as
          string | null;
        const list = goalsBySectionId.get(key) || [];
        list.push(goal);
        goalsBySectionId.set(key, list);
      }
      const goalTasksByGoalId = new Map<string, Task[]>();
      for (const task of visibleProjectTasks) {
        const goalId = task.goalId || (task as any).goal_id;
        if (!goalId) continue;
        const list = goalTasksByGoalId.get(goalId) || [];
        list.push(task);
        goalTasksByGoalId.set(goalId, list);
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

      // Unfiltered task counts per section, so a genuinely EMPTY section
      // (e.g. one the user just added) stays visible even though it has no
      // tasks yet. Sections whose tasks are all filtered out stay hidden.
      const projectSectionTaskCount = new Map<string, number>();
      for (const task of projectTasks) {
        const ids = new Set<string>();
        const directSectionId = task.sectionId || (task as any).section_id;
        if (directSectionId) ids.add(directSectionId);
        for (const sectionId of taskSectionIdsByTaskId.get(task.id) || []) {
          ids.add(sectionId);
        }
        ids.forEach((sectionId) =>
          projectSectionTaskCount.set(
            sectionId,
            (projectSectionTaskCount.get(sectionId) || 0) + 1,
          ),
        );
      }
      const sectionIsEmpty = (sectionId: string): boolean => {
        if ((projectSectionTaskCount.get(sectionId) || 0) > 0) return false;
        const childSections = sectionChildrenByParent.get(sectionId) || [];
        return childSections.every((childSection) =>
          sectionIsEmpty(childSection.id),
        );
      };

      const visibleProjectSections = projectSections.filter(
        (section) =>
          // Sections nested inside a goal render within that goal, not here.
          !(section.goalId || (section as any).goal_id) &&
          (sectionHasVisibleTasks(section.id) || sectionIsEmpty(section.id)),
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
          <div className="flex items-start justify-between mb-6 gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="relative">
                  <span
                    className="w-4 h-4 rounded-full block cursor-pointer hover:ring-2 hover:ring-zinc-400 transition-all"
                    style={{
                      backgroundColor:
                        project?.color ??
                        cachedProjectHeader?.color ??
                        "#3f3f46",
                    }}
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
                {project?.name ?? cachedProjectHeader?.name ?? (
                  <Skeleton className="h-7 w-48 rounded-md" />
                )}
              </h1>
              {/* Editable project goal under the title (task 10). */}
              <div className="mt-1 ml-7 flex items-center gap-1.5 text-sm">
                <Target className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--theme-primary-rgb))]" />
                {isEditingProjectGoal && project ? (
                  <input
                    type="text"
                    autoFocus
                    value={projectGoalDraft}
                    onChange={(e) => setProjectGoalDraft(e.target.value)}
                    onBlur={() => {
                      handleProjectUpdate(project.id, {
                        goal: projectGoalDraft.trim() || undefined,
                      });
                      setIsEditingProjectGoal(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingProjectGoal(false);
                      }
                    }}
                    placeholder="Set a goal"
                    className="min-w-0 flex-1 bg-transparent border-b border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[rgb(var(--theme-primary-rgb))]"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={!project}
                    onClick={() => {
                      if (!project) return;
                      setProjectGoalDraft(project.goal ?? "");
                      setIsEditingProjectGoal(true);
                    }}
                    className={`truncate text-left transition-colors ${
                      project?.goal
                        ? "text-zinc-300 hover:text-white"
                        : "text-zinc-600 hover:text-zinc-400"
                    } disabled:cursor-default disabled:hover:text-zinc-600`}
                    title="Set the project goal"
                  >
                    {project?.goal || "Set a goal"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Action cluster is gated on `projectId` (known from the route
                  immediately), not the late-arriving `project` object, so the
                  buttons paint at 0ms. Handlers that truly need the loaded
                  project are disabled until it arrives. */}
              <Tooltip
                content="Project notes"
                side="bottom"
                align="end"
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={!project}
                  onClick={() => setShowProjectNotesModal(true)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Project description and notes"
                >
                  <FileText className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip
                content="Edit project"
                side="bottom"
                align="end"
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={!project}
                  onClick={() => handleOpenEditProject(projectId)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Project settings and DevNotes"
                >
                  <Edit className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip
                content="Share project"
                side="bottom"
                align="end"
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={!project}
                  onClick={() => setShowProjectShareModal(true)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Share project"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <ProjectAiExportControls projectId={projectId} />
              <Tooltip
                content="Browse previous versions of this project's tasks and settings"
                side="bottom"
                align="end"
                className="inline-flex"
              >
                <button
                  type="button"
                  disabled={!project}
                  onClick={() => setShowProjectHistory((prev) => !prev)}
                  aria-pressed={showProjectHistory}
                  className={`rounded-lg border p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    showProjectHistory
                      ? "border-[rgb(var(--theme-primary-rgb))] bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))]"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                  }`}
                  aria-label="Project history"
                >
                  <History className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip
                content="Create"
                side="bottom"
                align="end"
                className="inline-flex"
              >
                <CreateMenuButton
                  onAddTask={() => openAddTask(projectId)}
                  onAddGoal={() => openAddGoal(projectId)}
                  onAddTaskList={() => openAddSection(projectId, undefined, 0)}
                  onAddSection={() => openAddSection(projectId, undefined, 0)}
                  buttonClassName="btn-theme-primary text-white rounded-lg p-2 flex items-center justify-center transition-all"
                  iconClassName="w-4 h-4"
                  align="end"
                />
              </Tooltip>
            </div>
          </div>

          {project && (
            <ProjectProgressTimeline project={project} tasks={projectTasks} />
          )}

          {project && showProjectHistory && (
            <HistoryTimelineScrubber
              scope={{ projectId: project.id }}
              title="History"
              description="Browse previous versions of this project's tasks and settings over time."
              collapsible={false}
              className="mb-4"
            />
          )}

          <ProjectWorkTabs
            activeTab={projectWorkTab}
            emailCount={projectInboxItems.length}
            taskCount={visibleProjectTasks.length}
            onTabChange={setProjectWorkTab}
            emailContent={
              <EmailWorkList
                items={projectInboxItems}
                mailboxes={database.mailboxes}
                projects={database.projects}
                freshlyUpdatedIds={freshlyUpdatedInboxIds}
                emptyLabel="No email work linked to this project."
              />
            }
            taskContent={
              <>
                <div className="mb-2">
                  <div
                    className={`flex items-center justify-between gap-3 ${projectFiltersExpanded ? "mb-3" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={toggleProjectFiltersExpanded}
                      aria-expanded={projectFiltersExpanded}
                      className="group flex items-center gap-1.5 text-xs sm:text-[11px] uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${projectFiltersExpanded ? "rotate-90" : ""}`}
                      />
                      Project Task Filters
                      {isRefreshing && (
                        <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <CreateMenuButton
                        onAddTask={() => openAddTask(projectId)}
                        onAddGoal={() => openAddGoal(projectId)}
                        onAddTaskList={() =>
                          openAddSection(projectId, undefined, 0)
                        }
                        onAddSection={() =>
                          openAddSection(projectId, undefined, 0)
                        }
                        buttonClassName="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                        iconClassName="h-3.5 w-3.5"
                        align="start"
                      />
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
                              ? "bg-[image:var(--user-profile-gradient)] text-white"
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
                              ? "bg-[image:var(--user-profile-gradient)] text-white"
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
                          className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--theme-primary-rgb))] bg-theme-gradient px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-80"
                        >
                          Apply to {visibleSelectedCount} task
                          {visibleSelectedCount === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className="overflow-hidden transition-all duration-200 ease-in-out"
                    style={
                      projectFiltersExpanded
                        ? { maxHeight: "200px", opacity: 1, marginTop: "12px" }
                        : { maxHeight: "0px", opacity: 0, marginTop: "0px" }
                    }
                    aria-hidden={!projectFiltersExpanded}
                  >
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
                                Created By: {creator.firstName}{" "}
                                {creator.lastName}
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
                </div>

                {isDataLoading ? (
                  <div
                    className={
                      projectSectionLayout === "board"
                        ? "w-full"
                        : "mx-auto w-full max-w-[1000px]"
                    }
                  >
                    <SkeletonSectionedTasks
                      layout={
                        projectSectionLayout === "board" ? "board" : "list"
                      }
                      showAddSectionDivider={projectSectionLayout !== "board"}
                      sections={[
                        { title: "Section", count: 4 },
                        { title: "Section", count: 3 },
                        { title: "Section", count: 2 },
                      ]}
                    />
                  </div>
                ) : projectSectionLayout === "list" ? (
                  <div className="mx-auto w-full max-w-[1000px]">
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
                          goalsBySectionId={goalsBySectionId}
                          savingSectionIds={savingSectionIds}
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
                            openAddTask(
                              section.projectId,
                              section.id,
                              // A task list can live inside a goal; a task
                              // added to it belongs to that goal too, so the
                              // picker opens on it rather than empty.
                              (section.goalId ??
                                (section as any).goal_id) ||
                                undefined,
                            )
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
                          onAddGoal={(targetProjectId, sectionId) =>
                            openAddGoal(targetProjectId, sectionId)
                          }
                          onCompleteGoal={handleCompleteGoal}
                          onRenameGoal={handleRenameGoal}
                          onUpdateGoal={handleUpdateGoal}
                          onDeleteGoal={handleDeleteGoal}
                          onTaskDropToGoal={handleTaskDropToGoal}
                          onSectionDropToGoal={handleSectionDropToGoal}
                          onAddTaskToGoal={handleAddTaskToGoal}
                          onAddSectionToGoal={handleAddSectionToGoal}
                          onAddSubGoal={handleAddSubGoal}
                          userId={currentUserId || ""}
                        />
                      </div>
                    ))}

                    {(() => {
                      const projectLevelGoals = (
                        goalsBySectionId.get(null) || []
                      ).filter(
                        // Sub-goals render nested inside their parent.
                        (g) => !(g.parentGoalId || (g as any).parent_goal_id),
                      );
                      const renderUnassignedGoal = (
                        goal: Goal,
                      ): React.ReactNode => {
                        const goalTasks = visibleUnassignedTasks.filter(
                          (task) =>
                            (task.goalId || (task as any).goal_id) === goal.id,
                        );
                        const completedCount = goalTasks.filter(
                          (task) =>
                            task.completed ||
                            optimisticCompletedIds.has(task.id),
                        ).length;
                        const goalOwnedSections = (
                          database.sections || []
                        ).filter(
                          (s) =>
                            (s.goalId || (s as any).goal_id) === goal.id &&
                            !(s as any).is_deleted &&
                            !(s as any).isDeleted,
                        );
                        const subGoals = (database.goals || []).filter(
                          (g) =>
                            (g.parentGoalId || (g as any).parent_goal_id) ===
                              goal.id && !(g as any).deleted_at,
                        );
                        const hasContent =
                          goalTasks.length > 0 ||
                          goalOwnedSections.length > 0 ||
                          subGoals.length > 0;
                        return (
                          <div key={goal.id} className="mt-2">
                            <GoalGroupShell
                              goal={goal}
                              completedCount={completedCount}
                              totalCount={goalTasks.length}
                              onTaskDropToGoal={handleTaskDropToGoal}
                              onSectionDropToGoal={handleSectionDropToGoal}
                              onCompleteGoal={handleCompleteGoal}
                              onRenameGoal={handleRenameGoal}
                              onUpdateGoal={handleUpdateGoal}
                              onDeleteGoal={handleDeleteGoal}
                              onAddTaskToGoal={handleAddTaskToGoal}
                              onAddSectionToGoal={handleAddSectionToGoal}
                              onAddSubGoal={handleAddSubGoal}
                            >
                              {goalTasks.length > 0 && (
                                <TaskList
                                  tasks={goalTasks}
                                  allTasks={database.tasks}
                                  projects={database.projects}
                                  tags={database.tags}
                                  currentUserId={currentUserId}
                                  priorityColor={userPriorityColor}
                                  showCompleted={
                                    database.settings?.showCompletedTasks ??
                                    true
                                  }
                                  completedAccordionKey={`project-${projectId}-goal-${goal.id}`}
                                  revealActionsOnHover={true}
                                  dueDateLayout={dueDateLayout}
                                  uniformDueBadgeWidth={
                                    dueDateLayout === "inline"
                                  }
                                  bulkSelectMode={bulkSelectMode}
                                  selectedTaskIds={selectedTaskIds}
                                  loadingTaskIds={loadingTaskIds}
                                  animatingOutTaskIds={animatingOutTaskIds}
                                  optimisticCompletedIds={
                                    optimisticCompletedIds
                                  }
                                  deletingTaskIds={deletingTaskIds}
                                  savingTaskIds={savingTaskIds}
                                  recentlySavedTaskIds={recentlySavedTaskIds}
                                  freshlyUpdatedTaskIds={freshlyUpdatedTaskIds}
                                  enableDueDateQuickEdit={true}
                                  onTaskFocus={focusTaskRow}
                                  onTaskUpdate={handleProjectTaskUpdate}
                                  onTaskToggle={handleTaskToggle}
                                  onTaskEdit={handleTaskEdit}
                                  onTaskDelete={handleTaskDelete}
                                  onTaskSelect={handleProjectTaskSelect}
                                />
                              )}
                              {goalOwnedSections.map((ownedSection) => (
                                <SectionView
                                  key={ownedSection.id}
                                  section={ownedSection}
                                  tasks={visibleProjectTasks}
                                  allTasks={database.tasks}
                                  database={database}
                                  level={1}
                                  priorityColor={userPriorityColor}
                                  currentUserId={currentUserId}
                                  completedAccordionKey={`project-${projectId}`}
                                  revealActionsOnHover={true}
                                  dueDateLayout={dueDateLayout}
                                  bulkSelectMode={bulkSelectMode}
                                  selectedTaskIds={selectedTaskIds}
                                  loadingTaskIds={loadingTaskIds}
                                  animatingOutTaskIds={animatingOutTaskIds}
                                  optimisticCompletedIds={
                                    optimisticCompletedIds
                                  }
                                  sectionTasksBySectionId={
                                    sectionTasksBySectionId
                                  }
                                  childSectionsByParentId={
                                    sectionChildrenByParent
                                  }
                                  goalsBySectionId={goalsBySectionId}
                          savingSectionIds={savingSectionIds}
                                  enableDueDateQuickEdit={true}
                                  onTaskFocus={focusTaskRow}
                                  onTaskUpdate={handleProjectTaskUpdate}
                                  onTaskToggle={handleTaskToggle}
                                  onTaskEdit={handleTaskEdit}
                                  onTaskDelete={handleTaskDelete}
                                  onTaskSelect={handleProjectTaskSelect}
                                  onSectionEdit={handleSectionEdit}
                                  onSectionDelete={handleSectionDelete}
                                  onAddTask={(s) =>
                                    openAddTask(s.projectId, s.id)
                                  }
                                  onAddSection={(parentId) =>
                                    openAddSection(projectId, parentId)
                                  }
                                  onAddSectionAfter={(s) =>
                                    openAddSection(
                                      projectId,
                                      undefined,
                                      (s.order || 0) + 1,
                                    )
                                  }
                                  onTaskDrop={handleTaskDropToSection}
                                  onSectionReorder={handleSectionReorder}
                                  onAddGoal={(targetProjectId, sectionId) =>
                                    openAddGoal(targetProjectId, sectionId)
                                  }
                                  onCompleteGoal={handleCompleteGoal}
                                  onRenameGoal={handleRenameGoal}
                                  onUpdateGoal={handleUpdateGoal}
                                  onDeleteGoal={handleDeleteGoal}
                                  onTaskDropToGoal={handleTaskDropToGoal}
                                  onSectionDropToGoal={handleSectionDropToGoal}
                                  onAddTaskToGoal={handleAddTaskToGoal}
                                  onAddSectionToGoal={handleAddSectionToGoal}
                                  onAddSubGoal={handleAddSubGoal}
                                  userId={currentUserId || ""}
                                />
                              ))}
                              {subGoals.map((sg) => renderUnassignedGoal(sg))}
                              {!hasContent && (
                                <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-center text-xs text-zinc-600">
                                  Drop tasks or a task list here.
                                </div>
                              )}
                            </GoalGroupShell>
                          </div>
                        );
                      };
                      const goalLessUnassigned = projectLevelGoals.length
                        ? visibleUnassignedTasks.filter(
                            (task) => !(task.goalId || (task as any).goal_id),
                          )
                        : visibleUnassignedTasks;

                      if (
                        visibleUnassignedTasks.length === 0 &&
                        projectLevelGoals.length === 0
                      ) {
                        return null;
                      }

                      return (
                        <div className="mt-2">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-lg font-medium text-zinc-400">
                              Ungrouped Tasks
                            </h3>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openAddGoal(projectId)}
                                className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                                title="Add project-level goal"
                                aria-label="Add project-level goal"
                              >
                                <Target className="h-4 w-4" />
                              </button>
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
                          </div>
                          {goalLessUnassigned.length > 0 && (
                            <TaskList
                              tasks={goalLessUnassigned}
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
                              deletingTaskIds={deletingTaskIds}
                              savingTaskIds={savingTaskIds}
                              recentlySavedTaskIds={recentlySavedTaskIds}
                              freshlyUpdatedTaskIds={freshlyUpdatedTaskIds}
                              enableDueDateQuickEdit={true}
                              onTaskFocus={focusTaskRow}
                              onTaskUpdate={handleProjectTaskUpdate}
                              onTaskToggle={handleTaskToggle}
                              onTaskEdit={handleTaskEdit}
                              onTaskDelete={handleTaskDelete}
                              onTaskSelect={handleProjectTaskSelect}
                            />
                          )}
                          {projectLevelGoals.map((goal) =>
                            renderUnassignedGoal(goal),
                          )}
                        </div>
                      );
                    })()}

                    {visibleUnassignedTasks.length === 0 &&
                      visibleProjectSections.length === 0 &&
                      (goalsBySectionId.get(null) || []).length === 0 && (
                        <div className="text-center py-8 text-zinc-500">
                          <p className="mb-4">
                            No matching tasks or sections for the current
                            filters.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openAddSection(projectId, undefined, 0)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                              <FolderPlus className="h-4 w-4" />
                              Add a Section
                            </button>
                            <button
                              type="button"
                              onClick={() => openAddGoal(projectId)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                              <Target className="h-4 w-4" />
                              Add a Goal
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openAddSection(projectId, undefined, 0)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                              <ListChecks className="h-4 w-4" />
                              Add a Task List
                            </button>
                            <button
                              type="button"
                              onClick={() => openAddTask(projectId)}
                              className="inline-flex items-center gap-1.5 rounded-lg btn-theme-primary px-3 py-1.5 text-sm text-white transition-all"
                            >
                              <ListTodo className="h-4 w-4" />
                              Add a Task
                            </button>
                          </div>
                        </div>
                      )}

                    {hasSupplies(visibleProjectTasks as SupplyLike[]) && (
                      <div className="pointer-events-none fixed bottom-24 right-4 z-30 sm:bottom-6 sm:right-24">
                        <div className="pointer-events-auto rounded-lg border border-amber-500/30 bg-zinc-950/95 shadow-lg backdrop-blur">
                          <SupplyTotal
                            items={visibleProjectTasks as SupplyLike[]}
                            label="Supplies total"
                            variant="total"
                            className="border-0 bg-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
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
                    deletingTaskIds={deletingTaskIds}
                    savingTaskIds={savingTaskIds}
                    recentlySavedTaskIds={recentlySavedTaskIds}
                    freshlyUpdatedTaskIds={freshlyUpdatedTaskIds}
                    sectionTasksBySectionId={sectionTasksBySectionId}
                    childSectionsByParentId={sectionChildrenByParent}
                    goalsBySectionId={goalsBySectionId}
                          savingSectionIds={savingSectionIds}
                    goalTasksByGoalId={goalTasksByGoalId}
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
                    onTaskDropToGoal={handleTaskDropToGoal}
                    onAddGoal={(targetProjectId, sectionId) =>
                      openAddGoal(targetProjectId, sectionId)
                    }
                    onCompleteGoal={handleCompleteGoal}
                    onRenameGoal={handleRenameGoal}
                    onUpdateGoal={handleUpdateGoal}
                    onDeleteGoal={handleDeleteGoal}
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

          {showProjectShareModal && (
            <ProjectShareModal
              isOpen
              projectId={projectId}
              projectName={project?.name || "Project"}
              dateFormat={resolvedCurrentUser?.dateFormat}
              onClose={() => setShowProjectShareModal(false)}
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
          onEditTask={handleEditTaskById}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleCloseEmailThreadPopout();
            }
          }}
        />
      </div>
    );
  }

  const sidebarElement = (
    <Sidebar
      data={database}
      onAddTask={() => openAddTask()}
      currentView={view}
      onViewChange={(nextView) => {
        // On mobile, tapping a nav item closes the slide-in drawer.
        if (isMobile) {
          setIsMobileNavOpen(false);
        }
        handleViewChange(nextView);
      }}
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
      onCancelInvite={cancelInvite}
      isAddingTask={showAddTask}
      isLoading={isDataLoading}
      isRefreshing={isRefreshing}
    />
  );

  return (
    <div className="h-screen app-shell-background flex">
      {isMobile ? (
        <>
          {/* Backdrop: tapping it closes the drawer. */}
          {isMobileNavOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setIsMobileNavOpen(false)}
              aria-hidden="true"
            />
          )}
          {/* Slide-in drawer. translate-x off-canvas when closed. */}
          <div
            className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 ${
              isMobileNavOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            role="dialog"
            aria-modal="true"
            aria-hidden={!isMobileNavOpen}
          >
            {sidebarElement}
          </div>
        </>
      ) : (
        sidebarElement
      )}

      <main
        ref={mainScrollRef}
        className="flex-1 min-w-0 text-white overflow-y-auto"
      >
        <div
          className={
            view === "upcoming"
              ? "p-8"
              : view === "estimates"
                ? "p-0"
                : view === "today"
                  ? "p-0"
                  : view.startsWith("email-")
                    ? "px-3 pr-6 py-6"
                    : view === "time"
                      ? "p-6"
                      : view.startsWith("project-")
                        ? projectSectionLayout === "board"
                          ? "p-6"
                          : "w-full p-6 xl:p-8"
                        : "max-w-4xl mx-auto p-8"
          }
        >
          {isMobile && (
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="mb-4 inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-white hover:bg-zinc-800 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
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
          onEditTask={handleEditTaskById}
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

      {taskEmailThreadId && (
        <EmailThreadModal
          open
          threadId={taskEmailThreadId}
          projects={database?.projects || []}
          onRefresh={fetchData}
          onEditTask={handleEditTaskById}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setTaskEmailThreadId(null);
          }}
        />
      )}

      <AiTaskRefinementModal
        open={Boolean(aiRationaleModal)}
        onClose={() => setAiRationaleModal(null)}
        threadId={aiRationaleModal?.threadId ?? null}
        taskName={aiRationaleModal?.taskName ?? ""}
        fallbackRationale={aiRationaleModal?.rationale ?? null}
        taskId={aiRationaleModal?.taskId ?? null}
        isPublic={
          aiRationaleModal
            ? (emailPublicByTaskId[aiRationaleModal.taskId] ?? false)
            : false
        }
        onPublicChange={(taskId, isPublic) =>
          setEmailPublicByTaskId((prev) => ({ ...prev, [taskId]: isPublic }))
        }
      />

      {undoDelete && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50">
          <div className="animate-slide-up-in">
            <div className="flex items-center gap-3 bg-black text-white border border-zinc-800 rounded-lg px-4 py-3 shadow-lg">
              <span className="text-sm">
                Deleted &quot;{undoDelete.taskName}&quot; — moved to{" "}
                <a href="/trash" className="underline underline-offset-4">
                  Trash
                </a>
              </span>
              <button
                onClick={handleUndoDelete}
                className="text-sm font-semibold text-white hover:text-zinc-200 underline underline-offset-4"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
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
        <TaskModalStack
          isOpen
          onClose={() => {
            setShowAddTask(false);
            setAddTaskDefaults({});
          }}
          data={database}
          onSave={handleAddTask}
          onDataRefresh={fetchData}
          defaultProjectId={
            addTaskDefaults.projectId ||
            (view.startsWith("project-")
              ? view.replace("project-", "")
              : undefined)
          }
          defaultSectionId={addTaskDefaults.sectionId}
          defaultGoalId={addTaskDefaults.goalId}
        />
      )}

      {showEditTask && (
        <TaskModalStack
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
          setTaskDeleteConfirm({
            show: false,
            taskId: null,
            taskName: "",
            emailThreadId: null,
            emailAction: "none",
          })
        }
        onConfirm={confirmTaskDelete}
        title="Delete Task"
        description={`Are you sure you want to delete "${taskDeleteConfirm.taskName}"? It will be moved to the Trash, where you can restore it.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      >
        {taskDeleteConfirm.emailThreadId ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-300">
              This task was created from an email. Do something with the email
              too? (Optional)
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: "none", label: "Keep the email as is" },
                  { value: "archive", label: "Archive the email" },
                  { value: "delete", label: "Delete the email too" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="radio"
                    name="delete-email-action"
                    checked={taskDeleteConfirm.emailAction === opt.value}
                    onChange={() =>
                      setTaskDeleteConfirm((prev) => ({
                        ...prev,
                        emailAction: opt.value,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </ConfirmModal>

      <ConfirmModal
        isOpen={sectionDeleteConfirm.show}
        onClose={() =>
          setSectionDeleteConfirm({
            show: false,
            sectionId: null,
            sectionName: "",
            taskIds: [],
            taskAction: "unassign",
          })
        }
        onConfirm={confirmSectionDelete}
        title="Delete Task List"
        description={
          sectionDeleteConfirm.taskIds.length > 0
            ? `Are you sure you want to delete "${sectionDeleteConfirm.sectionName}"? It contains ${sectionDeleteConfirm.taskIds.length} task(s).`
            : `Are you sure you want to delete "${sectionDeleteConfirm.sectionName}"?`
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      >
        {sectionDeleteConfirm.taskIds.length > 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-300">
              What should happen to the tasks in this list?
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  {
                    value: "unassign",
                    label: "Keep them, ungrouped in the project",
                  },
                  { value: "delete", label: "Delete the tasks too" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="radio"
                    name="delete-section-task-action"
                    checked={sectionDeleteConfirm.taskAction === opt.value}
                    onChange={() =>
                      setSectionDeleteConfirm((prev) => ({
                        ...prev,
                        taskAction: opt.value,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </ConfirmModal>

      {showAddSection && (sectionProjectId || view.startsWith("project-")) && (
        <AddSectionModal
          isOpen
          onClose={closeSectionModal}
          onSave={editingSection ? handleUpdateSection : handleAddSection}
          projectId={sectionProjectId || view.replace("project-", "")}
          parentId={sectionParentId}
          goalId={sectionGoalId}
          order={sectionOrder}
          section={editingSection}
        />
      )}

      {view.startsWith("project-") && showAddGoal && (
        <AddGoalModal
          isOpen
          onClose={() => {
            setShowAddGoal(false);
            setAddGoalSectionId(undefined);
            setAddGoalOrder(0);
          }}
          onSave={handleAddGoal}
          projectId={addGoalProjectId || view.replace("project-", "")}
          sectionId={addGoalSectionId}
          order={addGoalOrder}
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
