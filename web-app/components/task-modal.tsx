"use client";

import {
  useId,
  useState,
  useRef,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  X,
  Calendar,
  Clock,
  Flag,
  Bell,
  Paperclip,
  Hash,
  User,
  Tag,
  Plus,
  Circle,
  CheckCircle2,
  Trash2,
  CornerDownRight,
  Link2,
  AlertCircle,
  Check,
  CalendarCheck,
  Repeat2,
  Upload,
  Loader2,
  FileText,
  UserCheck,
  Sparkles,
  Target,
  ShoppingCart,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { deriveSupplyName, formatCurrency, supplyLineTotal } from "@/lib/supply";
import { shouldDismissOnOutsidePointer } from "@/lib/modal-dismiss";
import type {
  Database,
  Task,
  Reminder,
  Attachment,
  Project as ProjectType,
  Tag as TagType,
  RecurringConfig,
} from "@/lib/types";
import { format } from "date-fns";
import {
  canBeSelectedAsDependency,
  getBlockingTasks,
  isTaskBlocked,
} from "@/lib/dependency-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { HistoryTimelineScrubber } from "@/components/history-timeline-scrubber";
import { TimePicker } from "@/components/time-picker";
import { UserAvatar } from "@/components/user-avatar";
import { RecurringPicker } from "@/components/recurring-picker";
import {
  parseRecurringPattern,
  serializeRecurringConfig,
} from "@/lib/recurring-utils";
import { useAuth } from "@/contexts/AuthContext";
import { nullableEditFieldValue } from "@/lib/task-modal-payload";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StakeEditor } from "@/components/stake-editor";

interface PendingSubtask {
  name: string;
  timeEstimate?: string;
  dueDate?: string;
  isSupply?: boolean;
  supplyQuantity?: string;
  supplyPrice?: string;
  supplyVendor?: string;
  supplyMake?: string;
  supplyModel?: string;
  supplyType?: string;
}

/**
 * HITL defaults ON for anything a person composes in this modal, and stays OFF
 * everywhere else. The `tasks.requires_hitl` column default remains false, so
 * API-created tasks (PATs, mobile endpoints, AI agents) are unaffected — only
 * this form opts in.
 */
const DEFAULT_REQUIRES_HITL_IN_UI = true;

/**
 * The task form is long enough that everything at once is hard to scan, so it
 * pages through tabs. Panels stay mounted and are hidden with CSS rather than
 * unmounted — a half-filled field must survive paging away and back, and the
 * whole form still submits as one.
 */
const TASK_MODAL_TABS = [
  { key: "details", label: "Details" },
  { key: "schedule", label: "Schedule" },
  { key: "assigned", label: "Assigned" },
  { key: "dependencies", label: "Dependencies" },
  { key: "subtasks", label: "Subtasks" },
  { key: "history", label: "History" },
] as const;

type TaskModalTab = (typeof TASK_MODAL_TABS)[number]["key"];

/**
 * Maps the supply identity form state to the three columns. The inactive set is
 * nulled on edit (and omitted on create) so switching a supply between a
 * specific product and a commodity can't leave the other set's values behind.
 */
function supplyIdentityFields({
  isSupply,
  identity,
  make,
  model,
  type,
  isEditMode,
}: {
  isSupply: boolean;
  identity: "make-model" | "type";
  make: string;
  model: string;
  type: string;
  isEditMode: boolean;
}): Record<string, string | null | undefined> {
  const cleared = isEditMode ? null : undefined;
  const keep = (value: string) => (value.trim() !== "" ? value.trim() : cleared);

  if (!isSupply) {
    return {
      supplyMake: cleared,
      supplyModel: cleared,
      supplyType: cleared,
    };
  }

  return identity === "make-model"
    ? {
        supplyMake: keep(make),
        supplyModel: keep(model),
        supplyType: cleared,
      }
    : {
        supplyMake: cleared,
        supplyModel: cleared,
        supplyType: keep(type),
      };
}

const quickProjectColors = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
];

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Database;
  task?: Task | null; // Optional - if provided, it's edit mode
  onSave: (
    task: Omit<Task, "id" | "createdAt" | "updatedAt"> | Partial<Task>,
  ) => void;
  onDelete?: (taskId: string) => void;
  onDataRefresh?: () => void;
  defaultProjectId?: string;
  defaultSectionId?: string;
  defaultGoalId?: string;
  onTaskSelect?: (task: Task) => void;
  onRequestNewDependencyTask?: (seedName?: string) => Promise<Task | null>;
  onRequestNewProject?: (
    seedName: string,
    organizationId: string,
  ) => Promise<ProjectType | null>;
  onRequestNewTag?: (seedName: string) => Promise<TagType | null>;
  renderInStack?: boolean;
  stackZIndex?: number;
  stackStyle?: CSSProperties;
  initialName?: string;
  /** Drill into a saved subtask, opening it in its own stacked modal. */
  onExpandSubtask?: (subtask: Task) => void;
  /**
   * Save this (unsaved) task and resolve to the created row, so a pending
   * subtask can be expanded — children need a parent that exists.
   */
  onRequestSaveForExpand?: (
    taskData: Omit<Task, "id" | "createdAt" | "updatedAt"> | Partial<Task>,
  ) => Promise<Task | null>;
  /** Rendered in the modal header, e.g. the stack's back/forward pager. */
  stackHeaderExtra?: ReactNode;
}

