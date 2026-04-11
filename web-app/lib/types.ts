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
  ownerId?: string; // User who owns this project
  memberIds?: string[];
  isFavorite: boolean;
  archived?: boolean;
  budget?: number;
  deadline?: string;
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
  tags: string[];
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
  timeEstimate?: number; // Time estimate in minutes
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
    | "reference";
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
  isUnread?: boolean;
  workDueDate?: string | null;
  workDueTime?: string | null;
  needsProject: boolean;
  alwaysDelete: boolean;
  derivedTaskCount: number;
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
  tags: Tag[];
  sections: Section[];
  taskSections: TaskSection[];
  userSectionPreferences: UserSectionPreference[];
  timeBlocks: TimeBlock[];
  timeBlockTasks: TimeBlockTask[];
  settings: {
    showCompletedTasks: boolean;
  };
}
