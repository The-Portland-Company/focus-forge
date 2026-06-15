"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonOrganization } from "@/components/skeleton-loader";
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
  Loader2,
  FileCode2,
  Play,
  Square,
  Hourglass,
  Inbox,
  ShieldAlert,
  Send,
  SlidersHorizontal,
  FlaskConical,
  FileText,
  FolderTree,
  Download,
  X,
  MoreHorizontal,
} from "lucide-react";
import { Database, Project, Task, User as AppUser } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { NavTasksBadge } from "@/components/nav-tasks-modal";
import { ThemeModeToggle } from "@/components/theme-mode-toggle";
import { Tooltip } from "./tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  /** Revoke a pending invitation; parent calls /api/cancel-invite then refreshes. */
  onCancelInvite?: (args: {
    userId: string;
    organizationId?: string;
    projectId?: string;
  }) => Promise<unknown>;
  isAddingTask?: boolean; // Whether the add task modal is open
  isLoading?: boolean; // True on first load before the org/project tree data exists
  isRefreshing?: boolean; // True while a background refetch runs with data present
}

/** One IMAP folder with live message counts (Email Inbox → Folders submenu). */
type SidebarFolder = {
  path: string;
  name: string;
  delimiter: string;
  specialUse?: string | null;
  total: number;
  unseen: number;
  read: number;
};

/** Folders grouped under a single mailbox; `error` set when that mailbox's
 *  IMAP listing failed (other mailboxes still resolve independently). */
type SidebarFolderMailbox = {
  mailboxId: string;
  emailAddress: string;
  folders: SidebarFolder[];
  error?: string;
};

// Client-side folder cache: keep a short-lived snapshot in sessionStorage so
// re-mounting the sidebar (route changes) doesn't re-hit IMAP every time.
const FOLDERS_SESSION_KEY = "emailFoldersCache";
const FOLDERS_TTL_MS = 2 * 60 * 1000; // ~2 min

/** Two-tone count badge: unread in the theme accent, read in muted zinc.
 *  Hidden when there are no items. Used on Email Inbox sub-items. */
function UnreadReadBadge({ unread, total }: { unread: number; total: number }) {
  if (!total) return null;
  const read = Math.max(0, total - unread);
  return (
    <span className="text-xs sm:text-[10px] tabular-nums">
      <span className={unread > 0 ? "text-[rgb(var(--theme-primary-rgb))] font-semibold" : "text-zinc-600"}>
        {unread}
      </span>
      <span className="text-zinc-600">/{read}</span>
    </span>
  );
}

// --- Email "Folders" submenu: dedupe + hierarchy helpers ------------------
//
// Special-use flags (and name fallbacks) for folders that ALREADY have a
// dedicated sidebar item (Inbox, Sent, Drafts, Spam/Junk, Trash) or are noise
// (Gmail "All Mail"). These are hidden from the live Folders tree so the list
// only shows the user's own custom folders/labels. Filtering is done here on
// the client; the API still returns every folder for other consumers.
const REDUNDANT_SPECIAL_USE = new Set([
  "\\Inbox",
  "\\All",
  "\\Drafts",
  "\\Sent",
  "\\Junk",
  "\\Trash",
]);
const REDUNDANT_FOLDER_NAMES = new Set([
  "inbox",
  "all mail",
  "drafts",
  "draft",
  "sent",
  "sent mail",
  "sent items",
  "spam",
  "junk",
  "trash",
  "bin",
  "deleted",
  "deleted items",
  "deleted messages",
  // "Starred" already exists as a dedicated sidebar item above the Folders
  // area (like Drafts/Sent/Spam/Trash). Gmail's "Important" is intentionally
  // NOT hidden — it has no dedicated sidebar item.
  "starred",
]);

// Strip a leading "[Gmail]/" container so "[Gmail]/All Mail" matches "all mail".
function normalizeFolderKey(value: string): string {
  return value
    .replace(/^\[Gmail\]\//i, "")
    .trim()
    .toLowerCase();
}

/** True when a folder duplicates an existing sidebar item or is redundant
 *  noise. Matches primarily on the IMAP special-use flag, then falls back to
 *  a case-insensitive name/path match (top-level only, so a nested custom
 *  folder like "Clients/Sent" is never accidentally hidden). */
function isRedundantFolder(folder: SidebarFolder): boolean {
  if (folder.specialUse && REDUNDANT_SPECIAL_USE.has(folder.specialUse)) {
    return true;
  }
  const path = normalizeFolderKey(folder.path);
  if (REDUNDANT_FOLDER_NAMES.has(path)) return true;
  const delimiter = folder.delimiter || "/";
  const isTopLevel = !folder.path
    .replace(/^\[Gmail\]\//i, "")
    .includes(delimiter);
  if (isTopLevel && REDUNDANT_FOLDER_NAMES.has(normalizeFolderKey(folder.name))) {
    return true;
  }
  return false;
}

/** A node in the folder hierarchy built from each folder's delimiter. */
type FolderNode = {
  folder: SidebarFolder;
  children: FolderNode[];
};

/** Builds a tree from a flat folder list using each folder's delimiter
 *  (e.g. "Clients/Acme" nests "Acme" under "Clients"). When a parent is
 *  missing from the list (filtered out above, or \Noselect), its children are
 *  promoted to roots so nothing disappears. Counts stay per-folder. */
function buildFolderTree(folders: SidebarFolder[]): FolderNode[] {
  const nodeByPath = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodeByPath.set(folder.path, { folder, children: [] });
  }
  const roots: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodeByPath.get(folder.path)!;
    const delimiter = folder.delimiter || "/";
    const idx = delimiter ? folder.path.lastIndexOf(delimiter) : -1;
    const parentPath = idx > 0 ? folder.path.slice(0, idx) : "";
    const parent = parentPath ? nodeByPath.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) =>
      a.folder.name.localeCompare(b.folder.name, undefined, {
        sensitivity: "base",
      }),
    );
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

/** One folder row (used by both the tree and the flat search results).
 *  NOTE on colors: plain IMAP (app-password mailboxes) does NOT expose Gmail
 *  label colors — those require the Gmail REST API with OAuth, which this app
 *  doesn't use. So folders render without colors. We deliberately do NOT
 *  synthesize colors from a hash. */