export function TaskModal({
  isOpen,
  onClose,
  data,
  task,
  onSave,
  onDelete,
  onDataRefresh,
  defaultProjectId,
  defaultSectionId,
  defaultGoalId,
  onTaskSelect,
  onRequestNewDependencyTask,
  onRequestNewProject,
  onRequestNewTag,
  renderInStack,
  stackZIndex,
  stackStyle,
  initialName,
  onExpandSubtask,
  onRequestSaveForExpand,
  stackHeaderExtra,
}: TaskModalProps) {
  const isEditMode = !!task;
  const { user: authUser } = useAuth();
  const titleInputId = useId();
  const descriptionInputId = useId();
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState<string>("");
  const [deadline, setDeadline] = useState("");
  const [deadlineTime, setDeadlineTime] = useState<string>("");
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(4);
  const [selectedProject, setSelectedProject] = useState(
    defaultProjectId || "",
  );
  const [selectedParentTask, setSelectedParentTask] = useState<string | null>(
    null,
  );
  const [selectedGoalId, setSelectedGoalId] = useState<string>(
    defaultGoalId || "",
  );
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [newReminderDate, setNewReminderDate] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(
    authUser?.id ?? null,
  );
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const [newSubtaskName, setNewSubtaskName] = useState("");
  // Supply fields for the subtask being composed. Mirrors the parent task's
  // own supply inputs so a subtask can be a line item in its own right.
  const [newSubtaskIsSupply, setNewSubtaskIsSupply] = useState(false);
  const [newSubtaskSupplyQuantity, setNewSubtaskSupplyQuantity] = useState("");
  const [newSubtaskSupplyPrice, setNewSubtaskSupplyPrice] = useState("");
  const [newSubtaskSupplyVendor, setNewSubtaskSupplyVendor] = useState("");
  const [newSubtaskSupplyIdentity, setNewSubtaskSupplyIdentity] = useState<
    "make-model" | "type"
  >("make-model");
  const [newSubtaskSupplyMake, setNewSubtaskSupplyMake] = useState("");
  const [newSubtaskSupplyModel, setNewSubtaskSupplyModel] = useState("");
  const [newSubtaskSupplyType, setNewSubtaskSupplyType] = useState("");
  const [newSubtaskEstimate, setNewSubtaskEstimate] = useState("");
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState<PendingSubtask[]>([]);
  // Subtasks added to an already-saved task are rendered immediately (with a
  // breathing pulse) instead of waiting for the POST + parent data refresh.
  // Each entry is dropped once the refreshed `data.tasks` contains its id.
  const [optimisticSubtasks, setOptimisticSubtasks] = useState<any[]>([]);
  const optimisticSubtaskSeq = useRef(0);
  // Inline subtask-title editing. For existing subtasks we key by id; for
  // pending subtasks we key by `pending:<index>`.
  const [editingSubtaskKey, setEditingSubtaskKey] = useState<string | null>(
    null,
  );
  const [editingSubtaskValue, setEditingSubtaskValue] = useState("");
  const editingSubtaskInputRef = useRef<HTMLInputElement>(null);
  // Subtask deletion confirmation. For pending subtasks we store the index
  // (kind "pending"); for existing subtasks we store the task id (kind "existing").
  const [subtaskToDelete, setSubtaskToDelete] = useState<
    | { kind: "pending"; index: number; name: string }
    | { kind: "existing"; id: string; name: string }
    | null
  >(null);
  const [isDeletingSubtask, setIsDeletingSubtask] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<typeof data.tags>([]);
  const [bouncingTagId, setBouncingTagId] = useState<string | null>(null);
  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [showDependencyPicker, setShowDependencyPicker] = useState(false);
  const [dependencySearchQuery, setDependencySearchQuery] = useState("");
  // "%" blocking-task mention state
  const [blockerMention, setBlockerMention] = useState<{
    field: "title" | "description";
    query: string;
    start: number; // index of the "%" character
  } | null>(null);
  const [blockerMentionIndex, setBlockerMentionIndex] = useState(0);
  // "@" user-assignment mention state
  const [userMention, setUserMention] = useState<{
    field: "title" | "description";
    query: string;
    start: number; // index of the "@" character
  } | null>(null);
  const [userMentionIndex, setUserMentionIndex] = useState(0);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const [expandedBlockerId, setExpandedBlockerId] = useState<string | null>(
    null,
  );
  const [recurringConfig, setRecurringConfig] =
    useState<RecurringConfig | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [timeEstimate, setTimeEstimate] = useState<string>("");
  // Supply line-item fields. Kept as strings so a cleared input is
  // distinguishable from a zero.
  const [isSupply, setIsSupply] = useState(false);
  const [supplyQuantity, setSupplyQuantity] = useState<string>("");
  const [supplyPrice, setSupplyPrice] = useState<string>("");
  const [supplyVendor, setSupplyVendor] = useState<string>("");
  // A supply identifies itself either as a specific product (make + model) or
  // as a commodity (type). Which set is active is inferred from the stored
  // values, so supplies predating these fields open on the default.
  const [supplyIdentity, setSupplyIdentity] = useState<"make-model" | "type">(
    "make-model",
  );
  const [supplyMake, setSupplyMake] = useState<string>("");
  const [supplyModel, setSupplyModel] = useState<string>("");
  const [supplyType, setSupplyType] = useState<string>("");
  const [estimateSuggesting, setEstimateSuggesting] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState<string>("");
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskModalTab>("details");
  // Inline goal creation from the picker.
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  // History only exists once the task does, so it is hidden when adding.
  const visibleTabs = TASK_MODAL_TABS.filter(
    (tab) => tab.key !== "history" || isEditMode,
  );
  const activeTabIndex = visibleTabs.findIndex((tab) => tab.key === activeTab);
  const tabPanelClass = (tab: TaskModalTab) =>
    activeTab === tab ? "space-y-6" : "hidden";
  // Tasks composed by a human in this modal default to requiring HITL. This is
  // deliberately a UI-only default: the column default stays false so tasks
  // created over the API (PATs, the mobile endpoints, AI agents) are not
  // silently made un-completable by automation. Edit mode overwrites this from
  // the task's own stored value below.
  const [requiresHitl, setRequiresHitl] = useState(DEFAULT_REQUIRES_HITL_IN_UI);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Searchable dropdown states
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectFilterQuery, setProjectFilterQuery] = useState("");
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [priorityFilterQuery, setPriorityFilterQuery] = useState("");
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  // Seeds the form from the task being edited. Guarded so it runs once per
  // opened task rather than on every render of fresh data: `data` is the whole
  // database object and gets a new identity on every fetchData(), which the
  // background sync and the realtime subscription both trigger on a timer.
  // With `data` in the dependency list this re-seeded every field from the
  // stored task mid-edit, silently discarding whatever had been typed — the
  // "my work disappears after a while without reloading" bug.
  //
  // Keyed on task id + isOpen so reopening the same task still re-seeds, while
  // a refetch of an already-open task leaves the form alone.
  const seededTaskKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      seededTaskKeyRef.current = null;
      return;
    }
    const seedKey = `${task?.id ?? "new"}`;
    if (seededTaskKeyRef.current === seedKey) return;
    seededTaskKeyRef.current = seedKey;

    if (task && isEditMode) {
      setTaskName(task.name);
      setDescription(task.description || "");
      // Handle both snake_case and camelCase for due date
      const dueDate = (task as any).due_date || task.dueDate;
      const dueTime = (task as any).due_time || task.dueTime;
      setDueDate(dueDate || "");
      setDueTime(dueTime || "");
      setDeadline(task.deadline ? task.deadline.split("T")[0] : "");
      setDeadlineTime(
        task.deadline && task.deadline.includes("T")
          ? task.deadline.split("T")[1].substring(0, 5)
          : "",
      );
      setPriority(task.priority);
      // Handle both snake_case and camelCase for the HITL flag
      setRequiresHitl(
        Boolean((task as any).requires_hitl ?? task.requiresHitl ?? false),
      );
      // Handle both snake_case and camelCase for projectId
      const projectId = (task as any).project_id || task.projectId || "";
      // If no project, try to select the first available project as default
      if (!projectId && data?.projects?.length > 0) {
        const firstProject = data.projects.find((p) => !p.archived);
        setSelectedProject(firstProject?.id || "");
      } else {
        setSelectedProject(projectId);
      }
      // Handle both snake_case and camelCase for parentId
      const parentId = (task as any).parent_id || task.parentId;
      setSelectedParentTask(parentId || null);
      setSelectedGoalId((task as any).goal_id || task.goalId || "");
      setSelectedTags(task.tags || []);
      // Handle both snake_case and camelCase for assignedTo
      const assignedTo = (task as any).assigned_to || task.assignedTo;
      setAssignedTo(assignedTo || null);
      setReminders(task.reminders || []);
      // Handle both snake_case and camelCase for dependsOn
      const dependsOn = (task as any).depends_on || task.dependsOn;
      setDependencies(dependsOn || []);
      setRecurringConfig(
        parseRecurringPattern(
          (task as any).recurring_pattern || task.recurringPattern || "",
        ),
      );
      const te = (task as any).time_estimate ?? task.timeEstimate ?? undefined;
      setTimeEstimate(te != null ? String(te) : "");
      const supplyFlag =
        (task as any).is_supply ?? task.isSupply ?? false;
      setIsSupply(Boolean(supplyFlag));
      const sq = (task as any).supply_quantity ?? task.supplyQuantity;
      setSupplyQuantity(sq != null ? String(sq) : "");
      const sp = (task as any).supply_price ?? task.supplyPrice;
      setSupplyPrice(sp != null ? String(sp) : "");
      const sv = (task as any).supply_vendor ?? task.supplyVendor;
      setSupplyVendor(sv != null ? String(sv) : "");
      const smk = (task as any).supply_make ?? task.supplyMake;
      const smd = (task as any).supply_model ?? task.supplyModel;
      const styp = (task as any).supply_type ?? task.supplyType;
      setSupplyMake(smk != null ? String(smk) : "");
      setSupplyModel(smd != null ? String(smd) : "");
      setSupplyType(styp != null ? String(styp) : "");
      setSupplyIdentity(!smk && !smd && styp ? "type" : "make-model");
      const sd = (task as any).start_date || task.startDate;
      const st = (task as any).start_time || task.startTime;
      const ed = (task as any).end_date || task.endDate;
      const et = (task as any).end_time || task.endTime;
      setStartDate(sd || "");
      setStartTime(st || "");
      setEndDate(ed || "");
      setEndTime(et || "");
      // Load existing attachments
      const existingAttachments =
        (task as any).attachments || task.files || [];
      setAttachments(
        existingAttachments.map((a: any) => ({
          id: a.id,
          name: a.name || a.file_name || "file",
          url: a.url,
          type: a.type || "unknown",
          sizeBytes: a.size_bytes ?? a.sizeBytes,
          mimeType: a.mime_type ?? a.mimeType,
          storageProvider: a.storage_provider ?? a.storageProvider,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not
    // re-running on `data`/`task` identity changes; see the comment above.
  }, [task?.id, isEditMode, isOpen]);

  useEffect(() => {
    if (!task && initialName !== undefined) {
      setTaskName(initialName);
    }
  }, [initialName, task]);

  // Optimistic subtask rows belong to one open task — never carry them over to
  // the next task the modal is opened on.
  useEffect(() => {
    setOptimisticSubtasks([]);
  }, [task?.id, isOpen]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen && !isEditMode) {
      // Reset form for add mode
      setTaskName("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setDeadline("");
      setDeadlineTime("");
      setPriority(4);
      setRequiresHitl(DEFAULT_REQUIRES_HITL_IN_UI);
      setSelectedProject(defaultProjectId || "");
      setSelectedParentTask(null);
      setSelectedGoalId(defaultGoalId || "");
      setReminders([]);
      setSelectedTags([]);
      setAssignedTo(authUser?.id ?? null);
      setShowReminderInput(false);
      setNewReminderDate("");
      setShowProjectSuggestions(false);
      setProjectSearchQuery("");
      setNewReminderTime("");
      setShowAddTag(false);
      setNewTagName("");
      setShowUserDropdown(false);
      setUserSearchQuery("");
      setDependencies([]);
      setShowDependencyPicker(false);
      setDependencySearchQuery("");
      setBlockerMention(null);
      setBlockerMentionIndex(0);
      setUserMention(null);
      setUserMentionIndex(0);
      setExpandedBlockerId(null);
      setRecurringConfig(null);
      setIsSupply(false);
      setSupplyQuantity("");
      setSupplyPrice("");
      setSupplyVendor("");
      setSupplyMake("");
      setSupplyModel("");
      setSupplyType("");
      setSupplyIdentity("make-model");
      setPendingSubtasks([]);
      setNewSubtaskName("");
      setNewSubtaskEstimate("");
      setNewSubtaskDueDate("");
      setIsAddingSubtask(false);
      setEditingSubtaskKey(null);
      setEditingSubtaskValue("");
      setSubtaskToDelete(null);
      setIsDeletingSubtask(false);
      setShowProjectDropdown(false);
      setProjectFilterQuery("");
      setShowPriorityDropdown(false);
      setPriorityFilterQuery("");
      setTimeEstimate("");
      setStartDate("");
      setStartTime("");
      setEndDate("");
      setEndTime("");
      setAttachments([]);
      setIsUploading(false);
    }
  }, [isOpen, defaultProjectId, isEditMode, authUser?.id]);

  // New tasks are left unassigned by default: auto-assigning to the creator
  // made section-less tasks show an assignee memoji under "Unassigned Tasks".
  // The user can still assign themselves (or anyone) explicitly in the modal.

  useEffect(() => {
    if (!isOpen || isEditMode) return;
    if (dueDate) return;
    setDueDate(format(new Date(), "yyyy-MM-dd"));
  }, [isOpen, isEditMode, dueDate]);

  // Ensure add mode always has a valid project selection once data is available.
  useEffect(() => {
    if (!isOpen || isEditMode) return;
    if (selectedProject) return;

    const fallbackProjectId =
      defaultProjectId ||
      data.projects.find((project) => !project.archived)?.id ||
      data.projects[0]?.id;

    if (fallbackProjectId) {
      setSelectedProject(fallbackProjectId);
    }
  }, [
    isOpen,
    isEditMode,
    selectedProject,
    defaultProjectId,
    data.projects,
  ]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // See lib/modal-dismiss: guards the two cases that look like an outside
      // click but are not — a target detached by this same interaction, and a
      // target inside a portalled layer such as a nested confirm dialog.
      if (
        shouldDismissOnOutsidePointer(
          event.target as unknown as Element | null,
          modalRef.current,
        )
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close project/priority dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setShowProjectDropdown(false);
      }
      if (
        priorityDropdownRef.current &&
        !priorityDropdownRef.current.contains(event.target as Node)
      ) {
        setShowPriorityDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update tag suggestions when typing
  useEffect(() => {
    if (newTagName.trim()) {
      const filtered = data.tags.filter((tag) =>
        tag.name.toLowerCase().includes(newTagName.toLowerCase()),
      );
      setTagSuggestions(filtered);
    } else {
      setTagSuggestions([]);
    }
  }, [newTagName, data.tags]);

  // Automatically add reminder when date is selected (time optional)
  useEffect(() => {
    if (newReminderDate && showReminderInput) {
      const datetime = newReminderTime
        ? `${newReminderDate}T${newReminderTime}:00`
        : `${newReminderDate}T09:00:00`;

      setReminders((prevReminders) => [
        ...prevReminders,
        {
          id: `reminder-${Date.now()}`,
          type: "custom" as const,
          value: datetime,
        },
      ]);
      setNewReminderDate("");
      setNewReminderTime("");
      setShowReminderInput(false);
    }
  }, [newReminderDate, newReminderTime, showReminderInput]);

  /**
   * Builds the save payload from current form state, or null when the form
   * can't be saved. Split out of handleSubmit so expanding a pending subtask
   * can save through the same path rather than duplicating the mapping.
   */
  const buildTaskData = (): any | null => {
    const effectiveProjectId =
      selectedProject ||
      defaultProjectId ||
      data.projects.find((project) => !project.archived)?.id ||
      data.projects[0]?.id ||
      "";

    // Validate that a project is selected
    if (!effectiveProjectId) {
      console.error("No project selected");
      alert("Please select a project");
      return null;
    }

    const emptyEditValue = nullableEditFieldValue("", isEditMode);
    const nextDueDate = nullableEditFieldValue(dueDate, isEditMode);
    const nextStartDate = nullableEditFieldValue(startDate, isEditMode);
    const nextEndDate = nullableEditFieldValue(endDate, isEditMode);

    // A supply has no Title input — its name is derived from the supply fields
    // so `tasks.name` (NOT NULL, rendered in every list) is never empty. A
    // title typed before the supply toggle was flipped is only a last resort.
    const resolvedName = isSupply
      ? deriveSupplyName(
          {
            is_supply: true,
            supply_make: supplyIdentity === "make-model" ? supplyMake : null,
            supply_model: supplyIdentity === "make-model" ? supplyModel : null,
            supply_type: supplyIdentity === "type" ? supplyType : null,
            supply_vendor: supplyVendor,
          },
          taskName,
        )
      : taskName;

    const taskData: any = {
      name: resolvedName,
      description,
      dueDate: nextDueDate,
      dueTime: dueDate ? nullableEditFieldValue(dueTime, isEditMode) : emptyEditValue,
      deadline: deadline
        ? deadlineTime
          ? `${deadline}T${deadlineTime}`
          : deadline
        : emptyEditValue,
      priority,
      requiresHitl,
      projectId: effectiveProjectId,
      parentId: selectedParentTask || emptyEditValue,
      tags: selectedTags,
      attachments: attachments.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        type: a.type,
        size_bytes: a.sizeBytes,
        mime_type: a.mimeType,
        storage_provider: a.storageProvider,
      })),
      files: attachments,
      assignedTo: assignedTo || emptyEditValue,
      reminders,
      dependsOn: dependencies.length > 0 ? dependencies : undefined,
      recurringPattern: serializeRecurringConfig(recurringConfig),
      sectionId: defaultSectionId || undefined,
      goalId: selectedGoalId || (isEditMode ? null : undefined),
      timeEstimate:
        timeEstimate !== "" ? parseInt(timeEstimate, 10) : isEditMode ? null : undefined,
      isSupply,
      // Only send supply details when the task is actually a supply, and clear
      // them out when the flag is turned off so stale amounts can't linger.
      supplyQuantity: isSupply
        ? supplyQuantity !== ""
          ? Number(supplyQuantity)
          : isEditMode
            ? null
            : undefined
        : isEditMode
          ? null
          : undefined,
      supplyPrice: isSupply
        ? supplyPrice !== ""
          ? Number(supplyPrice)
          : isEditMode
            ? null
            : undefined
        : isEditMode
          ? null
          : undefined,
      supplyVendor: isSupply
        ? supplyVendor.trim() !== ""
          ? supplyVendor.trim()
          : isEditMode
            ? null
            : undefined
        : isEditMode
          ? null
          : undefined,
      // Make/model and type are alternatives: whichever set is not active is
      // cleared, so a supply switched from one to the other can't keep stale
      // values from the set it no longer uses.
      ...supplyIdentityFields({
        isSupply,
        identity: supplyIdentity,
        make: supplyMake,
        model: supplyModel,
        type: supplyType,
        isEditMode,
      }),
      startDate: nextStartDate,
      startTime: startDate
        ? nullableEditFieldValue(startTime, isEditMode)
        : emptyEditValue,
      endDate: nextEndDate,
      endTime: endDate ? nullableEditFieldValue(endTime, isEditMode) : emptyEditValue,
    };

    if (!isEditMode) {
      taskData.completed = false;
      if (pendingSubtasks.length > 0) {
        taskData.pendingSubtasks = pendingSubtasks;
      }
    }

    return taskData;
  };

  /**
   * The supply fields, rendered in place of the Title input. A supply is named
   * by what it is (make/model or type) rather than a free-text title.
   */
  const renderSupplyFields = () => (
    <div className="space-y-3">
        {/* Make/model names a specific product; type names a commodity.
            They are alternatives, so only one set is shown at a time. */}
        <div className="flex items-center gap-1 text-xs">
          {(
            [
              { key: "make-model" as const, label: "Make & Model" },
              { key: "type" as const, label: "Type" },
            ]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSupplyIdentity(option.key)}
              aria-pressed={supplyIdentity === option.key}
              className={`rounded px-2 py-1 transition-colors ${
                supplyIdentity === option.key
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {supplyIdentity === "make-model" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Make
              </label>
              <input
                type="text"
                value={supplyMake}
                onChange={(e) => setSupplyMake(e.target.value)}
                placeholder="Manufacturer"
                className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Model
              </label>
              <input
                type="text"
                value={supplyModel}
                onChange={(e) => setSupplyModel(e.target.value)}
                placeholder="Model or part number"
                className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Type
            </label>
            <input
              type="text"
              value={supplyType}
              onChange={(e) => setSupplyType(e.target.value)}
              placeholder='e.g. 2x6x8 doug fir'
              className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
            />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Quantity
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={supplyQuantity}
            onChange={(e) => setSupplyQuantity(e.target.value)}
            placeholder="1"
            className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Price (each)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={supplyPrice}
            onChange={(e) => setSupplyPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Vendor
          </label>
          <input
            type="text"
            value={supplyVendor}
            onChange={(e) => setSupplyVendor(e.target.value)}
            placeholder="Where to buy it"
            className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
          />
        </div>
        {supplyPrice !== "" && (
          <p className="text-xs text-zinc-500 sm:col-span-3">
            Line total:{" "}
            <span className="text-zinc-300">
              {formatCurrency(
                supplyLineTotal({
                  is_supply: true,
                  supply_quantity:
                    supplyQuantity !== "" ? Number(supplyQuantity) : null,
                  supply_price: Number(supplyPrice),
                }),
              )}
            </span>
            {supplyQuantity === "" && " (quantity blank counts as 1)"}
          </p>
        )}
        </div>
      </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Title is validated here rather than with the `required` attribute: the
    // input lives on the Details tab, and a hidden required control cannot be
    // focused, which makes the browser block submission with no visible reason.
    // Supplies have no Title input; their name is derived in buildTaskData.
    if (!isSupply && !taskName.trim()) {
      setActiveTab("details");
      requestAnimationFrame(() => titleInputRef.current?.focus());
      return;
    }
    const taskData = buildTaskData();
    if (!taskData) return;
    onSave(taskData);
    onClose();
  };

  /**
   * Opens a subtask in its own stacked modal. A subtask that has never been
   * saved has no id and so cannot own children yet — in that case the parent is
   * saved first and the drill-down opens on the row that save created, matched
   * by position among the parent's children.
   */
  const [isExpandingSubtask, setIsExpandingSubtask] = useState(false);
  const expandSubtask = async (
    target: { kind: "existing"; task: Task } | { kind: "pending"; index: number },
  ) => {
    if (!onExpandSubtask || isExpandingSubtask) return;
    if (target.kind === "existing") {
      onExpandSubtask(target.task);
      return;
    }
    if (!onRequestSaveForExpand) return;

    setIsExpandingSubtask(true);
    try {
      const taskData = buildTaskData();
      if (!taskData) return;
      const savedParent = await onRequestSaveForExpand(taskData);
      if (!savedParent?.id) {
        console.error("Could not expand subtask: parent task was not saved");
        return;
      }
      const children = (data.tasks || [])
        .filter(
          (t) =>
            ((t as any).parent_id ?? t.parentId) === savedParent.id &&
            !(t as any).is_deleted,
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() -
            new Date(b.createdAt || 0).getTime(),
        );
      const created = children[target.index];
      if (!created) {
        console.error(
          "Could not expand subtask: the saved subtask was not found",
        );
        return;
      }
      onExpandSubtask(created);
    } finally {
      setIsExpandingSubtask(false);
    }
  };

  const handleAddReminder = () => {
    if (newReminderDate) {
      const datetime = newReminderTime
        ? `${newReminderDate}T${newReminderTime}:00`
        : `${newReminderDate}T09:00:00`;

      setReminders([
        ...reminders,
        {
          id: `reminder-${Date.now()}`,
          type: "custom" as const,
          value: datetime,
        },
      ]);
      setNewReminderDate("");
      setNewReminderTime("");
      setShowReminderInput(false);
    }
  };

  const handleRemoveReminder = (id: string) => {
    setReminders(reminders.filter((r) => r.id !== id));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        // If editing an existing task, attach directly
        if (isEditMode && task?.id) {
          formData.append("taskId", task.id);
        }

        const res = await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          console.error("Upload failed:", err);
          continue;
        }

        const uploaded = await res.json();
        setAttachments((prev) => [
          ...prev,
          {
            id: uploaded.id,
            name: uploaded.name,
            url: uploaded.url,
            type: uploaded.type,
            sizeBytes: uploaded.size_bytes,
            mimeType: uploaded.mime_type,
            storageProvider: uploaded.storage_provider,
          },
        ]);
      }
    } catch (err) {
      console.error("File upload error:", err);
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    // If it has a DB record (edit mode), delete via API
    const attachment = attachments.find((a) => a.id === attachmentId);
    if (isEditMode && attachment) {
      try {
        await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete attachment:", err);
      }
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDefaultOrganizationId = () => {
    if (selectedProject) {
      const project = data.projects.find(
        (p) => p.id === selectedProject,
      ) as any;
      return project?.organizationId || project?.organization_id || "";
    }
    return data.organizations?.[0]?.id || "";
  };

  const applyProjectTagToTitle = (projectName: string) => {
    const beforeCursor = taskName.substring(0, cursorPosition);
    const afterCursor = taskName.substring(cursorPosition);
    const lastHashIndex = beforeCursor.lastIndexOf("#");
    if (lastHashIndex !== -1) {
      const newTaskName = `${taskName.substring(0, lastHashIndex)}#${projectName} ${afterCursor}`;
      setTaskName(newTaskName);
    }
  };

  const createProjectQuick = async (
    name: string,
    options?: {
      insertInTitle?: boolean;
      closeSuggestions?: boolean;
      closeDropdown?: boolean;
    },
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName || isCreatingProject) return;

    const existingProject = data.projects.find(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (existingProject) {
      setSelectedProject(existingProject.id);
      if (options?.insertInTitle) {
        applyProjectTagToTitle(existingProject.name);
      }
      if (options?.closeSuggestions) {
        setShowProjectSuggestions(false);
        setProjectSearchQuery("");
      }
      if (options?.closeDropdown) {
        setShowProjectDropdown(false);
        setProjectFilterQuery("");
      }
      return;
    }

    const organizationId = getDefaultOrganizationId();
    if (!organizationId) {
      alert("No organization available to create this project.");
      return;
    }

    setIsCreatingProject(true);
    try {
      const color =
        quickProjectColors[
          Math.floor(Math.random() * quickProjectColors.length)
        ];
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          color,
          organization_id: organizationId,
          is_favorite: false,
          archived: false,
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        if (newProject?.id) {
          setSelectedProject(newProject.id);
        }
        if (options?.insertInTitle) {
          applyProjectTagToTitle(trimmedName);
        }
        if (options?.closeSuggestions) {
          setShowProjectSuggestions(false);
          setProjectSearchQuery("");
        }
        if (options?.closeDropdown) {
          setShowProjectDropdown(false);
          setProjectFilterQuery("");
        }
        if (onDataRefresh) onDataRefresh();
        titleInputRef.current?.focus();
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAddTag = async () => {
    if (newTagName.trim()) {
      const existingTag = data.tags.find(
        (t) => t.name.toLowerCase() === newTagName.trim().toLowerCase(),
      );

      if (existingTag) {
        if (!selectedTags.includes(existingTag.id)) {
          setSelectedTags([...selectedTags, existingTag.id]);
        }
      } else {
        const newTag = {
          id: `tag-${Date.now()}`,
          name: newTagName.trim(),
          color:
            "#" +
            Math.floor(Math.random() * 16777215)
              .toString(16)
              .padStart(6, "0"),
        };

        try {
          const response = await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newTag),
          });

          if (response.ok) {
            setSelectedTags([...selectedTags, newTag.id]);
            if (onDataRefresh) onDataRefresh();
          }
        } catch (error) {
          console.error("Failed to create tag:", error);
        }
      }

      setNewTagName("");
      setShowAddTag(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  // --- "%" blocking-task mention ---------------------------------------
  // Tasks eligible to be selected as a blocker via the "%" mention: exclude
  // the task itself, its subtasks, completed/circular candidates, and any
  // already-linked blockers.
  const getBlockerCandidates = (query: string): Task[] => {
    const q = query.toLowerCase();
    return data.tasks.filter((t) => {
      if (dependencies.includes(t.id)) return false;
      if (task && (t.id === task.id || t.parentId === task.id)) return false;
      const validation = canBeSelectedAsDependency(
        task?.id || "new-task",
        t.id,
        data.tasks,
      );
      if (!validation.canSelect) return false;
      return q === "" ? true : t.name.toLowerCase().includes(q);
    });
  };

  // Detect a "%" mention immediately before the cursor in the given text.
  // A mention is active from a "%" up to the cursor as long as the typed
  // query contains no whitespace (mirrors the "#" project mention behavior).
  const detectBlockerMention = (
    value: string,
    cursorPos: number,
  ): { query: string; start: number } | null => {
    const beforeCursor = value.substring(0, cursorPos);
    const lastPercent = beforeCursor.lastIndexOf("%");
    if (lastPercent === -1) return null;
    const afterPercent = value.substring(lastPercent + 1, cursorPos);
    if (/\s/.test(afterPercent)) return null;
    return { query: afterPercent, start: lastPercent };
  };

  const closeBlockerMention = () => {
    setBlockerMention(null);
    setBlockerMentionIndex(0);
  };

  // Complete a "%" mention: strip the "%query" text from the source field and
  // add the chosen task as a blocking dependency.
  const completeBlockerMention = (blocker: Task) => {
    if (!blockerMention) return;
    const { field, start, query } = blockerMention;
    const removeLen = 1 + query.length; // "%" + query
    if (field === "title") {
      const next =
        taskName.substring(0, start) + taskName.substring(start + removeLen);
      setTaskName(next);
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.setSelectionRange(start, start);
      });
    } else {
      const next =
        description.substring(0, start) +
        description.substring(start + removeLen);
      setDescription(next);
      requestAnimationFrame(() => {
        descriptionInputRef.current?.focus();
        descriptionInputRef.current?.setSelectionRange(start, start);
      });
    }
    if (!dependencies.includes(blocker.id)) {
      setDependencies((prev) => [...prev, blocker.id]);
    }
    closeBlockerMention();
  };

  // Shared keydown handler for the "%" mention popover (title + description).
  const handleBlockerMentionKeyDown = (
    e: React.KeyboardEvent,
  ): boolean => {
    if (!blockerMention) return false;
    const candidates = getBlockerCandidates(blockerMention.query);
    if (e.key === "Escape") {
      e.preventDefault();
      closeBlockerMention();
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setBlockerMentionIndex((i) =>
        candidates.length ? (i + 1) % candidates.length : 0,
      );
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setBlockerMentionIndex((i) =>
        candidates.length ? (i - 1 + candidates.length) % candidates.length : 0,
      );
      return true;
    }
    if (e.key === "Enter" || e.key === ",") {
      if (candidates.length > 0) {
        e.preventDefault();
        const chosen =
          candidates[Math.min(blockerMentionIndex, candidates.length - 1)];
        completeBlockerMention(chosen);
        return true;
      }
    }
    return false;
  };

  const renderBlockerMentionPopover = (field: "title" | "description") => {
    if (!blockerMention || blockerMention.field !== field) return null;
    const candidates = getBlockerCandidates(blockerMention.query);
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
        <div className="px-3 py-1.5 text-xs sm:text-[11px] font-medium uppercase tracking-wide text-zinc-500 border-b border-zinc-700 flex items-center gap-1.5">
          <Link2 className="w-3 h-3" />
          Blocked by…
        </div>
        {candidates.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">No tasks found</div>
        ) : (
          candidates.map((t, i) => {
            const tProject = data.projects.find(
              (p) => p.id === (t as any).projectId || p.id === (t as any).project_id,
            );
            return (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeBlockerMention(t);
                }}
                onMouseEnter={() => setBlockerMentionIndex(i)}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
                  i === blockerMentionIndex
                    ? "bg-zinc-700"
                    : "hover:bg-zinc-700"
                }`}
              >
                <Link2 className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span className="text-sm text-zinc-200 truncate flex-1">
                  {t.name}
                </span>
                {tProject && (
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {tProject.name}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    );
  };

  const handleSelectTagSuggestion = (tag: (typeof data.tags)[0]) => {
    if (selectedTags.includes(tag.id)) {
      // Tag is already selected, bounce it and close the input
      setBouncingTagId(tag.id);
      setTimeout(() => setBouncingTagId(null), 600); // Remove bounce class after animation
      setNewTagName("");
      setShowAddTag(false);
    } else {
      // Add the tag normally
      setSelectedTags([...selectedTags, tag.id]);
      setNewTagName("");
      setShowAddTag(false);
    }
  };

  const handleAssignUser = (userId: string) => {
    setAssignedTo(userId);
    setShowUserDropdown(false);
    setUserSearchQuery("");
  };

  const normalizeEmail = (email?: string | null) =>
    (email || "").trim().toLowerCase();

  const getUserDisplayName = (user: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
  }) =>
    user.name ||
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.email ||
    "Unknown User";

  const isCurrentUserProfile = (candidate?: {
    id?: string;
    authId?: string;
    email?: string | null;
  }) =>
    Boolean(
      candidate &&
        (candidate.id === authUser?.id ||
          candidate.authId === authUser?.id ||
          (normalizeEmail(candidate.email) &&
            normalizeEmail(candidate.email) === normalizeEmail(authUser?.email))),
    );

  const currentUserProfile = data.users.find(isCurrentUserProfile);
  const currentUserId = currentUserProfile?.id || authUser?.id || null;
  const isAssignedToCurrentUser = Boolean(
    currentUserId && assignedTo === currentUserId,
  );
  const isPendingUser = (user: { status?: string; id?: string; email?: string }) =>
    user.status === "pending" && !isCurrentUserProfile(user);
  const todayDateValue = format(new Date(), "yyyy-MM-dd");
  const assignableUsers = [...data.users]
    .filter((user) => {
      const userName = getUserDisplayName(user);
      const userEmail = user.email || "";
      const query = userSearchQuery.toLowerCase();
      return (
        userName.toLowerCase().includes(query) ||
        userEmail.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (isCurrentUserProfile(a)) return -1;
      if (isCurrentUserProfile(b)) return 1;
      return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
    });

  const handleAssignToCurrentUser = () => {
    if (!currentUserId) return;
    if (assignedTo === currentUserId) {
      setAssignedTo(null);
      return;
    }
    handleAssignUser(currentUserId);
  };

  // --- "@" user-assignment mention ------------------------------------
  // Users eligible for the "@" mention. Mirrors the existing assignee picker
  // (which does NOT exclude pending users), filtered by first/last/full name
  // or email, case-insensitive, and sorted with the current user first.
  const getUserMentionCandidates = (query: string) => {
    const q = query.toLowerCase();
    return [...data.users]
      .filter((user) => {
        if (q === "") return true;
        const name = getUserDisplayName(user).toLowerCase();
        const first = (user.firstName || "").toLowerCase();
        const last = (user.lastName || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        return (
          name.includes(q) ||
          first.includes(q) ||
          last.includes(q) ||
          email.includes(q)
        );
      })
      .sort((a, b) => {
        if (isCurrentUserProfile(a)) return -1;
        if (isCurrentUserProfile(b)) return 1;
        return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
      });
  };

  // Detect an "@" mention immediately before the cursor in the given text.
  // Active from an "@" up to the cursor as long as the typed query contains no
  // whitespace (mirrors the "%" / "#" mention behavior).
  const detectUserMention = (
    value: string,
    cursorPos: number,
  ): { query: string; start: number } | null => {
    const beforeCursor = value.substring(0, cursorPos);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt === -1) return null;
    const afterAt = value.substring(lastAt + 1, cursorPos);
    if (/\s/.test(afterAt)) return null;
    return { query: afterAt, start: lastAt };
  };

  const closeUserMention = () => {
    setUserMention(null);
    setUserMentionIndex(0);
  };

  // Complete an "@" mention: strip the "@query" text from the source field and
  // assign the task to the chosen user.
  const completeUserMention = (user: (typeof data.users)[number]) => {
    if (!userMention) return;
    const { field, start, query } = userMention;
    const removeLen = 1 + query.length; // "@" + query
    if (field === "title") {
      const next =
        taskName.substring(0, start) + taskName.substring(start + removeLen);
      setTaskName(next);
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.setSelectionRange(start, start);
      });
    } else {
      const next =
        description.substring(0, start) +
        description.substring(start + removeLen);
      setDescription(next);
      requestAnimationFrame(() => {
        descriptionInputRef.current?.focus();
        descriptionInputRef.current?.setSelectionRange(start, start);
      });
    }
    setAssignedTo(user.id);
    closeUserMention();
  };

  // Shared keydown handler for the "@" mention popover. Returns true if the key
  // was consumed. Note: "," does NOT complete (names contain none) — only
  // Enter or click selects.
  const handleUserMentionKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!userMention) return false;
    const candidates = getUserMentionCandidates(userMention.query);
    if (e.key === "Escape") {
      e.preventDefault();
      closeUserMention();
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setUserMentionIndex((i) =>
        candidates.length ? (i + 1) % candidates.length : 0,
      );
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setUserMentionIndex((i) =>
        candidates.length ? (i - 1 + candidates.length) % candidates.length : 0,
      );
      return true;
    }
    if (e.key === "Enter") {
      if (candidates.length > 0) {
        e.preventDefault();
        const chosen =
          candidates[Math.min(userMentionIndex, candidates.length - 1)];
        completeUserMention(chosen);
        return true;
      }
    }
    return false;
  };

  const renderUserMentionPopover = (field: "title" | "description") => {
    if (!userMention || userMention.field !== field) return null;
    const candidates = getUserMentionCandidates(userMention.query);
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
        <div className="px-3 py-1.5 text-xs sm:text-[11px] font-medium uppercase tracking-wide text-zinc-500 border-b border-zinc-700 flex items-center gap-1.5">
          <User className="w-3 h-3" />
          Assign to…
        </div>
        {candidates.length === 0 ? (
          <div className="px-3 py-2 text-sm text-zinc-500">No users found</div>
        ) : (
          candidates.map((user, i) => {
            const displayName = getUserDisplayName(user);
            return (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeUserMention(user);
                }}
                onMouseEnter={() => setUserMentionIndex(i)}
                className={`w-full px-3 py-2 text-left flex items-center gap-3 transition-colors ${
                  i === userMentionIndex ? "bg-zinc-700" : "hover:bg-zinc-700"
                }`}
              >
                <UserAvatar
                  name={displayName}
                  profileColor={user.profileColor}
                  memoji={user.profileMemoji}
                  size={24}
                  className="text-xs font-medium flex-shrink-0"
                />
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-medium text-zinc-200 truncate">
                    {displayName}
                    {isCurrentUserProfile(user) && (
                      <span className="ml-2 text-xs text-[rgb(var(--theme-primary-rgb))]">
                        You
                      </span>
                    )}
                    {isPendingUser(user) && (
                      <span className="ml-2 text-xs text-yellow-500">
                        (Pending)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    );
  };

  // Get assigned user details
  const assignedUser =
    data.users.find((u) => u.id === assignedTo) ||
    (isAssignedToCurrentUser && authUser
      ? {
          id: authUser.id,
          email: authUser.email || "",
          firstName: "",
          lastName: "",
          name: authUser.email?.split("@")[0] || "You",
          createdAt: "",
          updatedAt: "",
          status: "active" as const,
        }
      : undefined);

  const handleAddSubtask = async () => {
    if (!newSubtaskName.trim() || !task) return;

    const subtask: any = {
      name: newSubtaskName.trim(),
      completed: false,
      priority: 4,
      projectId: task.projectId,
      parentId: task.id,
      tags: [],
      files: [],
      reminders: [],
    };
    if (newSubtaskEstimate.trim() !== "") {
      subtask.timeEstimate = parseInt(newSubtaskEstimate, 10);
    }
    if (newSubtaskDueDate) {
      subtask.dueDate = newSubtaskDueDate;
    }
    if (newSubtaskIsSupply) {
      subtask.isSupply = true;
      subtask.supplyQuantity = newSubtaskSupplyQuantity.trim()
        ? Number(newSubtaskSupplyQuantity)
        : null;
      subtask.supplyPrice = newSubtaskSupplyPrice.trim()
        ? Number(newSubtaskSupplyPrice)
        : null;
      subtask.supplyVendor = newSubtaskSupplyVendor.trim() || null;
      Object.assign(subtask, newSubtaskSupplyIdentityFields());
    }

    // Show it right away, then clear the inputs so the next one can be typed
    // without waiting on the network.
    const tempId = `subtask-temp-${(optimisticSubtaskSeq.current += 1)}`;
    const now = new Date().toISOString();
    setOptimisticSubtasks((prev) => [
      ...prev,
      {
        ...subtask,
        id: tempId,
        status: "active",
        createdAt: now,
        updatedAt: now,
        _saving: true,
      },
    ]);
    setNewSubtaskName("");
    setNewSubtaskEstimate("");
    setNewSubtaskDueDate("");
    setIsAddingSubtask(false);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subtask),
      });

      if (!response.ok) throw new Error(`POST /api/tasks ${response.status}`);

      // Swap the placeholder for the saved row. Keeping it in local state under
      // the real id means the refresh below dedupes it away, with no flicker.
      const created = await response.json();
      setOptimisticSubtasks((prev) =>
        prev.map((s) =>
          s.id === tempId ? { ...created, _saving: false } : s,
        ),
      );
      if (onDataRefresh) onDataRefresh();
    } catch (error) {
      console.error("Failed to create subtask:", error);
      // Roll the row back and hand the text back to the user.
      setOptimisticSubtasks((prev) => prev.filter((s) => s.id !== tempId));
      setNewSubtaskName(subtask.name);
      setNewSubtaskEstimate(
        subtask.timeEstimate != null ? String(subtask.timeEstimate) : "",
      );
      setNewSubtaskDueDate(subtask.dueDate || "");
      setIsAddingSubtask(true);
    }
  };

  /**
   * Enter commits the subtask being composed, from any of its fields — name,
   * estimate or date. Was onKeyPress on the name field only: keypress is a
   * deprecated DOM event (deprecated in React 19, which this app runs), and it
   * left the estimate and date fields with no way to submit from the keyboard.
   */
  const handleNewSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isEditMode) handleAddSubtask();
    else commitPendingSubtask();
  };

  const clearNewSubtaskSupply = () => {
    setNewSubtaskIsSupply(false);
    setNewSubtaskSupplyQuantity("");
    setNewSubtaskSupplyPrice("");
    setNewSubtaskSupplyVendor("");
    setNewSubtaskSupplyIdentity("make-model");
    setNewSubtaskSupplyMake("");
    setNewSubtaskSupplyModel("");
    setNewSubtaskSupplyType("");
  };

  /** Identity fields for a subtask supply, matching the parent's semantics. */
  const newSubtaskSupplyIdentityFields = () =>
    newSubtaskSupplyIdentity === "make-model"
      ? {
          supplyMake: newSubtaskSupplyMake.trim() || undefined,
          supplyModel: newSubtaskSupplyModel.trim() || undefined,
        }
      : { supplyType: newSubtaskSupplyType.trim() || undefined };

  const commitPendingSubtask = () => {
    if (!newSubtaskName.trim()) return;
    setPendingSubtasks((prev) => [
      ...prev,
      {
        name: newSubtaskName.trim(),
        timeEstimate:
          newSubtaskEstimate.trim() !== "" ? newSubtaskEstimate.trim() : undefined,
        dueDate: newSubtaskDueDate || undefined,
        ...(newSubtaskIsSupply
          ? {
              isSupply: true,
              supplyQuantity: newSubtaskSupplyQuantity.trim() || undefined,
              supplyPrice: newSubtaskSupplyPrice.trim() || undefined,
              supplyVendor: newSubtaskSupplyVendor.trim() || undefined,
              ...newSubtaskSupplyIdentityFields(),
            }
          : {}),
      },
    ]);
    setNewSubtaskName("");
    setNewSubtaskEstimate("");
    setNewSubtaskDueDate("");
    clearNewSubtaskSupply();
  };

  // --- Inline subtask-title editing (double-click) --------------------
  const startEditingSubtask = (key: string, currentName: string) => {
    setEditingSubtaskKey(key);
    setEditingSubtaskValue(currentName);
    requestAnimationFrame(() => {
      const input = editingSubtaskInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
  };

  const cancelEditingSubtask = () => {
    setEditingSubtaskKey(null);
    setEditingSubtaskValue("");
  };

  // Commit a pending (add-mode) subtask rename. Empty name reverts.
  const commitPendingSubtaskEdit = (index: number) => {
    const trimmed = editingSubtaskValue.trim();
    if (trimmed) {
      setPendingSubtasks((prev) =>
        prev.map((s, i) => (i === index ? { ...s, name: trimmed } : s)),
      );
    }
    cancelEditingSubtask();
  };

  // Commit an existing (edit-mode) subtask rename, persisting via the same
  // PUT path used by toggleSubtaskComplete. Empty name reverts (no request).
  const commitExistingSubtaskEdit = async (subtask: Task) => {
    const trimmed = editingSubtaskValue.trim();
    cancelEditingSubtask();
    if (!trimmed || trimmed === subtask.name) return;
    try {
      const response = await fetch(`/api/tasks/${subtask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.ok && onDataRefresh) {
        onDataRefresh();
      }
    } catch (error) {
      console.error("Failed to rename subtask:", error);
    }
  };

  const toggleSubtaskComplete = async (subtask: Task) => {
    try {
      const response = await fetch(`/api/tasks/${subtask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !subtask.completed }),
      });

      if (response.ok && onDataRefresh) {
        onDataRefresh();
      }
    } catch (error) {
      console.error("Failed to update subtask:", error);
    }
  };

  const confirmDeleteSubtask = async () => {
    if (!subtaskToDelete) return;
    if (subtaskToDelete.kind === "pending") {
      const { index } = subtaskToDelete;
      setPendingSubtasks((prev) => prev.filter((_, i) => i !== index));
      setSubtaskToDelete(null);
      return;
    }
    setIsDeletingSubtask(true);
    try {
      const response = await fetch(`/api/tasks/${subtaskToDelete.id}`, {
        method: "DELETE",
      });
      if (response.ok && onDataRefresh) {
        onDataRefresh();
      }
    } catch (error) {
      console.error("Failed to delete subtask:", error);
    } finally {
      setIsDeletingSubtask(false);
      setSubtaskToDelete(null);
    }
  };

  if (!isOpen) return null;

  const currentProject = data.projects.find((p) => p.id === selectedProject);
  const projectColor = currentProject?.color || "#6B7280";
  const parentTask =
    task && task.parentId
      ? data.tasks.find((t) => t.id === task.parentId)
      : null;
  const savedSubtasks =
    isEditMode && task ? data.tasks.filter((t) => t.parentId === task.id) : [];
  // Optimistic rows drop out as soon as the refreshed data carries the same id.
  const subtasks = [
    ...savedSubtasks,
    ...optimisticSubtasks.filter(
      (o) => !savedSubtasks.some((s) => s.id === o.id),
    ),
  ];

  // Highlight deadlines
  const deadlineHighlight =
    deadline && new Date(deadline) < new Date()
      ? "text-red-500"
      : deadline &&
          new Date(deadline) < new Date(Date.now() + 24 * 60 * 60 * 1000)
        ? "text-[rgb(var(--theme-primary-rgb))]"
        : "";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      style={{ ...(stackStyle || {}), zIndex: stackZIndex ?? 50 }}
    >
      <div
        ref={modalRef}
        className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-zinc-800"
      >
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-white">
            {isEditMode ? "Edit Task" : "Add Task"}
          </h2>
          <div className="flex items-center gap-3">
            {stackHeaderExtra}
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Task sections"
          className="sticky top-[65px] z-10 flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 px-6 py-2"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                activeTab === tab.key
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className={tabPanelClass("details")}>
          {/* Parent task navigation (edit mode only) */}
          {isEditMode && parentTask && onTaskSelect && (
            <button
              type="button"
              onClick={() => onTaskSelect(parentTask)}
              className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-2"
            >
              ← Go to parent task: {parentTask.name}
            </button>
          )}

          </div>
          <div className={tabPanelClass("details")}>
          {/* Task Name */}
          <div className="relative">
            {/* Task id sits inline with the Title label rather than above it,
                so the field keeps a single header row. */}
            <div className="mb-1.5 flex items-center gap-2">
              <label
                htmlFor={titleInputId}
                className="block text-xs font-medium uppercase tracking-wide text-zinc-400"
              >
                Title
              </label>
              {isEditMode && task && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(task.id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 1000);
                    } catch {}
                  }}
                  className="relative flex items-center gap-1 font-mono text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                  title="Click to copy task ID"
                >
                  <Hash className="w-3 h-3" />
                  {task.id.slice(0, 8)}
                  {copiedId && (
                    <span className="absolute left-full ml-2 whitespace-nowrap text-xs sm:text-[10px] font-medium text-green-400 animate-fade-in-up-out">
                      Copied!
                    </span>
                  )}
                </button>
              )}
              {/* A supply is identified by its make/model or type rather than a
                  free-text title, so the toggle lives in the Title header row
                  and swaps the input below for the supply fields. */}
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isSupply}
                  onChange={(e) => setIsSupply(e.target.checked)}
                  className="accent-[rgb(var(--theme-primary-rgb))]"
                />
                <ShoppingCart className="h-3.5 w-3.5" />
                This is a supply
              </label>
            </div>
            {isSupply ? (
              renderSupplyFields()
            ) : (
            <>
            <input
              id={titleInputId}
              ref={titleInputRef}
              type="text"
              value={taskName}
              onChange={(e) => {
                const value = e.target.value;
                const cursorPos = e.target.selectionStart || 0;
                setTaskName(value);
                setCursorPosition(cursorPos);

                // Check for a "%" blocking-task mention
                const mention = detectBlockerMention(value, cursorPos);
                if (mention) {
                  setBlockerMention({ field: "title", ...mention });
                  setBlockerMentionIndex(0);
                } else {
                  closeBlockerMention();
                }

                // Check for an "@" user-assignment mention
                const uMention = detectUserMention(value, cursorPos);
                if (uMention) {
                  setUserMention({ field: "title", ...uMention });
                  setUserMentionIndex(0);
                } else {
                  closeUserMention();
                }

                // Check if user typed #
                const beforeCursor = value.substring(0, cursorPos);
                const lastHashIndex = beforeCursor.lastIndexOf("#");

                if (lastHashIndex !== -1 && lastHashIndex === cursorPos - 1) {
                  // Just typed #, show all projects
                  setShowProjectSuggestions(true);
                  setProjectSearchQuery("");
                } else if (lastHashIndex !== -1 && showProjectSuggestions) {
                  // Check if we're still in a project search (no space after #)
                  const afterHash = value.substring(
                    lastHashIndex + 1,
                    cursorPos,
                  );
                  if (!afterHash.includes(" ")) {
                    setProjectSearchQuery(afterHash);
                  } else {
                    setShowProjectSuggestions(false);
                  }
                } else {
                  setShowProjectSuggestions(false);
                }
              }}
              onKeyDown={(e) => {
                if (handleUserMentionKeyDown(e)) return;
                if (handleBlockerMentionKeyDown(e)) return;
                if (
                  showProjectSuggestions &&
                  (e.key === "Escape" ||
                    (e.key === " " && projectSearchQuery === ""))
                ) {
                  setShowProjectSuggestions(false);
                }
              }}
              placeholder="Title"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition-colors placeholder-zinc-500 focus-theme"
              autoFocus
            />

            {renderBlockerMentionPopover("title")}
            {renderUserMentionPopover("title")}

            {/* Project Suggestions Dropdown */}
            {showProjectSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {(() => {
                  const query = projectSearchQuery.trim();
                  const matches = data.projects.filter((project) =>
                    project.name
                      .toLowerCase()
                      .includes(projectSearchQuery.toLowerCase()),
                  );
                  const hasExactMatch =
                    query.length > 0 &&
                    data.projects.some(
                      (project) =>
                        project.name.toLowerCase() === query.toLowerCase(),
                    );

                  return (
                    <>
                      {matches.map((project) => {
                        const orgId =
                          (project as any).organizationId ||
                          (project as any).organization_id;
                        const org = data.organizations.find(
                          (o) => o.id === orgId,
                        );
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => {
                              // Replace the #query with the project name
                              const beforeCursor = taskName.substring(
                                0,
                                cursorPosition,
                              );
                              const afterCursor =
                                taskName.substring(cursorPosition);
                              const lastHashIndex =
                                beforeCursor.lastIndexOf("#");

                              if (lastHashIndex !== -1) {
                                const newTaskName =
                                  taskName.substring(0, lastHashIndex) +
                                  "#" +
                                  project.name +
                                  " " +
                                  afterCursor;
                                setTaskName(newTaskName);
                                setSelectedProject(project.id);
                              }

                              setShowProjectSuggestions(false);
                              setProjectSearchQuery("");

                              // Focus back on input
                              titleInputRef.current?.focus();
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center gap-2"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="text-sm text-white">
                              {project.name}
                            </span>
                            {org && (
                              <span className="text-xs text-zinc-400">
                                • {org.name}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {query && !hasExactMatch && (
                        <button
                          type="button"
                          onClick={() =>
                            createProjectQuick(query, {
                              insertInTitle: true,
                              closeSuggestions: true,
                            })
                          }
                          disabled={isCreatingProject}
                          className="w-full px-4 py-2 text-left hover:bg-zinc-700 transition-colors flex items-center gap-2 text-zinc-200"
                        >
                          <Plus className="w-3 h-3" />
                          <span className="text-sm">
                            {isCreatingProject
                              ? "Creating project..."
                              : `Create project "${query}"`}
                          </span>
                        </button>
                      )}
                      {matches.length === 0 && !query && (
                        <div className="px-4 py-2 text-sm text-zinc-400">
                          No projects found
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            </>
            )}
          </div>

          </div>
          <div className={tabPanelClass("details")}>
          {/* Goal */}
          {(() => {
            const goalProjectId = selectedProject || defaultProjectId || "";
            const availableGoals = (data.goals || []).filter((goal) => {
              const gProjectId = (goal as any).project_id || goal.projectId;
              if (gProjectId !== goalProjectId) return false;
              if (goal.completed) return false;
              const gSectionId = (goal as any).section_id || goal.sectionId;
              // Show project-level goals plus goals in the task's section (if any).
              if (!gSectionId) return true;
              if (defaultSectionId) return gSectionId === defaultSectionId;
              return true;
            });
            // Rendered even with no goals yet: the picker is the only place to
            // create one, so hiding it when the list is empty left no way in.
            const parentGoal = availableGoals.find(
              (g) => g.id === selectedGoalId,
            );

            const createGoal = async () => {
              const name = newGoalName.trim();
              if (!name || !goalProjectId || isSavingGoal) return;
              setIsSavingGoal(true);
              try {
                const response = await fetch("/api/goals", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    name,
                    projectId: goalProjectId,
                    ...(defaultSectionId ? { sectionId: defaultSectionId } : {}),
                    // Nest under whatever is currently selected, so choosing a
                    // goal then adding one puts the new goal inside it.
                    ...(selectedGoalId ? { parentGoalId: selectedGoalId } : {}),
                  }),
                });
                if (!response.ok) {
                  console.error("Failed to create goal:", await response.text());
                  return;
                }
                const created = await response.json().catch(() => null);
                const createdId = created?.goal?.id || created?.id;
                if (createdId) setSelectedGoalId(createdId);
                setNewGoalName("");
                setIsAddingGoal(false);
                onDataRefresh?.();
              } finally {
                setIsSavingGoal(false);
              }
            };

            return (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Target className="w-4 h-4" />
                    Goal
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingGoal((v) => !v)}
                    className="flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New goal
                  </button>
                </div>
                <select
                  value={selectedGoalId}
                  onChange={(e) => setSelectedGoalId(e.target.value)}
                  className="w-full bg-zinc-800 text-white rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
                >
                  <option value="">No goal</option>
                  {availableGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
                {isAddingGoal && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={newGoalName}
                      onChange={(e) => setNewGoalName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createGoal();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setIsAddingGoal(false);
                          setNewGoalName("");
                        }
                      }}
                      placeholder={
                        parentGoal
                          ? `New goal inside "${parentGoal.name}"`
                          : "New goal name"
                      }
                      autoFocus
                      className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
                    />
                    <button
                      type="button"
                      onClick={() => void createGoal()}
                      disabled={!newGoalName.trim() || isSavingGoal}
                      className="flex items-center gap-1.5 rounded-lg btn-theme-primary px-3 py-2 text-sm text-white transition-all disabled:opacity-60"
                    >
                      {isSavingGoal && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Add
                    </button>
                  </div>
                )}
                {parentGoal && isAddingGoal && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Nests inside &quot;{parentGoal.name}&quot;. Clear the goal
                    above to create a top-level one.
                  </p>
                )}
              </div>
            );
          })()}

          </div>
          <div className={tabPanelClass("details")}>
          {/* Description */}
          <div className="relative">
            <label
              htmlFor={descriptionInputId}
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400"
            >
              Description
            </label>
            <textarea
              id={descriptionInputId}
              ref={descriptionInputRef}
              value={description}
              onChange={(e) => {
                const value = e.target.value;
                const cursorPos = e.target.selectionStart || 0;
                setDescription(value);
                const mention = detectBlockerMention(value, cursorPos);
                if (mention) {
                  setBlockerMention({ field: "description", ...mention });
                  setBlockerMentionIndex(0);
                } else {
                  closeBlockerMention();
                }
              }}
              onKeyDown={(e) => {
                handleBlockerMentionKeyDown(e);
              }}
              placeholder="Description (type % to link a blocking task)"
              className="min-h-[100px] w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white transition-colors placeholder-zinc-500 focus-theme"
            />
            {renderBlockerMentionPopover("description")}
          </div>

          </div>
          <div className={tabPanelClass("details")}>
          {/* Attachments */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
              {isUploading ? "Uploading..." : "Upload File"}
            </button>

            {attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm"
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span className="text-zinc-200 truncate flex-1">
                      {att.name}
                    </span>
                    {att.sizeBytes && (
                      <span className="text-zinc-500 text-xs flex-shrink-0">
                        {formatFileSize(att.sizeBytes)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          </div>
          <div className={tabPanelClass("details")}>
          {/* Project & Parent Task */}
          <div className="grid grid-cols-2 gap-4">
            <div ref={projectDropdownRef}>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Hash className="w-4 h-4" />
                Project
              </div>
              <div className="relative">
                {showProjectDropdown ? (
                  <input
                    type="text"
                    value={projectFilterQuery}
                    onChange={(e) => setProjectFilterQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const query = projectFilterQuery.trim();
                        if (query) {
                          createProjectQuick(query, { closeDropdown: true });
                        }
                      }
                    }}
                    placeholder="Search projects..."
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectDropdown(true);
                      setProjectFilterQuery("");
                    }}
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all flex items-center justify-between"
                  >
                    {selectedProject && data?.projects ? (
                      (() => {
                        const project = data.projects.find(
                          (p) => p.id === selectedProject,
                        );
                        return project ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <span>{project.name}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">
                            Select a project
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-zinc-400">Select a project</span>
                    )}
                    <svg
                      className="w-4 h-4 text-zinc-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                )}

                {showProjectDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {(() => {
                      const query = projectFilterQuery.trim();
                      const hasExactMatch =
                        query.length > 0 &&
                        data.projects.some(
                          (project) =>
                            project.name.toLowerCase() === query.toLowerCase(),
                        );
                      if (!query || hasExactMatch) return null;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            createProjectQuick(query, { closeDropdown: true })
                          }
                          disabled={isCreatingProject}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors text-zinc-200 hover:bg-zinc-700 border-b border-zinc-700"
                        >
                          <Plus className="w-3 h-3" />
                          <span>
                            {isCreatingProject
                              ? "Creating project..."
                              : `Create project "${query}"`}
                          </span>
                        </button>
                      );
                    })()}
                    {data?.organizations?.map((org) => {
                      const orgProjects =
                        data.projects?.filter(
                          (p) =>
                            p.organizationId === org.id &&
                            !p.archived &&
                            p.name
                              .toLowerCase()
                              .includes(projectFilterQuery.toLowerCase()),
                        ) || [];
                      if (orgProjects.length === 0) return null;

                      return (
                        <div key={org.id}>
                          <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-800/50 sticky top-0">
                            {org.name}
                          </div>
                          {orgProjects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                setSelectedProject(project.id);
                                setShowProjectDropdown(false);
                                setProjectFilterQuery("");
                              }}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                selectedProject === project.id
                                  ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-white"
                                  : "text-zinc-300 hover:bg-zinc-700"
                              }`}
                            >
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              <span>{project.name}</span>
                              {selectedProject === project.id && (
                                <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {/* Orphan projects */}
                    {(() => {
                      const orphanProjects =
                        data.projects?.filter(
                          (p) =>
                            !p.organizationId &&
                            !p.archived &&
                            p.name
                              .toLowerCase()
                              .includes(projectFilterQuery.toLowerCase()),
                        ) || [];
                      if (orphanProjects.length > 0) {
                        return (
                          <div>
                            <div className="px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider bg-zinc-800/50 sticky top-0">
                              Other
                            </div>
                            {orphanProjects.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                onClick={() => {
                                  setSelectedProject(project.id);
                                  setShowProjectDropdown(false);
                                  setProjectFilterQuery("");
                                }}
                                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                  selectedProject === project.id
                                    ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-white"
                                    : "text-zinc-300 hover:bg-zinc-700"
                                }`}
                              >
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: project.color }}
                                />
                                <span>{project.name}</span>
                                {selectedProject === project.id && (
                                  <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* No results */}
                    {projectFilterQuery &&
                      data.projects?.filter(
                        (p) =>
                          !p.archived &&
                          p.name
                            .toLowerCase()
                            .includes(projectFilterQuery.toLowerCase()),
                      ).length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No projects found
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Hash className="w-4 h-4" />
                Parent Task (Optional)
              </div>
              <Select
                value={selectedParentTask || "none"}
                onValueChange={(value) =>
                  setSelectedParentTask(value === "none" ? null : value)
                }
                disabled={!selectedProject}
              >
                <SelectTrigger className="w-full bg-zinc-800 text-white border-zinc-700 focus:ring-2 ring-theme transition-all">
                  <SelectValue
                    placeholder={
                      !selectedProject
                        ? "Select a project first"
                        : "No parent task"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectedProject && (
                    <>
                      <SelectItem value="none">
                        <span className="text-zinc-400">No parent task</span>
                      </SelectItem>
                      {data.tasks
                        .filter(
                          (t) =>
                            t.projectId === selectedProject &&
                            !t.completed &&
                            (!isEditMode || t.id !== task?.id),
                        )
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span>
                                {t.parentId ? "↳ " : ""}
                                {t.name}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Start Date & Time */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              Start Date
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 bg-transparent text-white pl-3 pr-2 py-3 focus:outline-none themed-date-input"
                />
                <button
                  onClick={() => setStartDate("")}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <TimePicker
                  value={startTime}
                  onChange={setStartTime}
                  placeholder="Select time"
                  className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
                />
                {startTime && (
                  <button
                    onClick={() => setStartTime("")}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* End Date & Time */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              End Date
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 bg-transparent text-white pl-3 pr-2 py-3 focus:outline-none themed-date-input"
                />
                <button
                  onClick={() => setEndDate("")}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <TimePicker
                  value={endTime}
                  onChange={setEndTime}
                  placeholder="Select time"
                  className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
                />
                {endTime && (
                  <button
                    onClick={() => setEndTime("")}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Due Date & Time */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Calendar className="w-4 h-4" />
                Due Date
              </div>
              <button
                type="button"
                onClick={() => setDueDate(todayDateValue)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  dueDate === todayDateValue
                    ? "border-[rgb(var(--theme-primary-rgb))]/50 bg-[rgb(var(--theme-primary-rgb))]/15 text-[rgb(var(--theme-primary-rgb))]"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
                }`}
              >
                <CalendarCheck className="h-3.5 w-3.5" />
                Today
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    const nextDueDate = e.target.value;
                    setDueDate(nextDueDate);
                    if (!nextDueDate) setDueTime("");
                  }}
                  className="flex-1 bg-transparent text-white pl-3 pr-2 py-3 focus:outline-none themed-date-input"
                />
                <button
                  onClick={() => {
                    setDueDate("");
                    setDueTime("");
                  }}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <TimePicker
                  value={dueTime}
                  onChange={setDueTime}
                  placeholder="Select time"
                  className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
                />
                {dueTime && (
                  <button
                    onClick={() => setDueTime("")}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Time Estimate */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time Estimate
              </div>
              <button
                type="button"
                disabled={estimateSuggesting || !taskName.trim()}
                onClick={async () => {
                  setEstimateError(null);
                  setEstimateSuggesting(true);
                  try {
                    const response = await fetch("/api/tasks/estimate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: taskName,
                        description,
                      }),
                    });
                    if (!response.ok) {
                      const errorPayload = await response
                        .json()
                        .catch(() => ({}));
                      throw new Error(
                        errorPayload?.error ||
                          `Estimate failed (${response.status})`,
                      );
                    }
                    const payload = await response.json();
                    if (typeof payload?.minutes === "number") {
                      setTimeEstimate(String(payload.minutes));
                    }
                  } catch (error) {
                    setEstimateError(
                      error instanceof Error
                        ? error.message
                        : "Failed to estimate task",
                    );
                  } finally {
                    setEstimateSuggesting(false);
                  }
                }}
                className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="Suggest an estimate based on the task name and description"
              >
                {estimateSuggesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Suggest
              </button>
            </div>
            {estimateError ? (
              <div className="mb-2 text-xs text-red-400">{estimateError}</div>
            ) : null}
            <div className="flex items-center gap-2">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="number"
                  min="0"
                  value={timeEstimate}
                  onChange={(e) => setTimeEstimate(e.target.value)}
                  placeholder="Minutes"
                  className="w-24 bg-transparent text-white pl-3 pr-2 py-3 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-zinc-500 pr-2">min</span>
                {timeEstimate && (
                  <button
                    onClick={() => setTimeEstimate("")}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "15m", value: "15" },
                  { label: "30m", value: "30" },
                  { label: "1h", value: "60" },
                  { label: "2h", value: "120" },
                  { label: "4h", value: "240" },
                  { label: "8h", value: "480" },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      setTimeEstimate(
                        timeEstimate === preset.value ? "" : preset.value,
                      )
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      timeEstimate === preset.value
                        ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/40"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Deadline */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
              <Calendar className="w-4 h-4" />
              Deadline
              {deadlineHighlight && (
                <span className={`text-xs ${deadlineHighlight}`}>
                  {new Date(deadline) < new Date() ? "Overdue" : "Due soon"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Calendar className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={`flex-1 bg-transparent pl-3 pr-2 py-3 focus:outline-none themed-date-input ${
                    deadlineHighlight ? deadlineHighlight : "text-white"
                  }`}
                />
                <button
                  onClick={() => setDeadline("")}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                <Clock className="ml-4 w-4 h-4 text-zinc-500 flex-shrink-0" />
                <TimePicker
                  value={deadlineTime}
                  onChange={setDeadlineTime}
                  placeholder="Select time"
                  className="bg-transparent border-0 hover:bg-transparent focus:ring-0 flex-1"
                />
                {deadlineTime && (
                  <button
                    onClick={() => setDeadlineTime("")}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("assigned")}>
          {/* Assignee & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <User className="w-4 h-4" />
                  Assigned to
                </div>
                {currentUserId && (
                  <button
                    type="button"
                    onClick={handleAssignToCurrentUser}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isAssignedToCurrentUser
                        ? "border-[rgb(var(--theme-primary-rgb))]/50 bg-[rgb(var(--theme-primary-rgb))]/15 text-[rgb(var(--theme-primary-rgb))]"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
                    }`}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Me
                  </button>
                )}
              </div>
              {assignedUser ? (
                <div className="flex items-center gap-2 text-sm bg-zinc-800 rounded px-3 py-2.5 h-[42px]">
                  <UserAvatar
                    name={getUserDisplayName(assignedUser)}
                    profileColor={assignedUser.profileColor}
                    memoji={assignedUser.profileMemoji}
                    size={24}
                    className="text-xs font-medium flex-shrink-0"
                  />
                  <span className="text-zinc-300 flex-1">
                    {getUserDisplayName(assignedUser)}
                    {isCurrentUserProfile(assignedUser) && (
                      <span className="ml-2 text-xs text-[rgb(var(--theme-primary-rgb))]">
                        You
                      </span>
                    )}
                    {isPendingUser(assignedUser) && (
                      <span className="ml-2 text-xs text-yellow-500">
                        (Pending)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssignedTo(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : showUserDropdown ? (
                <div className="relative">
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white transition-colors focus:outline-none focus:ring-2 ring-theme"
                    autoFocus
                  />
                  <div className="absolute top-full mt-1 w-full bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 max-h-48 overflow-y-auto z-50">
                    {assignableUsers.map((user) => {
                      const displayName = getUserDisplayName(user);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleAssignUser(user.id)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-700 transition-colors text-left"
                        >
                          <UserAvatar
                            name={displayName}
                            profileColor={user.profileColor}
                            memoji={user.profileMemoji}
                            size={24}
                            className="text-xs font-medium flex-shrink-0"
                          />
                          <div className="flex-1 text-sm">
                            <p className="font-medium">
                              {displayName}
                              {isCurrentUserProfile(user) && (
                                <span className="ml-2 text-xs text-[rgb(var(--theme-primary-rgb))]">
                                  You
                                </span>
                              )}
                              {isPendingUser(user) && (
                                <span className="ml-2 text-xs text-yellow-500">
                                  (Pending)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {user.email}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {assignableUsers.length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-500">
                        No users found
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setUserSearchQuery("");
                    }}
                    className="absolute right-2 top-2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(true)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors text-sm w-full h-[42px]"
                >
                  <User className="w-4 h-4" />
                  Assign to someone
                </button>
              )}
            </div>

            <div ref={priorityDropdownRef}>
              <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
                <Flag className="w-4 h-4" />
                Priority
              </div>
              <div className="relative">
                {showPriorityDropdown ? (
                  <input
                    type="text"
                    value={priorityFilterQuery}
                    onChange={(e) => setPriorityFilterQuery(e.target.value)}
                    placeholder="Search priority..."
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPriorityDropdown(true);
                      setPriorityFilterQuery("");
                    }}
                    className="w-full bg-zinc-800 text-white text-sm px-3 py-2.5 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 ring-theme transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          priority === 1
                            ? "bg-red-500"
                            : priority === 2
                              ? "bg-orange-500"
                              : priority === 3
                                ? "bg-blue-500"
                                : "bg-zinc-500"
                        }`}
                      />
                      <span>
                        Priority {priority}{" "}
                        {priority === 1
                          ? "(Highest)"
                          : priority === 4
                            ? "(Lowest)"
                            : ""}
                      </span>
                    </div>
                    <svg
                      className="w-4 h-4 text-zinc-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                )}

                {showPriorityDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                    {[
                      {
                        value: 1,
                        label: "Priority 1 (Highest)",
                        color: "bg-red-500",
                      },
                      {
                        value: 2,
                        label: "Priority 2 (High)",
                        color: "bg-orange-500",
                      },
                      {
                        value: 3,
                        label: "Priority 3 (Medium)",
                        color: "bg-blue-500",
                      },
                      {
                        value: 4,
                        label: "Priority 4 (Lowest)",
                        color: "bg-zinc-500",
                      },
                    ]
                      .filter(
                        (p) =>
                          p.label
                            .toLowerCase()
                            .includes(priorityFilterQuery.toLowerCase()) ||
                          `p${p.value}`.includes(
                            priorityFilterQuery.toLowerCase(),
                          ),
                      )
                      .map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            setPriority(p.value as 1 | 2 | 3 | 4);
                            setShowPriorityDropdown(false);
                            setPriorityFilterQuery("");
                          }}
                          className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                            priority === p.value
                              ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-white"
                              : "text-zinc-300 hover:bg-zinc-700"
                          }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full flex-shrink-0 ${p.color}`}
                          />
                          <span>{p.label}</span>
                          {priority === p.value && (
                            <Check className="w-4 h-4 ml-auto text-[rgb(var(--theme-primary-rgb))]" />
                          )}
                        </button>
                      ))}
                    {priorityFilterQuery &&
                      [1, 2, 3, 4].filter(
                        (p) =>
                          `priority ${p}`.includes(
                            priorityFilterQuery.toLowerCase(),
                          ) ||
                          `p${p}`.includes(priorityFilterQuery.toLowerCase()),
                      ).length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No priorities found
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>

          </div>
          <div className={tabPanelClass("assigned")}>
          {/* Requires Human in the Loop (HITL) to complete */}
          <div>
            <button
              type="button"
              onClick={() => setRequiresHitl((v) => !v)}
              aria-pressed={requiresHitl}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-left transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start gap-2">
                <UserCheck
                  className={`mt-0.5 h-4 w-4 ${
                    requiresHitl ? "text-amber-400" : "text-zinc-400"
                  }`}
                />
                <div>
                  <div className="text-sm font-medium text-zinc-200">
                    Requires Human in the Loop (HITL) to complete
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    AI agents won&apos;t auto-complete this task — only a human
                    can mark it done.
                  </div>
                </div>
              </div>
              <span
                aria-hidden
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  requiresHitl ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    requiresHitl ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Reminders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Bell className="w-4 h-4" />
                Reminders
              </div>
              {!showReminderInput && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowReminderInput(true)}
                  title="Add Reminder"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-center gap-2 mb-2 text-sm"
              >
                <div className="bg-zinc-800 rounded px-3 py-1.5 flex items-center gap-2">
                  <Bell className="w-3 h-3 text-zinc-400" />
                  <span className="text-zinc-300">
                    {format(new Date(reminder.value), "MMM d, yyyy h:mm a")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveReminder(reminder.id)}
                    className="text-zinc-500 hover:text-white ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {showReminderInput ? (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newReminderDate}
                  onChange={(e) => setNewReminderDate(e.target.value)}
                  className="flex-1 bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all themed-date-input"
                  placeholder="Select date"
                />
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(e) => setNewReminderTime(e.target.value)}
                  className="bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all themed-date-input"
                  placeholder="Time (optional)"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowReminderInput(false);
                    setNewReminderDate("");
                    setNewReminderTime("");
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>

          </div>
          <div className={tabPanelClass("details")}>
          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Tag className="w-4 h-4" />
                Tags
              </div>
              {!showAddTag && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowAddTag(true)}
                  title="Add Tag"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    selectedTags.includes(tag.id)
                      ? "bg-opacity-100 text-white"
                      : "bg-opacity-20 text-zinc-400 hover:bg-opacity-40"
                  } ${bouncingTagId === tag.id ? "animate-bounce" : ""}`}
                  style={{
                    backgroundColor: selectedTags.includes(tag.id)
                      ? tag.color
                      : tag.color + "33",
                  }}
                >
                  {tag.name}
                </button>
              ))}
              {showAddTag ? (
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), handleAddTag())
                      }
                      placeholder="Tag name"
                      className="bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme w-32 transition-all"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="text-zinc-400 hover:text-white"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddTag(false);
                        setNewTagName("");
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {tagSuggestions.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-10 w-48 max-h-32 overflow-y-auto">
                      {tagSuggestions.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleSelectTagSuggestion(tag)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors flex items-center gap-2"
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-zinc-300">{tag.name}</span>
                          {selectedTags.includes(tag.id) && (
                            <span className="text-xs text-zinc-500 ml-auto">
                              Selected
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          </div>
          <div className={tabPanelClass("dependencies")}>
          {/* Dependencies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Link2 className="w-4 h-4" />
                Dependencies
                {isTaskBlocked(
                  task ||
                    ({
                      id: "temp",
                      name: taskName,
                      completed: false,
                      dependsOn: dependencies,
                    } as unknown as Task),
                  data.tasks,
                ) && (
                  <span className="text-xs text-[rgb(var(--theme-primary-rgb))] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Blocked
                  </span>
                )}
              </div>
              {!showDependencyPicker && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setShowDependencyPicker(true)}
                  title="Add Dependency"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            {/* Compact blocker badges (icon-only, reveal on hover/click) */}
            {dependencies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {dependencies.map((depId) => {
                  const depTask = data.tasks.find((t) => t.id === depId);
                  if (!depTask) return null;
                  const expanded = expandedBlockerId === depId;
                  return (
                    <div
                      key={`badge-${depId}`}
                      className="relative group/blocker"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBlockerId(expanded ? null : depId)
                        }
                        className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[rgb(var(--theme-primary-rgb))] hover:bg-zinc-700 transition-colors"
                        title={`Blocked by: ${depTask.name}`}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDependencies(
                            dependencies.filter((id) => id !== depId),
                          )
                        }
                        className="absolute -top-1 -right-1 rounded-full bg-zinc-700 text-zinc-300 hover:bg-red-500 hover:text-white p-0.5 opacity-0 group-hover/blocker:opacity-100 transition-opacity"
                        aria-label="Remove blocker"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      {/* Reveal full task on hover or click */}
                      <div
                        className={`absolute left-0 bottom-full mb-1 w-56 rounded-lg border border-zinc-700 bg-black px-3 py-2 shadow-lg z-50 transition-opacity ${
                          expanded
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none group-hover/blocker:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs sm:text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                          <Link2 className="w-3 h-3" />
                          Blocked by
                        </div>
                        <div
                          className={`text-sm ${depTask.completed ? "line-through text-zinc-500" : "text-white"}`}
                        >
                          {depTask.name}
                        </div>
                        {depTask.description && (
                          <div className="mt-1 text-xs text-zinc-400 line-clamp-3">
                            {depTask.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Dependencies */}
            {dependencies.length > 0 && (
              <div className="space-y-2 mb-3">
                {dependencies.map((depId) => {
                  const depTask = data.tasks.find((t) => t.id === depId);
                  if (!depTask) return null;

                  return (
                    <div
                      key={depId}
                      className="flex items-center gap-2 bg-zinc-800 rounded px-3 py-2"
                    >
                      <button
                        type="button"
                        className="text-zinc-400 hover:text-white"
                        disabled
                      >
                        {depTask.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                      <span
                        className={`flex-1 text-sm ${depTask.completed ? "line-through text-zinc-500" : "text-zinc-300"}`}
                      >
                        {depTask.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDependencies(
                            dependencies.filter((id) => id !== depId),
                          )
                        }
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dependency Picker */}
            {showDependencyPicker && (
              <div className="relative mb-3">
                <input
                  type="text"
                  value={dependencySearchQuery}
                  onChange={(e) => setDependencySearchQuery(e.target.value)}
                  placeholder="Search tasks to depend on..."
                  className="w-full bg-zinc-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                  autoFocus
                />

                <div className="absolute top-full mt-1 w-full bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 max-h-48 overflow-y-auto z-50">
                  {(() => {
                    const query = dependencySearchQuery.toLowerCase().trim();

                    // Tasks that are structurally excluded from the picker
                    // entirely (the current task and its own subtasks).
                    const isExcluded = (t: Task) =>
                      !!task && (t.id === task.id || t.parentId === task.id);

                    const matchesSearch = (t: Task) =>
                      !query || t.name.toLowerCase().includes(query);

                    const byParent = new Map<string, Task[]>();
                    const roots: Task[] = [];
                    const byId = new Map<string, Task>();
                    for (const t of data.tasks) {
                      byId.set(t.id, t);
                    }
                    for (const t of data.tasks) {
                      if (isExcluded(t)) continue;
                      const parentId = t.parentId;
                      // Treat a task as a root in the picker if it has no
                      // parent, or its parent is not present/visible here.
                      if (parentId && byId.has(parentId) && !isExcluded(byId.get(parentId)!)) {
                        const arr = byParent.get(parentId) ?? [];
                        arr.push(t);
                        byParent.set(parentId, arr);
                      } else {
                        roots.push(t);
                      }
                    }

                    // When searching, only render branches that contain at
                    // least one matching descendant (or match themselves).
                    const branchMatches = (t: Task): boolean => {
                      if (matchesSearch(t)) return true;
                      return (byParent.get(t.id) ?? []).some(branchMatches);
                    };

                    const rows: ReactNode[] = [];

                    const renderTask = (t: Task, depth: number) => {
                      const children = byParent.get(t.id) ?? [];
                      const selfMatches = matchesSearch(t);
                      const childrenToShow = query
                        ? children.filter(branchMatches)
                        : children;

                      // While searching, skip tasks that neither match nor
                      // have matching descendants.
                      if (query && !selfMatches && childrenToShow.length === 0) {
                        return;
                      }

                      const validation = canBeSelectedAsDependency(
                        task?.id || "new-task",
                        t.id,
                        data.tasks,
                      );
                      // A non-matching parent that only exists to give context
                      // to matching children renders as a non-selectable header.
                      const isContextHeader = query
                        ? !selfMatches && childrenToShow.length > 0
                        : false;
                      const selectable = validation.canSelect && !isContextHeader;

                      rows.push(
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (selectable) {
                              setDependencies([...dependencies, t.id]);
                              setShowDependencyPicker(false);
                              setDependencySearchQuery("");
                            }
                          }}
                          disabled={!selectable}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                        >
                          {depth > 0 && (
                            <CornerDownRight className="w-3 h-3 text-zinc-500 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm truncate ${
                                isContextHeader
                                  ? "text-zinc-500 font-medium"
                                  : "text-zinc-300"
                              }`}
                            >
                              {t.name}
                            </div>
                            {!selectable && !isContextHeader && (
                              <div className="text-xs text-red-400">
                                {validation.reason}
                              </div>
                            )}
                          </div>
                          {t.completed && (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          )}
                        </button>,
                      );

                      for (const child of childrenToShow) {
                        renderTask(child, depth + 1);
                      }
                    };

                    const rootsToRender = query
                      ? roots.filter(branchMatches)
                      : roots;
                    for (const root of rootsToRender) {
                      renderTask(root, 0);
                    }

                    if (rows.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No tasks found
                        </div>
                      );
                    }

                    return rows;
                  })()}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowDependencyPicker(false);
                    setDependencySearchQuery("");
                  }}
                  className="absolute right-2 top-2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          </div>
          <div className={tabPanelClass("schedule")}>
          {/* Recurring */}
          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
              <Repeat2 className="w-4 h-4" />
              Recurring
            </label>
            <RecurringPicker
              value={recurringConfig}
              onChange={setRecurringConfig}
            />
          </div>

          </div>
          <div className={tabPanelClass("dependencies")}>
          {/* Stakes (Domino Effect) — edit mode only, once a task id exists */}
          {isEditMode && task?.id ? (
            <StakeEditor
              taskId={task.id}
              organizationId={getDefaultOrganizationId() || undefined}
            />
          ) : null}

          </div>
          <div className={tabPanelClass("subtasks")}>
          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <CornerDownRight className="w-4 h-4" />
                Subtasks
              </div>
              {!isAddingSubtask && (
                <div
                  className="icon-circle-bg cursor-pointer"
                  onClick={() => setIsAddingSubtask(true)}
                  title="Add Subtask"
                >
                  <Plus className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            {/* Existing subtasks (edit mode) */}
            {isEditMode &&
              subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className={`flex items-center gap-2 mb-2 ${
                    (subtask as any)._saving ? "animate-breathe" : ""
                  }`}
                >
                  <button
                    type="button"
                    disabled={(subtask as any)._saving}
                    onClick={() => toggleSubtaskComplete(subtask)}
                    className="text-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {subtask.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  {editingSubtaskKey === subtask.id ? (
                    <input
                      ref={editingSubtaskInputRef}
                      type="text"
                      value={editingSubtaskValue}
                      onChange={(e) => setEditingSubtaskValue(e.target.value)}
                      onBlur={() => commitExistingSubtaskEdit(subtask)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitExistingSubtaskEdit(subtask);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditingSubtask();
                        }
                      }}
                      className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => {
                        if ((subtask as any)._saving) return;
                        startEditingSubtask(subtask.id, subtask.name);
                      }}
                      title="Double-click to rename"
                      className={`flex-1 cursor-text ${subtask.completed ? "line-through text-zinc-500" : "text-zinc-300"}`}
                    >
                      {subtask.name}
                    </span>
                  )}
                  {(() => {
                    const est =
                      (subtask as any).time_estimate ?? subtask.timeEstimate;
                    return est != null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        {est}m
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const dd =
                      (subtask as any).due_date ?? subtask.dueDate;
                    return dd ? (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                        <Calendar className="w-3 h-3" />
                        {dd}
                      </span>
                    ) : null;
                  })()}
                  {onTaskSelect && (
                    <button
                      type="button"
                      onClick={() => onTaskSelect(subtask)}
                      className="text-zinc-400 hover:text-white text-sm"
                    >
                      Open
                    </button>
                  )}
                  {onExpandSubtask && (
                    <button
                      type="button"
                      onClick={() =>
                        expandSubtask({ kind: "existing", task: subtask })
                      }
                      title="Open this subtask to give it subtasks of its own"
                      aria-label="Expand subtask"
                      className="flex-shrink-0 text-zinc-500 transition-colors hover:text-white"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSubtaskToDelete({
                        kind: "existing",
                        id: subtask.id,
                        name: subtask.name,
                      })
                    }
                    title="Delete subtask"
                    className="text-red-300 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            {/* Pending subtasks (add mode) */}
            {!isEditMode &&
              pendingSubtasks.map((sub, index) => (
                <div key={index} className="flex items-center gap-2 mb-2">
                  <Circle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  {editingSubtaskKey === `pending:${index}` ? (
                    <input
                      ref={editingSubtaskInputRef}
                      type="text"
                      value={editingSubtaskValue}
                      onChange={(e) => setEditingSubtaskValue(e.target.value)}
                      onBlur={() => commitPendingSubtaskEdit(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitPendingSubtaskEdit(index);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditingSubtask();
                        }
                      }}
                      className="flex-1 min-w-[100px] bg-zinc-800 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                    />
                  ) : (
                    <span
                      onDoubleClick={() =>
                        startEditingSubtask(`pending:${index}`, sub.name)
                      }
                      title="Double-click to rename"
                      className="flex-1 text-sm text-zinc-300 truncate cursor-text"
                    >
                      {sub.name}
                    </span>
                  )}
                  {sub.timeEstimate && (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {sub.timeEstimate}m
                    </span>
                  )}
                  {sub.dueDate && (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                      <Calendar className="w-3 h-3" />
                      {sub.dueDate}
                    </span>
                  )}
                  {sub.isSupply && (
                    <span
                      className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-emerald-300"
                      title={
                        sub.supplyVendor ? `Vendor: ${sub.supplyVendor}` : "Supply"
                      }
                    >
                      <ShoppingCart className="w-3 h-3" />
                      {sub.supplyQuantity ? `${sub.supplyQuantity}×` : ""}
                      {sub.supplyPrice
                        ? formatCurrency(
                            supplyLineTotal({
                              isSupply: true,
                              supplyQuantity: sub.supplyQuantity ?? null,
                              supplyPrice: sub.supplyPrice ?? null,
                            }) ?? 0,
                          )
                        : "Supply"}
                    </span>
                  )}
                  {onExpandSubtask && onRequestSaveForExpand && (
                    <button
                      type="button"
                      onClick={() => expandSubtask({ kind: "pending", index })}
                      disabled={isExpandingSubtask}
                      title="Open this subtask to give it subtasks of its own (saves this task first)"
                      aria-label="Expand subtask"
                      className="flex-shrink-0 text-zinc-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSubtaskToDelete({
                        kind: "pending",
                        index,
                        name: sub.name,
                      })
                    }
                    title="Delete subtask"
                    className="text-red-300 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            {isAddingSubtask ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newSubtaskName}
                  onChange={(e) => setNewSubtaskName(e.target.value)}
                  onKeyDown={handleNewSubtaskKeyDown}
                  placeholder="Subtask name"
                  className="flex-1 min-w-[140px] bg-zinc-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ring-theme transition-all"
                  autoFocus
                />
                <div className="bg-zinc-800 rounded flex items-center pr-1.5 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                  <Clock className="ml-2 w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  <input
                    type="number"
                    min="0"
                    value={newSubtaskEstimate}
                    onChange={(e) => setNewSubtaskEstimate(e.target.value)}
                    onKeyDown={handleNewSubtaskKeyDown}
                    placeholder="min"
                    className="w-14 bg-transparent text-white pl-2 pr-1 py-1.5 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="bg-zinc-800 rounded flex items-center pr-1.5 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                  <Calendar className="ml-2 w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  <input
                    type="date"
                    value={newSubtaskDueDate}
                    onChange={(e) => setNewSubtaskDueDate(e.target.value)}
                    onKeyDown={handleNewSubtaskKeyDown}
                    className="bg-transparent text-white pl-2 pr-1 py-1.5 text-sm focus:outline-none themed-date-input"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setNewSubtaskIsSupply((v) => !v)}
                  aria-pressed={newSubtaskIsSupply}
                  title={
                    newSubtaskIsSupply
                      ? "This subtask is a supply"
                      : "Mark this subtask as a supply"
                  }
                  className={`rounded px-2 py-1.5 transition-colors ${
                    newSubtaskIsSupply
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isEditMode) {
                      handleAddSubtask();
                    } else {
                      commitPendingSubtask();
                    }
                  }}
                  className="btn-theme-primary text-white rounded px-3 py-1.5 text-sm transition-all"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSubtask(false);
                    setNewSubtaskName("");
                    setNewSubtaskEstimate("");
                    setNewSubtaskDueDate("");
                    clearNewSubtaskSupply();
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
                {/* Supply line-item fields, revealed only once the row is
                    flagged so the common case stays a single compact row. */}
                {newSubtaskIsSupply && (
                  <div className="mt-1 flex w-full flex-wrap items-center gap-2 pl-1">
                    <div className="flex items-center rounded bg-zinc-800 pr-1.5 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                      <span className="pl-2 text-xs text-zinc-500">Qty</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newSubtaskSupplyQuantity}
                        onChange={(e) =>
                          setNewSubtaskSupplyQuantity(e.target.value)
                        }
                        placeholder="1"
                        className="w-16 bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="flex items-center rounded bg-zinc-800 pr-1.5 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
                      <span className="pl-2 text-xs text-zinc-500">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newSubtaskSupplyPrice}
                        onChange={(e) =>
                          setNewSubtaskSupplyPrice(e.target.value)
                        }
                        placeholder="0.00"
                        className="w-20 bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    {(
                      [
                        { key: "make-model" as const, label: "Make/Model" },
                        { key: "type" as const, label: "Type" },
                      ]
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setNewSubtaskSupplyIdentity(option.key)}
                        aria-pressed={newSubtaskSupplyIdentity === option.key}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          newSubtaskSupplyIdentity === option.key
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                    {newSubtaskSupplyIdentity === "make-model" ? (
                      <>
                        <input
                          type="text"
                          value={newSubtaskSupplyMake}
                          onChange={(e) =>
                            setNewSubtaskSupplyMake(e.target.value)
                          }
                          placeholder="Make"
                          className="w-24 rounded bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
                        />
                        <input
                          type="text"
                          value={newSubtaskSupplyModel}
                          onChange={(e) =>
                            setNewSubtaskSupplyModel(e.target.value)
                          }
                          placeholder="Model"
                          className="w-28 rounded bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        value={newSubtaskSupplyType}
                        onChange={(e) =>
                          setNewSubtaskSupplyType(e.target.value)
                        }
                        placeholder="Type"
                        className="w-36 rounded bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
                      />
                    )}
                    <input
                      type="text"
                      value={newSubtaskSupplyVendor}
                      onChange={(e) =>
                        setNewSubtaskSupplyVendor(e.target.value)
                      }
                      placeholder="Vendor or link"
                      className="min-w-[120px] flex-1 rounded bg-zinc-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          </div>
          <div className={tabPanelClass("history")}>
          {/* History */}
          {isEditMode && task && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                data-testid="task-history-toggle"
              >
                {showHistory ? "Hide history" : "Show history"}
              </button>
              {showHistory && (
                <HistoryTimelineScrubber
                  scope={{ entityType: "task", entityId: task.id }}
                  title="Task History"
                  className="mt-2"
                />
              )}
            </div>
          )}

          </div>
          {/* Tab pagination — page through the form before saving. Prev/next
              move between tabs; the save action stays available throughout, so
              a task can be saved from any tab without paging to the end. */}
          <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={() =>
                setActiveTab(visibleTabs[Math.max(0, activeTabIndex - 1)].key)
              }
              disabled={activeTabIndex <= 0}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              {activeTabIndex > 0 ? visibleTabs[activeTabIndex - 1].label : "Back"}
            </button>
            <span className="text-xs tabular-nums text-zinc-500">
              {activeTabIndex + 1} / {visibleTabs.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  visibleTabs[
                    Math.min(visibleTabs.length - 1, activeTabIndex + 1)
                  ].key,
                )
              }
              disabled={activeTabIndex >= visibleTabs.length - 1}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {activeTabIndex < visibleTabs.length - 1
                ? visibleTabs[activeTabIndex + 1].label
                : "Next"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between pt-6 border-t border-zinc-800">
            <div>
              {isEditMode && onDelete && task && (
                <span className="relative group/delete">
                  <button
                    type="button"
                    onClick={() => onDelete(task.id)}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/delete:opacity-100 transition-opacity pointer-events-none z-50">
                    Delete Task
                  </span>
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <span className="relative group/cancel">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/cancel:opacity-100 transition-opacity pointer-events-none z-50">
                  Cancel
                </span>
              </span>
              <span className="relative group/save">
                <button
                  type="submit"
                  className="p-2.5 btn-theme-primary text-white rounded-lg transition-all"
                >
                  <Check className="w-5 h-5" />
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-zinc-900 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/save:opacity-100 transition-opacity pointer-events-none z-50">
                  {isEditMode ? "Save Changes" : "Add Task"}
                </span>
              </span>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={subtaskToDelete !== null}
        onOpenChange={(next) => {
          if (!next) setSubtaskToDelete(null);
        }}
        title="Delete subtask?"
        description={
          subtaskToDelete
            ? `"${subtaskToDelete.name}" will be deleted.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        isLoading={isDeletingSubtask}
        onConfirm={confirmDeleteSubtask}
      />
    </div>
  );
}
