export interface User {
  id: string;
  authId?: string; // Link to auth user
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role?: "team_member" | "admin" | "super_admin" | null;
  todoistId?: string;
  profileColor?: string;
  profileMemoji?: string | null;
  priorityColor?: string; // Custom priority color (default: green)
  animationsEnabled?: boolean;
  dockBadgeEnabled?: boolean;
  emailDeleteUndoSeconds?: number;
  dailyCapacityMinutes?: number;
  createdAt: string;
  updatedAt: string;
  status?: "active" | "pending";
  invitedAt?: string;
  invitedBy?: string;
  inviteToken?: string | null;
  inviteExpiresAt?: string | null;
  // Todoist integration fields
  todoistApiToken?: string;
  todoistUserId?: string;
  todoistSyncEnabled?: boolean;
  todoistAutoSync?: boolean;
  todoistSyncFrequency?: number;
  todoistPremium?: boolean;
  todoistEmail?: string;
  todoistFullName?: string;
  todoistTimezone?: string;
  dateFormat?: string;
}

export interface Organization {
  id: string;
  name: string;
  color: string;
  description?: string;
  archived?: boolean;
  order?: number;
  memberIds?: string[];
  ownerId?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  devnotesMeta?: string;
  color: string;
  organizationId: string;
  /** Parent project id when this is a sub-project; null/undefined at top level. */
  parentId?: string | null;
  ownerId?: string; // User who owns this project
  memberIds?: string[];
  isFavorite: boolean;
  archived?: boolean;
  budget?: number;
  deadline?: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
  todoistId?: string;
  // Additional Todoist fields
  todoistSyncToken?: string;
  todoistParentId?: string;
  todoistChildOrder?: number;
  todoistShared?: boolean;
  todoistViewStyle?: string;
  lastTodoistSync?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  devnotesMeta?: string | null;
  /**
   * "Requires Human in the Loop (HITL) to complete." When true, AI agents /
   * automation must not auto-complete this task — only a human may mark it done.
   */
  requiresHitl?: boolean;
  dueDate?: string;
  dueTime?: string;
  priority: 1 | 2 | 3 | 4;
  reminders: Reminder[];
  deadline?: string;
  files: Attachment[];
  projectId: string;
  assignedTo?: string;
  assignedToName?: string;
  createdBy?: string; // User who created this task
  agentName?: string | null; // AI agent that created this task (via API/agent)
  agentModel?: string | null; // Model that produced it (e.g. "Claude Sonnet 4.5")
  tags: string[];
  tagBadges?: Tag[];
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  todoistId?: string;
  recurringPattern?: string;
  parentId?: string;
  indent?: number;
  dependsOn?: string[]; // Array of task IDs this task depends on
  // Additional Todoist fields
  isRecurring?: boolean;
  todoistSyncToken?: string;
  lastTodoistSync?: string;
  todoistOrder?: number;
  todoistLabels?: string[];
  todoistAssigneeId?: string;
  todoistAssignerId?: string;
  todoistCommentCount?: number;
  todoistUrl?: string;
  sectionId?: string;
  goalId?: string;
  timeEstimate?: number; // Time estimate in minutes
  // Supplies: a task marked as a purchasable line item. Sections subtotal
  // these and the project totals them. See lib/supply.ts for the maths.
  isSupply?: boolean;
  supplyQuantity?: number | null;
  supplyPrice?: number | null;
  supplyVendor?: string | null;
  supplyMake?: string | null;
  supplyModel?: string | null;
  supplyType?: string | null;
  snoozedUntil?: string | null;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
}

export interface RecurringConfig {
  frequency: "daily" | "weekly" | "monthly" | "custom";
  days?: number[]; // 0=Sun..6=Sat (weekly)
  dayOfMonth?: number; // 1-31 (monthly)
  time?: string; // HH:mm
  customPattern?: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  // Additional Todoist fields
  sizeBytes?: number;
  mimeType?: string;
  todoistId?: string;
  storageProvider?: string;
  thumbnailUrl?: string;
}

export interface Reminder {
  id: string;
  type: "preset" | "custom";
  value: string;
  unit?: "minutes" | "hours" | "days" | "weeks" | "months" | "years";
  amount?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  // Additional Todoist fields
  todoistId?: string;
  todoistOrder?: number;
  todoistIsFavorite?: boolean;
}

