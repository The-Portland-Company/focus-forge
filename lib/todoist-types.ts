// Todoist Integration Types

export interface TodoistSyncState {
  id: string
  userId: string
  syncToken?: string
  lastSyncAt?: string
  nextSyncAt?: string
  syncStatus: 'idle' | 'syncing' | 'completed' | 'failed'
  errorMessage?: string
  errorCount: number
  consecutiveFailures: number
  createdAt: string
  updatedAt: string
}

export interface TodoistSyncHistory {
  id: string
  userId: string
  syncType: 'full' | 'incremental' | 'manual'
  syncDirection: 'pull' | 'push' | 'bidirectional'
  itemsCreated: number
  itemsUpdated: number
  itemsDeleted: number
  projectsCreated: number
  projectsUpdated: number
  projectsDeleted: number
  tagsSynced: number
  conflictsResolved: number
  startedAt: string
  completedAt?: string
  durationMs?: number
  errorDetails?: any
  syncTokenBefore?: string
  syncTokenAfter?: string
  createdAt: string
}

export interface TodoistComment {
  id: string
  taskId?: string
  projectId?: string
  userId?: string
  content: string
  todoistId?: string
  todoistPostedAt?: string
  todoistAttachment?: any
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface TodoistSyncConflict {
  id: string
  userId: string
  resourceType: 'task' | 'project' | 'tag' | 'comment'
  resourceId?: string
  todoistId?: string
  localData: any
  todoistData: any
  localUpdatedAt: string
  todoistUpdatedAt: string
  resolutionStrategy?: 'local_wins' | 'todoist_wins' | 'manual' | 'merged'
  resolutionData?: any
  resolvedAt?: string
  resolvedBy?: string
  createdAt: string
}

export interface TodoistImportBackup {
  id: string
  userId: string
  backupType: 'pre_import' | 'pre_disconnect' | 'manual'
  data: any
  itemCount?: number
  projectCount?: number
  tagCount?: number
  createdAt: string
}

export interface TodoistFilter {
  id: string
  userId: string
  name: string
  query: string
  color?: string
  todoistId?: string
  todoistOrder?: number
  isDeleted: boolean
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export interface TodoistSection {
  id: string
  projectId: string
  name: string
  todoistId?: string
  todoistOrder?: number
  todoistCollapsed: boolean
  isDeleted: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// Extended types for existing entities with Todoist fields
export interface TodoistTask {
  todoistId?: string
  todoistSyncToken?: string
  isRecurring: boolean
  lastTodoistSync?: string
  todoistOrder?: number
  todoistChildOrder?: number
  todoistCollapsed: boolean
  todoistLabels?: string[]
  todoistAssigneeId?: string
  todoistAssignerId?: string
  todoistCommentCount: number
  todoistUrl?: string
  todoistDurationAmount?: number
  todoistDurationUnit?: string
  sectionId?: string
}

export interface TodoistProject {
  todoistId?: string
  todoistSyncToken?: string
  todoistParentId?: string
  todoistChildOrder?: number
  todoistCollapsed: boolean
  todoistShared: boolean
  todoistIsDeleted: boolean
  todoistIsArchived: boolean
  todoistIsFavorite: boolean
  todoistSyncId?: string
  todoistViewStyle: string
  lastTodoistSync?: string
}

export interface TodoistProfile {
  todoistApiToken?: string
  todoistUserId?: string
  todoistSyncEnabled: boolean
  todoistAutoSync: boolean
  todoistSyncFrequency: number
  todoistPremium: boolean
  todoistEmail?: string
  todoistFullName?: string
  todoistTimezone?: string
  todoistStartPage?: string
  todoistStartDay?: number
  todoistKarma?: number
  todoistKarmaTrend?: string
}

export interface TodoistTag {
  todoistId?: string
  todoistOrder?: number
  todoistIsDeleted: boolean
  todoistIsFavorite: boolean
}

export interface TodoistAttachment {
  sizeBytes?: number
  mimeType?: string
  todoistId?: string
  todoistUploadState?: string
  storageProvider: string
  thumbnailUrl?: string
  updatedAt: string
}

// API Response Types from Todoist
export interface TodoistApiTask {
  id: string
  project_id: string
  section_id?: string
  content: string
  description: string
  is_completed: boolean
  labels: string[]
  parent_id?: string
  order: number
  priority: number
  due?: {
    date: string
    string: string
    lang: string
    is_recurring: boolean
    datetime?: string
    timezone?: string
  }
  url: string
  comment_count: number
  created_at: string
  creator_id: string
  assignee_id?: string
  assigner_id?: string
  duration?: {
    amount: number
    unit: string
  }
}

export interface TodoistApiProject {
  id: string
  name: string
  color: string
  parent_id?: string
  order: number
  comment_count: number
  is_shared: boolean
  is_favorite: boolean
  is_inbox_project: boolean
  is_team_inbox: boolean
  url: string
  view_style: string
}

export interface TodoistApiLabel {
  id: string
  name: string
  color: string
  order: number
  is_favorite: boolean
}

export interface TodoistApiComment {
  id: string
  task_id?: string
  project_id?: string
  posted_at: string
  content: string
  attachment?: {
    file_name: string
    file_type: string
    file_url: string
    resource_type: string
  }
}

export interface TodoistApiSection {
  id: string
  project_id: string
  order: number
  name: string
}

export interface TodoistApiFilter {
  id: string
  name: string
  query: string
  color: string
  order: number
  is_favorite: boolean
}

// Sync API Response
export interface TodoistSyncResponse {
  sync_token: string
  full_sync: boolean
  temp_id_mapping?: Record<string, string>
  projects?: TodoistApiProject[]
  items?: TodoistApiTask[]
  labels?: TodoistApiLabel[]
  sections?: TodoistApiSection[]
  filters?: TodoistApiFilter[]
  notes?: TodoistApiComment[]
  project_notes?: TodoistApiComment[]
  user?: {
    id: string
    email: string
    full_name: string
    inbox_project_id: string
    timezone: string
    start_page: string
    start_day: number
    karma: number
    karma_trend: string
    is_premium: boolean
  }
}

// Command types for Todoist Sync API
export interface TodoistCommand {
  type: string
  uuid: string
  temp_id?: string
  args: Record<string, any>
}

export interface TodoistSyncRequest {
  sync_token: string
  resource_types?: string[]
  commands?: TodoistCommand[]
}