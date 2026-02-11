export interface User {
  id: string
  authId?: string // Link to auth user
  firstName: string
  lastName: string
  name: string
  email: string
  todoistId?: string
  profileColor?: string
  profileMemoji?: string | null
  priorityColor?: string // Custom priority color (default: green)
  animationsEnabled?: boolean
  createdAt: string
  updatedAt: string
  status?: 'active' | 'pending'
  invitedAt?: string
  invitedBy?: string
  // Todoist integration fields
  todoistApiToken?: string
  todoistUserId?: string
  todoistSyncEnabled?: boolean
  todoistAutoSync?: boolean
  todoistSyncFrequency?: number
  todoistPremium?: boolean
  todoistEmail?: string
  todoistFullName?: string
  todoistTimezone?: string
}

export interface Organization {
  id: string
  name: string
  color: string
  description?: string
  archived?: boolean
  order?: number
  memberIds?: string[]
  ownerId?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  color: string
  organizationId: string
  ownerId?: string // User who owns this project
  isFavorite: boolean
  archived?: boolean
  budget?: number
  deadline?: string
  order?: number
  createdAt: string
  updatedAt: string
  todoistId?: string
  // Additional Todoist fields
  todoistSyncToken?: string
  todoistParentId?: string
  todoistChildOrder?: number
  todoistShared?: boolean
  todoistViewStyle?: string
  lastTodoistSync?: string
}

export interface Task {
  id: string
  name: string
  description?: string
  dueDate?: string
  dueTime?: string
  priority: 1 | 2 | 3 | 4
  reminders: Reminder[]
  deadline?: string
  files: Attachment[]
  projectId: string
  assignedTo?: string
  assignedToName?: string
  createdBy?: string // User who created this task
  tags: string[]
  completed: boolean
  completedAt?: string
  createdAt: string
  updatedAt: string
  todoistId?: string
  recurringPattern?: string
  parentId?: string
  indent?: number
  dependsOn?: string[] // Array of task IDs this task depends on
  // Additional Todoist fields
  isRecurring?: boolean
  todoistSyncToken?: string
  lastTodoistSync?: string
  todoistOrder?: number
  todoistLabels?: string[]
  todoistAssigneeId?: string
  todoistAssignerId?: string
  todoistCommentCount?: number
  todoistUrl?: string
  sectionId?: string
}

export interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
  days?: number[]       // 0=Sun..6=Sat (weekly)
  dayOfMonth?: number   // 1-31 (monthly)
  time?: string         // HH:mm
  customPattern?: string
}

export interface Attachment {
  id: string
  name: string
  url: string
  type: string
  // Additional Todoist fields
  sizeBytes?: number
  mimeType?: string
  todoistId?: string
  storageProvider?: string
  thumbnailUrl?: string
}

export interface Reminder {
  id: string
  type: 'preset' | 'custom'
  value: string
  unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
  amount?: number
}

export interface Tag {
  id: string
  name: string
  color: string
  // Additional Todoist fields
  todoistId?: string
  todoistOrder?: number
  todoistIsFavorite?: boolean
}

export interface Section {
  id: string
  name: string
  projectId: string
  parentId?: string // For nested sections
  color?: string
  description?: string
  icon?: string
  order: number
  createdAt: string
  updatedAt: string
  // Todoist fields
  todoistId?: string
  todoistOrder?: number
  todoistCollapsed?: boolean
}

export interface Comment {
  id: string
  taskId?: string
  projectId?: string
  userId?: string
  userName?: string
  content: string
  todoistId?: string
  todoistPostedAt?: string
  todoistAttachment?: any
  isDeleted?: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskSection {
  id: string
  taskId: string
  sectionId: string
  createdAt: string
}

export interface UserSectionPreference {
  id: string
  userId: string
  sectionId: string
  isCollapsed: boolean
  updatedAt: string
}

export interface TimeBlock {
  id: string
  userId: string
  organizationId?: string
  startTime: string
  endTime: string
  title: string
  description?: string
  tasks?: Task[]
  taskIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface TimeBlockTask {
  id: string
  timeBlockId: string
  taskId: string
  createdAt: string
}

export interface Database {
  users: User[]
  organizations: Organization[]
  projects: Project[]
  tasks: Task[]
  tags: Tag[]
  sections: Section[]
  taskSections: TaskSection[]
  userSectionPreferences: UserSectionPreference[]
  timeBlocks: TimeBlock[]
  timeBlockTasks: TimeBlockTask[]
  settings: {
    showCompletedTasks: boolean
  }
}