export interface Section {
  id: string;
  name: string;
  projectId: string;
  parentId?: string; // For nested sections
  goalId?: string; // When this section (task list) is nested inside a goal
  color?: string;
  description?: string;
  icon?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  // Todoist fields
  todoistId?: string;
  todoistOrder?: number;
  todoistCollapsed?: boolean;
}

export interface Goal {
  id: string;
  sectionId?: string;
  parentGoalId?: string; // When this goal is nested inside a parent goal
  projectId: string;
  name: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** Transient UI flag: true while an optimistic goal is being persisted. */
  _saving?: boolean;
}

export interface Comment {
  id: string;
  taskId?: string;
  projectId?: string;
  userId?: string;
  userName?: string;
  content: string;
  todoistId?: string;
  todoistPostedAt?: string;
  todoistAttachment?: any;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSection {
  id: string;
  taskId: string;
  sectionId: string;
  createdAt: string;
}

export interface UserSectionPreference {
  id: string;
  userId: string;
  sectionId: string;
  isCollapsed: boolean;
  updatedAt: string;
}

export interface TimeBlock {
  id: string;
  userId: string;
  organizationId?: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  tasks?: Task[];
  taskIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlockTask {
  id: string;
  timeBlockId: string;
  taskId: string;
  createdAt: string;
}

export interface MailboxMember {
  userId: string;
  role: "viewer" | "triage" | "reply" | "manager";
  name?: string;
  email?: string;
}

export interface Mailbox {
  id: string;
  organizationId?: string | null;
  ownerUserId: string;
  name: string;
  displayName?: string | null;
  emailAddress: string;
  provider: "imap_smtp" | "gmail" | "microsoft";
  loginUsername?: string | null;
  imapHost?: string | null;
  imapPort?: number | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  isShared: boolean;
  autoSyncEnabled: boolean;
  syncFrequencyMinutes: number;
  syncFolder: string;
  quarantineFolder?: string | null;
  summaryProfileId?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  members?: MailboxMember[];
  createdAt: string;
  updatedAt: string;
}

export interface InboxParticipant {
  id: string;
  emailAddress: string;
  displayName?: string | null;
  participantRole: "from" | "to" | "cc" | "bcc" | "reply_to";
  profileId?: string | null;
  contactId?: string | null;
}

export interface ConversationEntry {
  id: string;
  type: "email" | "internal_note";
  direction: "inbound" | "outbound" | "internal";
  authorName?: string | null;
  authorEmail?: string | null;
  subject?: string | null;
  content: string;
  contentHtml?: string | null;
  attachments?: Array<{
    filename?: string | null;
    contentType?: string | null;
    contentDisposition?: "attachment" | "inline" | null;
    cid?: string | null;
    size: number;
    related: boolean;
    attachmentIndex?: number;
    url?: string | null;
  }>;
  createdAt: string;
  participants?: InboxParticipant[];
}

export interface EmailSignature {
  id: string;
  userId: string;
  name: string;
  content: string;
  mailboxScope: "all" | "selected";
  mailboxIds: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailReplyAddress {
  email: string;
  name?: string | null;
}

export interface EmailReplyDraftAttachment extends Attachment {
  inline?: boolean;
  publicUrl?: string | null;
}

export interface EmailReplyDraft {
  id: string;
  threadId: string;
  mailboxId: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  source: "manual" | "ai";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed" | "canceled";
  replyMode: "reply_all" | "internal_note";
  subject: string;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  to: EmailReplyAddress[];
  cc: EmailReplyAddress[];
  attachments: EmailReplyDraftAttachment[];
  scheduledFor?: string | null;
  sentAt?: string | null;
  lastError?: string | null;
  contextSnapshot: Record<string, unknown>;
  aiMetadata: Record<string, unknown>;
  mailboxName?: string | null;
  mailboxEmailAddress?: string | null;
  projectName?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  threadSubject?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailOutboundDraft {
  id: string;
  threadId?: string | null;
  mailboxId: string;
  projectId?: string | null;
  createdByUserId?: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed" | "canceled";
  subject: string;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  to: EmailReplyAddress[];
  cc: EmailReplyAddress[];
  bcc: EmailReplyAddress[];
  attachments: EmailReplyDraftAttachment[];
  scheduledFor?: string | null;
  sentAt?: string | null;
  lastError?: string | null;
  mailboxName?: string | null;
  mailboxEmailAddress?: string | null;
  projectName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxTaskSuggestion {
  name: string;
  description?: string;
  priority?: 1 | 2 | 3 | 4;
  dueDate?: string | null;
}

export interface InboxItem {
  id: string;
  mailboxId: string;
  mailboxName?: string;
  mailboxEmailAddress?: string;
  projectId?: string | null;
  /** Full set of project ids this thread is associated with (multi-project).
   *  Backed by the email_thread_projects join table; the first id is the
   *  primary (mirrors projectId / email_threads.project_id). */
  projectIds?: string[];
  ownerUserId?: string | null;
  summaryProfileId?: string | null;
  status:
    | "active"
    | "quarantine"
    | "needs_project"
    | "archived"
    | "spam"
    | "deleted"
    | "resolved";
  classification:
    | "unknown"
    | "actionable"
    | "newsletter"
    | "spam"
    | "waiting"
    | "reference"
    | "transactional";
  resolutionState: "open" | "taskified" | "resolved";
  actionTitle: string;
  subject: string;
  normalizedSubject?: string | null;
  summaryText?: string | null;
  previewText?: string | null;
  actionConfidence?: number | null;
  actionReason?: string | null;
  latestMessageAt?: string | null;
  latestInboundAt?: string | null;
  latestOutboundAt?: string | null;
  origin?: "inbound" | "outbound" | "mixed";
  isUnread?: boolean;
  /** App-level (not Gmail) star flag, toggled from the inbox. Backed by
   *  email_threads.is_starred. Powers the Starred sidebar view. */
  isStarred?: boolean;
  workDueDate?: string | null;
  // Boomerang: hidden from the inbox until this time passes, or until the
  // linked task is completed.
  boomerangUntil?: string | null;
  boomerangTaskId?: string | null;
  workDueTime?: string | null;
  needsProject: boolean;
  alwaysDelete: boolean;
  derivedTaskCount: number;
  /** Number of email messages in the thread (conversation length). Always >= 1
   *  — a thread has at least its own message, so we never display 0. Derived
   *  from email_messages, not stored on the email_threads row. */
  messageCount: number;
  matchedRuleIds?: string[];
  participants?: InboxParticipant[];
  conversation?: ConversationEntry[];
  taskSuggestions?: InboxTaskSuggestion[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailRuleCondition {
  field:
    | "sender_email"
    | "sender_domain"
    | "subject"
    | "body"
    | "mailbox"
    | "participant";
  operator: "contains" | "equals" | "ends_with" | "starts_with";
  value: string;
}

export interface EmailRuleAction {
  type:
    | "quarantine"
    | "always_delete"
    | "mark_read"
    | "archive"
    | "spam"
    | "never_spam"
    | "assign_mailbox_owner"
    | "require_project"
    | "generate_tasks";
  value?: string | boolean | number | null;
}

export interface EmailRule {
  id: string;
  organizationId?: string | null;
  mailboxId?: string | null;
  userId?: string | null;
  name: string;
  description?: string | null;
  source: "user" | "system" | "ai_training";
  isActive: boolean;
  priority: number;
  matchMode: "all" | "any";
  conditions: EmailRuleCondition[];
  actions: EmailRuleAction[];
  stopProcessing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSpamExceptionResult {
  threadId: string;
  rule: EmailRule;
  rationale: string;
}

export interface SummaryProfile {
  id: string;
  organizationId?: string | null;
  mailboxId?: string | null;
  userId?: string | null;
  name: string;
  summaryStyle: string;
  instructionText: string;
  settings: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleStats {
  active: number;
  quarantine: number;
  alwaysDelete: number;
}

export type WorkItem =
  | (Task & { kind?: "task" })
  | (InboxItem & { kind: "inbox" });

// An itemized supply already on hand, scoped to a project and optionally a
// section (task list) or task. Never completed — distinct from is_supply tasks.
export interface OnHandSupply {
  id: string;
  projectId: string;
  sectionId: string | null;
  taskId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  users: User[];
  organizations: Organization[];
  projects: Project[];
  tasks: Task[];
  mailboxes: Mailbox[];
  inboxItems: InboxItem[];
  emailRules: EmailRule[];
  summaryProfiles: SummaryProfile[];
  ruleStats: RuleStats;
  quarantineCount: number;
  sentCount?: number;
  tags: Tag[];
  sections: Section[];
  goals?: Goal[];
  taskSections: TaskSection[];
  userSectionPreferences: UserSectionPreference[];
  timeBlocks: TimeBlock[];
  timeBlockTasks: TimeBlockTask[];
  settings: {
    showCompletedTasks: boolean;
  };
}