function FolderRow({
  folder,
  depth,
  hasChildren,
  collapsed,
  onToggle,
}: {
  folder: SidebarFolder;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md py-1 pr-2 text-sm text-zinc-500"
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      title={folder.path}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
            aria-label={collapsed ? "Expand folder" : "Collapse folder"}
            aria-expanded={!collapsed}
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{folder.name || folder.path}</span>
      </span>
      <UnreadReadBadge unread={folder.unseen} total={folder.total} />
    </div>
  );
}

/** Recursively renders folder nodes with indent + per-parent expand/collapse
 *  (default expanded; a node is collapsed when its key is in `collapsed`). */
function FolderTreeNodes({
  nodes,
  mailboxId,
  depth,
  collapsed,
  onToggle,
}: {
  nodes: FolderNode[];
  mailboxId: string;
  depth: number;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const key = `${mailboxId}:${node.folder.path}`;
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsed.has(key);
        return (
          <div key={key}>
            <FolderRow
              folder={node.folder}
              depth={depth}
              hasChildren={hasChildren}
              collapsed={isCollapsed}
              onToggle={() => onToggle(key)}
            />
            {hasChildren && !isCollapsed ? (
              <FolderTreeNodes
                nodes={node.children}
                mailboxId={mailboxId}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

// Canonical default order of the top-level (parent) nav items. The
// Organizations section is reordered as a single block ("organizations").
// Children/sub-items (email accordion rows, org projects) are NOT reordered.
// New/unknown ids fall to the end in their default position on load.
const DEFAULT_NAV_ORDER: readonly string[] = [
  "search",
  "today",
  "email",
  "upcoming",
  "estimates",
  "calendar",
  "organizations",
];
const NAV_ORDER_STORAGE_KEY = "navItemOrder";

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
  onCancelInvite,
  isAddingTask,
  isLoading,
  isRefreshing,
}: SidebarProps) {
  const router = useRouter();
  // Initialize with collapsed state by default
  const [expandedOrgs, setExpandedOrgs] = useState<string[]>([]);
  // Email Inbox is an accordion (default open); state persisted in localStorage.
  const [emailInboxExpanded, setEmailInboxExpanded] = useState<boolean>(true);
  // "Folders" sub-accordion under Email Inbox (default closed); persisted too.
  const [emailFoldersExpanded, setEmailFoldersExpanded] =
    useState<boolean>(false);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [showPendingInvitations, setShowPendingInvitations] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  // When true, the entire Organizations list is hidden (header remains visible).
  // Persisted in localStorage under "organizationsListCollapsed" (default false).
  const [organizationsListCollapsed, setOrganizationsListCollapsed] =
    useState(false);
  // Pending-invitation row currently queued for revoke confirmation.
  const [inviteToRevoke, setInviteToRevoke] = useState<AppUser | null>(null);
  const [revokingInvite, setRevokingInvite] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // --- Parent nav reorder (Edit Mode) ---------------------------------------
  const [navEditMode, setNavEditMode] = useState(false);
  // Persisted order ids; loaded from localStorage on mount (below).
  const [navOrder, setNavOrder] = useState<string[]>([...DEFAULT_NAV_ORDER]);
  const [draggedNavId, setDraggedNavId] = useState<string | null>(null);
  const [dragOverNavId, setDragOverNavId] = useState<string | null>(null);
  const [dragOverNavPosition, setDragOverNavPosition] = useState<
    "top" | "bottom" | null
  >(null);
  const SIDEBAR_MIN_WIDTH = 200;
  const SIDEBAR_MAX_WIDTH = 480;
  const SIDEBAR_DEFAULT_WIDTH = 280;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
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
  const [estimateBacklog, setEstimateBacklog] = useState<number>(0);
  const [storageStats, setStorageStats] = useState<
    Array<{ mailboxId: string; label: string; used: number; total: number }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/email/storage", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.mailboxes)) {
          setStorageStats(json.mailboxes);
        }
      } catch {
        /* non-fatal */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  const [projectPendingDelete, setProjectPendingDelete] = useState<Project | null>(null);
  // Live IMAP folders for the Email Inbox "Folders" sub-accordion. Lazy-loaded
  // on first expand; cached in sessionStorage (~2 min) so re-mounts don't refetch.
  const [folderMailboxes, setFolderMailboxes] = useState<SidebarFolderMailbox[]>(
    [],
  );
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const foldersFetchedAtRef = useRef<number>(0);
  // Folder tree UI state: live search query + the set of collapsed parent keys
  // ("<mailboxId>:<path>"). Folders default to expanded (absent from the set).
  const [folderSearch, setFolderSearch] = useState("");
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleFolderCollapsed = (key: string) => {
    setCollapsedFolderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/tasks/unestimated?total=1", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && typeof json?.total === "number") {
          setEstimateBacklog(json.total);
        }
      } catch {
        /* non-fatal */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

      // Load Organizations-list collapsed state (default false = list shown)
      const storedOrgsListCollapsed = localStorage.getItem(
        "organizationsListCollapsed",
      );
      if (storedOrgsListCollapsed === "true") {
        setOrganizationsListCollapsed(true);
      }

      // Load collapsed state
      const storedCollapsed = localStorage.getItem("sidebarCollapsed");
      if (storedCollapsed === "true") {
        setIsCollapsed(true);
      }

      // Load Email Inbox accordion state (default open)
      const storedEmailInbox = localStorage.getItem("emailInboxExpanded");
      if (storedEmailInbox === "false") {
        setEmailInboxExpanded(false);
      }

      // Load Email "Folders" sub-accordion state (default closed)
      const storedEmailFolders = localStorage.getItem("emailFoldersExpanded");
      if (storedEmailFolders === "true") {
        setEmailFoldersExpanded(true);
      }

      // Load persisted sidebar width
      const storedWidth = localStorage.getItem("ffSidebarWidth");
      if (storedWidth) {
        const parsedWidth = parseInt(storedWidth, 10);
        if (!Number.isNaN(parsedWidth)) {
          setSidebarWidth(
            Math.min(
              SIDEBAR_MAX_WIDTH,
              Math.max(SIDEBAR_MIN_WIDTH, parsedWidth),
            ),
          );
        }
      }

      // Load persisted parent-nav order (reconciled against the default).
      const storedNavOrder = localStorage.getItem(NAV_ORDER_STORAGE_KEY);
      if (storedNavOrder) {
        try {
          const parsed = JSON.parse(storedNavOrder);
          if (Array.isArray(parsed)) {
            // Reconcile inline (keep known ids in stored order, append any
            // new/unknown default ids at the end) to avoid an effect dependency.
            const stored = parsed.filter((x) => typeof x === "string");
            const known = stored.filter((id) => DEFAULT_NAV_ORDER.includes(id));
            const missing = DEFAULT_NAV_ORDER.filter(
              (id) => !known.includes(id),
            );
            setNavOrder([...known, ...missing]);
          }
        } catch (e) {
          console.error("Failed to parse saved nav order:", e);
        }
      }

      setHasLoadedPreferences(true);
    }
  }, [hasLoadedPreferences]);

  // Persist the parent-nav order whenever it changes (after initial load).
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(navOrder));
    }
  }, [navOrder, hasLoadedPreferences]);

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

  // Persist the Organizations-list collapsed state.
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem(
        "organizationsListCollapsed",
        String(organizationsListCollapsed),
      );
    }
  }, [organizationsListCollapsed, hasLoadedPreferences]);

  // Persist Email Inbox accordion state.
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem("emailInboxExpanded", String(emailInboxExpanded));
    }
  }, [emailInboxExpanded, hasLoadedPreferences]);

  // Persist Email "Folders" sub-accordion state.
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem(
        "emailFoldersExpanded",
        String(emailFoldersExpanded),
      );
    }
  }, [emailFoldersExpanded, hasLoadedPreferences]);

  // Save collapsed state to localStorage
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem("sidebarCollapsed", isCollapsed.toString());
    }
  }, [isCollapsed, hasLoadedPreferences]);

  // Persist sidebar width to localStorage
  useEffect(() => {
    if (hasLoadedPreferences) {
      localStorage.setItem("ffSidebarWidth", String(sidebarWidth));
    }
  }, [sidebarWidth, hasLoadedPreferences]);

  // Handle drag-to-resize of the sidebar width
  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (event: MouseEvent) => {
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, event.clientX),
      );
      setSidebarWidth(next);
    };
    const handleMouseUp = () => setIsResizingSidebar(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizingSidebar]);

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

        const response = await fetch(
          `/api/v1/time/entries/${currentTimerEntryId}`,
          {
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
          },
        );
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

  // Reorder a parent nav item within navOrder based on the current drag/drop
  // target and position (top/bottom of the target row). Mirrors the org/project
  // native-DnD reorder logic used elsewhere in this sidebar.
  const reorderNavItems = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setNavOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const target = prev.indexOf(targetId);
      if (from === -1 || target === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      const insertIndex =
        dragOverNavPosition === "bottom" ? target + 1 : target;
      next.splice(insertIndex > from ? insertIndex - 1 : insertIndex, 0, removed);
      return next;
    });
  };

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs((prev) =>
      prev.includes(orgId)
        ? prev.filter((id) => id !== orgId)
        : [...prev, orgId],
    );
  };

  // Lazy-load the live IMAP folder list. Reuses a fresh sessionStorage snapshot
  // unless `force` is set; otherwise hits /api/email/folders and re-caches.
  const loadFolders = async (force = false) => {
    if (!force) {
      try {
        const raw = sessionStorage.getItem(FOLDERS_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            fetchedAt?: number;
            mailboxes?: SidebarFolderMailbox[];
          };
          if (
            parsed &&
            typeof parsed.fetchedAt === "number" &&
            Array.isArray(parsed.mailboxes) &&
            Date.now() - parsed.fetchedAt < FOLDERS_TTL_MS
          ) {
            setFolderMailboxes(parsed.mailboxes);
            foldersFetchedAtRef.current = parsed.fetchedAt;
            return;
          }
        }
      } catch {
        /* ignore malformed cache */
      }
    }

    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const res = await fetch("/api/email/folders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load folders");
      const json = await res.json();
      const mailboxes: SidebarFolderMailbox[] = Array.isArray(json?.mailboxes)
        ? json.mailboxes
        : [];
      setFolderMailboxes(mailboxes);
      const fetchedAt = Date.now();
      foldersFetchedAtRef.current = fetchedAt;
      try {
        sessionStorage.setItem(
          FOLDERS_SESSION_KEY,
          JSON.stringify({ fetchedAt, mailboxes }),
        );
      } catch {
        /* sessionStorage unavailable; non-fatal */
      }
    } catch (e) {
      setFoldersError(
        e instanceof Error ? e.message : "Failed to load folders",
      );
    } finally {
      setFoldersLoading(false);
    }
  };

  // Toggle the Folders sub-accordion; fetch on expand when the cache is stale.
  const toggleEmailFolders = () => {
    setEmailFoldersExpanded((prev) => {
      const next = !prev;
      if (next && Date.now() - foldersFetchedAtRef.current >= FOLDERS_TTL_MS) {
        void loadFolders();
      }
      return next;
    });
  };

  // Hydrate folders when the section is restored open on mount (loadFolders
  // reuses the sessionStorage snapshot when it's still fresh).
  useEffect(() => {
    if (hasLoadedPreferences && emailInboxExpanded && emailFoldersExpanded) {
      void loadFolders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoadedPreferences]);

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

  // Resolve the organization a pending user was invited to (via memberIds).
  const organizationIdForUser = (userId: string): string | undefined =>
    data.organizations.find((org) => org.memberIds?.includes(userId))?.id;

  const handleRevokeInvite = async (user: AppUser) => {
    setRevokingInvite(true);
    try {
      if (onCancelInvite) {
        await onCancelInvite({
          userId: user.id,
          organizationId: organizationIdForUser(user.id),
        });
      } else {
        // No parent handler wired — call the existing endpoint directly so the
        // invite is still revoked; the parent should re-fetch to refresh the list.
        const response = await fetch("/api/cancel-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: user.id,
            organizationId: organizationIdForUser(user.id),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to revoke invitation");
        }
      }
      setInviteToRevoke(null);
    } catch (error) {
      console.error("Revoke invite error:", error);
      alert(
        error instanceof Error
          ? `Failed to revoke invitation: ${error.message}`
          : "Failed to revoke invitation",
      );
    } finally {
      setRevokingInvite(false);
    }
  };

  // Get pending users
  const pendingUsers = data.users?.filter((u) => u.status === "pending") || [];

  const todayBadgeCount = useMemo(() => {
    const activeTodayTasks = filterTasksByBlockedStatus(
      data.tasks.filter((task) => {
        if (task.completed) return false;

        const dueDate =
          (task as { due_date?: string }).due_date || task.dueDate;
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

    const todayEmailCount = data.inboxItems.filter(
      shouldShowInboxItemInToday,
    ).length;

    return activeTodayTasks.length + todayEmailCount;
  }, [data.inboxItems, data.tasks]);

  const inboxItemsCount = useMemo(() => {
    const visibleInboxItems = data.inboxItems.filter(
      (item) =>
        item.status !== "quarantine" &&
        item.status !== "deleted" &&
        item.status !== "archived" &&
        item.status !== "resolved" &&
        item.origin !== "outbound",
    );

    return {
      total: visibleInboxItems.length,
      unread: visibleInboxItems.filter((item) => item.isUnread).length,
    };
  }, [data.inboxItems]);

  // Active (incomplete) task counts per project, per organization, and overall —
  // shown as badges in the Organizations accordion.
  const orgTaskCounts = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const task of data.tasks) {
      if (task.completed) continue;
      const pid = (task as any).project_id || task.projectId;
      if (typeof pid === "string") byProject.set(pid, (byProject.get(pid) || 0) + 1);
    }
    const byOrg = new Map<string, number>();
    let total = 0;
    for (const project of data.projects) {
      const count = byProject.get(project.id) || 0;
      const oid = (project as any).organization_id || project.organizationId;
      if (typeof oid === "string") byOrg.set(oid, (byOrg.get(oid) || 0) + count);
      total += count;
    }
    return { byProject, byOrg, total };
  }, [data.tasks, data.projects]);

  // All tasks (complete + incomplete) grouped by project and by org, plus a
  // project-id → name map. Reused by the click/hover task modal so it shows the
  // full list behind each badge count without a new API call.
  const tasksByProjectId = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const task of data.tasks) {
      const pid = (task as any).project_id || task.projectId;
      if (typeof pid !== "string") continue;
      const arr = m.get(pid);
      if (arr) arr.push(task);
      else m.set(pid, [task]);
    }
    return m;
  }, [data.tasks]);

  const tasksByOrgId = useMemo(() => {
    const projectOrg = new Map<string, string>();
    for (const project of data.projects) {
      const oid = (project as any).organization_id || project.organizationId;
      if (typeof oid === "string") projectOrg.set(project.id, oid);
    }
    const m = new Map<string, Task[]>();
    for (const [pid, arr] of tasksByProjectId.entries()) {
      const oid = projectOrg.get(pid);
      if (!oid) continue;
      const existing = m.get(oid);
      if (existing) existing.push(...arr);
      else m.set(oid, [...arr]);
    }
    return m;
  }, [tasksByProjectId, data.projects]);

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const project of data.projects) m.set(project.id, project.name);
    return m;
  }, [data.projects]);

  const sentItemsCount = useMemo(() => {
    const sentItems = data.inboxItems.filter(
      (item) =>
        item.status !== "quarantine" &&
        item.status !== "deleted" &&
        (item.origin === "outbound" || item.origin === "mixed"),
    );

    return {
      total: sentItems.length,
      unread: sentItems.filter((item) => item.isUnread).length,
    };
  }, [data.inboxItems]);

  const trashItemsCount = useMemo(() => {
    const deletedItems = data.inboxItems.filter(
      (item) => item.status === "deleted",
    );

    return {
      total: deletedItems.length,
      unread: deletedItems.filter((item) => item.isUnread).length,
    };
  }, [data.inboxItems]);

  // Per-sub-item unread/total counts for two-tone badges.
  const quarantineItemsCount = useMemo(() => {
    const quarantineItems = data.inboxItems.filter(
      (item) => item.status === "quarantine",
    );
    return {
      total: quarantineItems.length || data.quarantineCount || 0,
      unread: quarantineItems.filter((item) => item.isUnread).length,
    };
  }, [data.inboxItems, data.quarantineCount]);

  const rulesCount = useMemo(() => {
    const rules = (data as any).emailRules;
    if (!Array.isArray(rules)) return 0;
    return rules.filter((r: any) => r?.isActive !== false).length;
  }, [data]);

  const orgProjects = (orgId: string) =>
    data.projects
      .filter((project) => {
        const projectOrgId =
          (project as any).organization_id ?? project.organizationId;
        return projectOrgId === orgId && !project.archived;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));

  const formatGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

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

  // Wraps a single parent nav item. Applies the persisted order via CSS
  // `order` (so the surrounding JSX never has to move) and, in Edit Mode, makes
  // the row drag-reorderable using the same native HTML5 DnD pattern as the
  // org/project reordering elsewhere in this sidebar.
  const NavReorderWrapper = ({
    id,
    children,
  }: {
    id: string;
    children: React.ReactNode;
  }) => {
    const orderIndex = navOrder.indexOf(id);
    const isDragged = draggedNavId === id;
    const overTop =
      dragOverNavId === id && draggedNavId && dragOverNavPosition === "top";
    const overBottom =
      dragOverNavId === id && draggedNavId && dragOverNavPosition === "bottom";
    return (
      <div
        // +1 so reorderable items always sit below the pinned Edit/timer rows.
        style={{ order: orderIndex === -1 ? 999 : orderIndex + 1 }}
        draggable={navEditMode}
        // In edit mode, swallow clicks so dragging a row never navigates.
        onClickCapture={
          navEditMode
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
        onDragStart={
          navEditMode
            ? (e) => {
                setDraggedNavId(id);
                e.dataTransfer.effectAllowed = "move";
                setTimeout(() => e.currentTarget.classList.add("dragging"), 0);
              }
            : undefined
        }
        onDragEnd={
          navEditMode
            ? (e) => {
                e.currentTarget.classList.remove("dragging");
                setDraggedNavId(null);
                setDragOverNavId(null);
                setDragOverNavPosition(null);
              }
            : undefined
        }
        onDragOver={
          navEditMode
            ? (e) => {
                e.preventDefault();
                if (!draggedNavId || draggedNavId === id) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                setDragOverNavId(id);
                setDragOverNavPosition(y < rect.height / 2 ? "top" : "bottom");
              }
            : undefined
        }
        onDragLeave={
          navEditMode
            ? () => {
                setDragOverNavId(null);
                setDragOverNavPosition(null);
              }
            : undefined
        }
        onDrop={
          navEditMode
            ? (e) => {
                e.preventDefault();
                if (draggedNavId && draggedNavId !== id) {
                  reorderNavItems(draggedNavId, id);
                }
                setDraggedNavId(null);
                setDragOverNavId(null);
                setDragOverNavPosition(null);
              }
            : undefined
        }
        className={`${navEditMode ? "relative cursor-move rounded-lg ring-1 ring-zinc-800" : ""} ${
          isDragged ? "opacity-50" : ""
        } ${overTop ? "drag-over-top" : ""} ${overBottom ? "drag-over-bottom" : ""}`}
      >
        {navEditMode && !isCollapsed ? (
          <span
            className="pointer-events-none absolute left-0 top-1/2 z-10 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        ) : null}
        {children}
      </div>
    );
  };

  return (
    <div
      className={`group/sidebar relative ${isCollapsed ? "w-[60px]" : ""} h-full shrink-0 overflow-hidden bg-zinc-900 border-r border-zinc-800 flex flex-col ${isResizingSidebar ? "" : "transition-all duration-300"}`}
      style={isCollapsed ? undefined : { width: sidebarWidth }}
    >
      <div className={`${isCollapsed ? "p-2" : "px-1.5 py-3"}`}>
        <div className="relative flex items-center justify-between mb-3">
          {!isCollapsed ? (
            <>
              {/* -ml-1.5 negates the header's px-1.5, so the memoji sits snug
                  against the left edge with little/no horizontal spacing. */}
              <div className="flex items-center gap-1.5 rounded-lg min-w-0 -ml-1.5">
                <UserAvatar
                  name={
                    data.users?.[0]?.name ||
                    data.users?.[0]?.firstName ||
                    "User"
                  }
                  profileColor={data.users?.[0]?.profileColor}
                  memoji={data.users?.[0]?.profileMemoji}
                  size={60}
                  className="flex-shrink-0 text-base"
                />
                <div className="text-sm text-white font-medium leading-none">
                  {data.users?.[0]?.firstName || "User"}
                </div>
              </div>
              {/* Header actions: hidden by default, revealed on hover of this
                  group (or focus-within for keyboard a11y). The MoreHorizontal
                  trigger is the always-visible affordance; the action buttons
                  fade/slide in. Uses Tailwind group-hover/focus-within so it
                  works without extra JS. */}
              <div className="group/header-actions flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Show actions"
                  title="Actions"
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group/trigger group-hover/header-actions:opacity-0 group-hover/header-actions:pointer-events-none group-focus-within/header-actions:opacity-0 group-focus-within/header-actions:pointer-events-none"
                >
                  <MoreHorizontal className="w-5 h-5 text-zinc-400 group-hover/trigger:text-white transition-colors" />
                </button>
                <div className="absolute right-1 flex items-center gap-1 opacity-0 pointer-events-none translate-x-1 transition-all duration-150 group-hover/header-actions:opacity-100 group-hover/header-actions:pointer-events-auto group-hover/header-actions:translate-x-0 group-focus-within/header-actions:opacity-100 group-focus-within/header-actions:pointer-events-auto group-focus-within/header-actions:translate-x-0">
                  {/* Nav-reorder Edit/Done toggle, relocated here from the
                      top of <nav>. Toggles navEditMode; the reorderable nav
                      rows pick up the change via NavReorderWrapper. */}
                  <button
                    type="button"
                    onClick={() => {
                      setNavEditMode((v) => !v);
                      setDraggedNavId(null);
                      setDragOverNavId(null);
                      setDragOverNavPosition(null);
                    }}
                    aria-pressed={navEditMode}
                    title={navEditMode ? "Done" : "Edit navigation"}
                    className={`p-2 rounded-lg transition-colors group ${
                      navEditMode
                        ? "bg-theme-gradient"
                        : "hover:bg-zinc-800"
                    }`}
                  >
                    {navEditMode ? (
                      <Check className="w-5 h-5 text-white transition-colors" />
                    ) : (
                      <SlidersHorizontal className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                    )}
                  </button>
                  <Link
                    href="/trash"
                    className="p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                    title="Trash"
                  >
                    <Trash2 className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                  </Link>
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
            <Tooltip content="Add Task" side="bottom" className="flex-1">
              <button
                onClick={onAddTask}
                aria-label="Add Task"
                className={`w-full text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-all ${
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
            </Tooltip>

            <Tooltip content="Add Project" side="bottom" className="flex-1">
              <button
                onClick={onAddProjectGeneral}
                aria-label="Add Project"
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
                title="Add Project"
              >
                <Folder className="w-4 h-4" />
              </button>
            </Tooltip>

            <Tooltip content="Add Organization" side="bottom" className="flex-1">
              <button
                onClick={onAddOrganization}
                aria-label="Add Organization"
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-2 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
                title="Add Organization"
              >
                <Building2 className="w-4 h-4" />
              </button>
            </Tooltip>
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
        className={`flex flex-1 flex-col ${isCollapsed ? "px-1" : "px-1.5"} overflow-y-auto`}
      >
        {/* Nav-reorder toggle moved into the header hover-reveal toolbar.
            The timer row below stays pinned (order:0) above the reorderable
            items. In collapsed mode the toggle is reachable from the header. */}
        <div style={{ order: 0 }}>
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
                    ? "text-white"
                    : currentTimerStartedAt
                      ? "text-[rgb(var(--theme-primary-rgb))] hover:text-white"
                      : "text-zinc-400 hover:text-white"
                }`}
              >
                <Clock
                  className={`w-4 h-4 ${
                    currentTimerStartedAt
                      ? "animate-spin [animation-duration:8s]"
                      : ""
                  }`}
                />
              </Link>
            </Tooltip>
            <Tooltip
              content={currentTimerStartedAt ? "Stop timer" : "Start timer"}
            >
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
            <div
              className={`min-w-0 flex-1 flex items-center justify-between gap-2 pl-1.5 pr-2 py-1 rounded-lg text-sm transition-colors ${
                currentView === "time"
                  ? "text-white"
                  : currentTimerStartedAt
                    ? "text-[rgb(var(--theme-primary-rgb))] hover:text-white"
                    : "text-zinc-400 hover:text-white"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {/* Interactive clock: on hover (when idle) it swaps to a Play
                    icon to start a session; while a session is running it
                    shows an animated, theme-colored clock and clicking stops
                    it. Uses the existing openTimerModal start/stop flow. */}
                <button
                  type="button"
                  onClick={() =>
                    openTimerModal(currentTimerStartedAt ? "stop" : "start")
                  }
                  aria-label={
                    currentTimerStartedAt
                      ? "Stop Focus: Time session"
                      : "Start Focus: Time session"
                  }
                  title={
                    currentTimerStartedAt
                      ? "Stop Focus: Time"
                      : "Start Focus: Time"
                  }
                  className="group/focusclock relative shrink-0 inline-flex h-4 w-4 items-center justify-center"
                >
                  {currentTimerStartedAt ? (
                    <>
                      {/* Running: animated, brand-colored clock. Swaps to a
                          Square (stop) on hover. */}
                      <Clock className="h-4 w-4 animate-spin text-[rgb(var(--theme-primary-rgb))] group-hover/focusclock:opacity-0 transition-opacity [animation-duration:8s]" />
                      <Square className="absolute inset-0 h-4 w-4 opacity-0 group-hover/focusclock:opacity-100 transition-opacity text-[rgb(var(--theme-primary-rgb))]" />
                    </>
                  ) : (
                    <>
                      {/* Idle: clock by default, reveals a Play on hover. */}
                      <Clock className="h-4 w-4 group-hover/focusclock:opacity-0 transition-opacity" />
                      <Play className="absolute inset-0 h-4 w-4 opacity-0 group-hover/focusclock:opacity-100 transition-opacity text-[rgb(var(--theme-primary-rgb))]" />
                    </>
                  )}
                </button>
                <Link
                  href="/time"
                  className="truncate hover:underline"
                >
                  {currentTimerLabel}
                </Link>
              </span>
              <Link
                href="/time"
                className={`shrink-0 font-mono text-xs ${
                  currentTimerStartedAt
                    ? "text-[rgb(var(--theme-primary-rgb))] animate-pulse"
                    : ""
                }`}
              >
                {currentTimerElapsed}
              </Link>
            </div>
            {/* Desktop (macOS) app download. No in-repo URL exists yet; the
                docs designate GitHub Releases as the distribution channel, so
                this links to the latest published build. */}
            <Tooltip content="Download desktop app" className="shrink-0">
              <a
                href="/desktop"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download desktop app"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/70 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <Download className="h-4 w-4" />
              </a>
            </Tooltip>
            <Tooltip
              content={currentTimerStartedAt ? "Stop timer" : "Start timer"}
              className="shrink-0"
            >
              <button
                type="button"
                onClick={() =>
                  openTimerModal(currentTimerStartedAt ? "stop" : "start")
                }
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
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
        </div>

        <NavReorderWrapper id="search">
        {isCollapsed ? (
          <Tooltip content="Search">
            <Link
              href="/search"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "search"
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Search className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/search"
            className={`w-full flex items-center gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
              currentView === "search"
                ? "text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Search className="w-4 h-4" />
            Search
          </Link>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="today">
        {isCollapsed ? (
          <Tooltip content="Today">
            <Link
              href="/today"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "today"
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/today"
            className={`w-full flex items-center justify-between gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
              currentView === "today"
                ? "text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <Calendar className="w-4 h-4" />
              Today
            </span>
            {todayBadgeCount > 0 ? (
              <Tooltip content="Tasks due today" className="">
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                  {todayBadgeCount}
                </span>
              </Tooltip>
            ) : null}
          </Link>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="email">
        {isCollapsed ? (
          <Tooltip
            content={
              inboxItemsCount.unread > 0
                ? `Email Inbox (${inboxItemsCount.unread} unread)`
                : "Email Inbox"
            }
          >
            <Link
              href="/email-inbox"
              className={`relative w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView.startsWith("email-")
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Mail className="w-4 h-4" />
              {inboxItemsCount.unread > 0 ? (
                <span className="absolute -top-0.5 right-0.5 min-w-[16px] rounded-full bg-[rgb(var(--theme-primary-rgb))] px-1 text-center text-xs sm:text-[9px] font-semibold leading-[15px] text-white">
                  {inboxItemsCount.unread > 99 ? "99+" : inboxItemsCount.unread}
                </span>
              ) : null}
            </Link>
          </Tooltip>
        ) : (
          <div>
            {/* Email Inbox: a Link for navigation + a chevron to toggle the
                accordion of sub-items (Inbox, Quarantine, Trash, Sent, Rules,
                AI Lab). State persisted in localStorage as "emailInboxExpanded". */}
            <div className="flex items-center gap-1">
              <Link
                href="/email-inbox"
                className={`flex-1 flex items-center justify-between gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
                  currentView.startsWith("email-")
                    ? "text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Mail className="w-4 h-4" />
                  Email Inbox
                </span>
                {inboxItemsCount.unread > 0 ? (
                  <Tooltip content="Unread emails" className="">
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      {inboxItemsCount.unread}
                    </span>
                  </Tooltip>
                ) : null}
              </Link>
              <button
                onClick={() => setEmailInboxExpanded((v) => !v)}
                className="p-1 rounded hover:bg-zinc-800 transition-colors group flex-shrink-0"
                aria-label={emailInboxExpanded ? "Collapse Email Inbox" : "Expand Email Inbox"}
                aria-expanded={emailInboxExpanded}
              >
                <ChevronRight
                  className={`w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-transform ${emailInboxExpanded ? "rotate-90" : ""}`}
                />
              </button>
            </div>
            {emailInboxExpanded && (
              <div className="mt-1 ml-4 space-y-0.5 rounded-lg bg-zinc-800/40 p-1">
                <Link
                  href="/email-inbox"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-inbox"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Inbox className="w-4 h-4" />
                    Inbox
                  </span>
                  <Tooltip content="Unread / read emails" className="">
                    <UnreadReadBadge unread={inboxItemsCount.unread} total={inboxItemsCount.total} />
                  </Tooltip>
                </Link>
                <Link
                  href="/email-starred"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-starred"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Starred
                  </span>
                </Link>
                <Link
                  href="/email-drafts"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-drafts"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Drafts
                  </span>
                </Link>
                <Link
                  href="/email-quarantine"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-quarantine"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    Quarantine
                  </span>
                  <Tooltip content="Unread / read quarantined emails" className="">
                    <UnreadReadBadge unread={quarantineItemsCount.unread} total={quarantineItemsCount.total} />
                  </Tooltip>
                </Link>
                <Link
                  href="/email-trash"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-trash"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Trash
                  </span>
                  <Tooltip content="Unread / read deleted emails" className="">
                    <UnreadReadBadge unread={trashItemsCount.unread} total={trashItemsCount.total} />
                  </Tooltip>
                </Link>
                <Link
                  href="/email-sent"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-sent"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Sent
                  </span>
                  <Tooltip content="Unread / read sent emails" className="">
                    <UnreadReadBadge unread={sentItemsCount.unread} total={sentItemsCount.total} />
                  </Tooltip>
                </Link>
                <Link
                  href="/email-rules"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-rules"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    Rules
                  </span>
                  {rulesCount > 0 ? (
                    <Tooltip content="Active rules" className="">
                      <span className="text-xs sm:text-[10px] text-zinc-500">{rulesCount}</span>
                    </Tooltip>
                  ) : null}
                </Link>
                <Link
                  href="/email-ai-lab"
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors ${
                    currentView === "email-ai-lab"
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <FlaskConical className="w-4 h-4" />
                  AI Lab
                </Link>

                {/* Folders: live IMAP folder list w/ unread/read counts. Its own
                    chevron sub-accordion; display-only (v1, no navigation). */}
                <div>
                  <button
                    type="button"
                    onClick={toggleEmailFolders}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors hover:text-zinc-200"
                    aria-expanded={emailFoldersExpanded}
                    aria-label={
                      emailFoldersExpanded
                        ? "Collapse Folders"
                        : "Expand Folders"
                    }
                  >
                    <span className="flex items-center gap-2">
                      <FolderTree className="w-4 h-4" />
                      Folders
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${emailFoldersExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                  {emailFoldersExpanded && (
                    <div className="mt-0.5 ml-2 space-y-0.5 border-l border-zinc-800 pl-1.5">
                      {/* Live folder search: case-insensitive substring on
                          name AND full path. When searching we render flat
                          matches instead of the tree. */}
                      <div className="relative px-1 pb-1 pt-0.5">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600" />
                        <input
                          type="text"
                          value={folderSearch}
                          onChange={(e) => setFolderSearch(e.target.value)}
                          placeholder="Search folders"
                          className="h-7 w-full rounded-md border border-zinc-800 bg-zinc-950/60 pl-7 pr-6 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
                        />
                        {folderSearch ? (
                          <button
                            type="button"
                            onClick={() => setFolderSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
                            aria-label="Clear folder search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      {foldersLoading && folderMailboxes.length === 0 ? (
                        <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading folders…
                        </div>
                      ) : foldersError ? (
                        <div className="px-2 py-1 text-xs text-zinc-600">
                          {foldersError}
                        </div>
                      ) : folderMailboxes.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-zinc-600">
                          No folders
                        </div>
                      ) : (
                        folderMailboxes.map((mb) => {
                          // Hide folders that duplicate existing sidebar items
                          // (Inbox/Sent/Drafts/Spam/Trash/All Mail), then build
                          // the hierarchy from the survivors.
                          const visibleFolders = mb.folders.filter(
                            (f) => !isRedundantFolder(f),
                          );
                          const query = folderSearch.trim().toLowerCase();
                          const searching = query.length > 0;
                          const matches = searching
                            ? visibleFolders.filter(
                                (f) =>
                                  f.name.toLowerCase().includes(query) ||
                                  f.path.toLowerCase().includes(query),
                              )
                            : [];
                          const tree = searching
                            ? []
                            : buildFolderTree(visibleFolders);
                          return (
                            <div key={mb.mailboxId} className="space-y-0.5">
                              {folderMailboxes.length > 1 ? (
                                <div
                                  className="truncate px-2 pt-1 text-xs sm:text-[10px] font-medium uppercase tracking-wide text-zinc-600"
                                  title={mb.emailAddress}
                                >
                                  {mb.emailAddress}
                                </div>
                              ) : null}
                              {mb.error ? (
                                <div
                                  className="px-2 py-1 text-xs text-zinc-600"
                                  title={mb.error}
                                >
                                  {mb.error}
                                </div>
                              ) : visibleFolders.length === 0 ? (
                                <div className="px-2 py-1 text-xs text-zinc-600">
                                  No folders
                                </div>
                              ) : searching ? (
                                matches.length === 0 ? (
                                  <div className="px-2 py-1 text-xs text-zinc-600">
                                    No matches
                                  </div>
                                ) : (
                                  matches.map((folder) => (
                                    <FolderRow
                                      key={`${mb.mailboxId}:${folder.path}`}
                                      folder={folder}
                                      depth={0}
                                      hasChildren={false}
                                      collapsed={false}
                                    />
                                  ))
                                )
                              ) : (
                                <FolderTreeNodes
                                  nodes={tree}
                                  mailboxId={mb.mailboxId}
                                  depth={0}
                                  collapsed={collapsedFolderKeys}
                                  onToggle={toggleFolderCollapsed}
                                />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="upcoming">
        {isCollapsed ? (
          <Tooltip content="Upcoming">
            <Link
              href="/upcoming"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "upcoming"
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <CalendarDays className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/upcoming"
            className={`w-full flex items-center gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
              currentView === "upcoming"
                ? "text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Upcoming
          </Link>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="estimates">
        {isCollapsed ? (
          <Tooltip content="Estimates">
            <Link
              href="/estimates"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "estimates"
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Hourglass className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/estimates"
            className={`w-full flex items-center justify-between gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
              currentView === "estimates"
                ? "text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-3">
              <Hourglass className="w-4 h-4" />
              Estimates
            </span>
            {estimateBacklog > 0 ? (
              <Tooltip content="Tasks awaiting estimate" className="">
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                  {estimateBacklog}
                </span>
              </Tooltip>
            ) : null}
          </Link>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="calendar">
        {isCollapsed ? (
          <Tooltip content="Calendar">
            <Link
              href="/calendar"
              className={`w-full flex items-center justify-center px-2 py-2 rounded-lg text-sm transition-colors ${
                currentView === "calendar"
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/calendar"
            className={`w-full flex items-center gap-3 px-3 py-1 rounded-lg text-sm transition-colors ${
              currentView === "calendar"
                ? "text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </Link>
        )}
        </NavReorderWrapper>

        <NavReorderWrapper id="organizations">
        {!isCollapsed && (
          <div className="flex items-center justify-between px-3 py-1 mb-0">
            <button
              onClick={() =>
                setOrganizationsListCollapsed((prev) => !prev)
              }
              className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase hover:text-zinc-300 transition-colors group"
              title={
                organizationsListCollapsed
                  ? "Show organizations"
                  : "Hide organizations"
              }
              aria-expanded={!organizationsListCollapsed}
            >
              <ChevronRight
                className={`w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform ${organizationsListCollapsed ? "" : "rotate-90"}`}
              />
              Organizations
              {isRefreshing ? (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
              ) : null}
              {orgTaskCounts.total > 0 ? (
                <Tooltip
                  content={`${orgTaskCounts.total} active tasks across all organizations`}
                  className=""
                >
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] tracking-wide text-zinc-400">
                    {orgTaskCounts.total}
                  </span>
                </Tooltip>
              ) : null}
            </button>
            {!organizationsListCollapsed && (
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
            )}
          </div>
        )}

        <div
          className="space-y-0"
          hidden={!isCollapsed && organizationsListCollapsed}
        >
          {isLoading && !isCollapsed ? (
            <div className="space-y-4 px-1 pt-1">
              <SkeletonOrganization />
              <SkeletonOrganization />
            </div>
          ) : isLoading && isCollapsed ? (
            <div className="space-y-2 pt-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-center px-2 py-2">
                  <Skeleton className="w-5 h-5 rounded-full" />
                </div>
              ))}
            </div>
          ) : isCollapsed
            ? // Collapsed view - show only organization dots
              data.organizations
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((org) => (
                  <Tooltip key={org.id} content={org.name}>
                    <Link
                      href={`/org-${org.id}`}
                      className={`w-full flex items-center justify-center px-2 py-2 rounded-lg transition-colors ${
                        currentView === `org-${org.id}`
                          ? "ring-1 ring-inset ring-zinc-500"
                          : ""
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
                        {(orgTaskCounts.byOrg.get(org.id) || 0) > 0 ? (
                          <NavTasksBadge
                            name={org.name}
                            kind="organization"
                            tasks={tasksByOrgId.get(org.id) || []}
                            projectNameById={projectNameById}
                            triggerClassName="block min-w-[18px] flex-shrink-0 text-right text-xs sm:text-[10px] tabular-nums text-zinc-500 transition-colors hover:text-zinc-200"
                          />
                        ) : (
                          <span className="block min-w-[18px] flex-shrink-0 text-right text-xs sm:text-[10px] tabular-nums text-zinc-500">
                            0
                          </span>
                        )}
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
                                  ? "text-white"
                                  : "text-zinc-400 hover:text-white"
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
                              {(orgTaskCounts.byProject.get(project.id) || 0) >
                              0 ? (
                                <NavTasksBadge
                                  name={project.name}
                                  kind="project"
                                  tasks={tasksByProjectId.get(project.id) || []}
                                  triggerClassName="block min-w-[16px] flex-shrink-0 text-right text-xs sm:text-[10px] tabular-nums text-zinc-500 transition-colors hover:text-zinc-200"
                                />
                              ) : (
                                <span className="block min-w-[16px] flex-shrink-0 text-right text-xs sm:text-[10px] tabular-nums text-zinc-500">
                                  0
                                </span>
                              )}
                              <GripVertical className="w-3 h-3 opacity-40" />
                              <Link
                                href={`/project-${project.id}`}
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <span
                                  className="text-xs sm:text-[9px] font-bold flex-shrink-0 w-5 text-center"
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
                                      setProjectPendingDelete(project);
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
                              ? "text-white"
                              : "text-zinc-500 hover:text-zinc-400"
                          }`}
                        >
                          <Link
                            href={`/project-${project.id}`}
                            className="flex items-center gap-2 flex-1 min-w-0"
                          >
                            <span
                              className="text-xs sm:text-[9px] font-bold flex-shrink-0 w-5 text-center"
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
                                  setProjectPendingDelete(project);
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
          <div className="mt-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between px-3 py-1 mb-1">
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
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-zinc-500 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                        <span className="truncate">{displayName}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
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
                        <button
                          onClick={() => setInviteToRevoke(user)}
                          className="flex items-center gap-1 px-1.5 py-1 rounded text-xs sm:text-[11px] text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                          title="Revoke invitation"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revoke invitation</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </NavReorderWrapper>
      </nav>

      {/* Email storage usage — only rendered when at least one mailbox exposes
          IMAP QUOTA storage stats. Hidden entirely otherwise. */}
      {!isCollapsed && storageStats.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2 space-y-1.5">
          {storageStats.map((stat) => {
            const pct = Math.min(
              100,
              Math.max(0, (stat.used / stat.total) * 100),
            );
            return (
              <div key={stat.mailboxId} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-xs sm:text-[10px] text-zinc-500">
                  <span className="truncate">{stat.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatGb(stat.used)} / {formatGb(stat.total)} GB
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-zinc-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            {/* System / Dark / Light mode switch (icon-only rail). */}
            <div className="pt-1">
              <ThemeModeToggle collapsed />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <button
              onClick={() => setShowCalendarPopover(!showCalendarPopover)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <Rss className="w-4 h-4" />
              Calendar Feed
            </button>
            <Link
              href="/developer/api"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <FileCode2 className="w-4 h-4" />
              API Docs
            </Link>
            {/* System / Dark / Light mode switch. */}
            <div className="px-1 pt-1">
              <ThemeModeToggle />
            </div>
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
                <div className="text-xs sm:text-[11px] text-zinc-500 space-y-0.5">
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
              {timerModalMode === "stop"
                ? "Stop Focus: Time"
                : "Start Focus: Time"}
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
      {!isCollapsed && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize sidebar"
          className="absolute top-0 right-0 z-40 flex h-full w-2 cursor-col-resize items-center justify-end"
        >
          <div
            className={`h-12 w-1 rounded-full transition-opacity ${
              isResizingSidebar
                ? "bg-theme-gradient opacity-100"
                : "bg-zinc-600 opacity-0 group-hover/sidebar:opacity-100"
            }`}
          />
        </div>
      )}
      <ConfirmDialog
        open={!!inviteToRevoke}
        onOpenChange={(open) => {
          if (!open && !revokingInvite) setInviteToRevoke(null);
        }}
        title="Revoke invitation?"
        description="Revoke invitation? This cannot be undone."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        destructive
        isLoading={revokingInvite}
        onConfirm={() => {
          if (inviteToRevoke) handleRevokeInvite(inviteToRevoke);
        }}
      />
      <ConfirmDialog
        open={!!projectPendingDelete}
        onOpenChange={(open) => !open && setProjectPendingDelete(null)}
        title="Delete project?"
        description={
          projectPendingDelete
            ? `Delete "${projectPendingDelete.name}"? It and all its tasks will be moved to the Trash, where you can restore them.`
            : undefined
        }
        confirmLabel="Move to Trash"
        destructive
        onConfirm={() => {
          if (projectPendingDelete && onProjectDelete) {
            onProjectDelete(projectPendingDelete.id);
          }
          setProjectPendingDelete(null);
        }}
      />
    </div>
  );
}
