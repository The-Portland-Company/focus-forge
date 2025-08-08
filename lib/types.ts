export interface User {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  todoistId?: string
  profileColor?: string
  animationsEnabled?: boolean
  createdAt: string
  updatedAt: string
  status?: 'active' | 'pending'
  invitedAt?: string
  invitedBy?: string
}

export interface Organization {
  id: string
  name: string
  color: string
  description?: string
  archived?: boolean
  order?: number
  memberIds?: string[]
}

export interface Project {
  id: string
  name: string
  description?: string
  color: string
  organizationId: string
  isFavorite: boolean
  archived?: boolean
  budget?: number
  deadline?: string
  order?: number
  createdAt: string
  updatedAt: string
  todoistId?: string
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
}

export interface Attachment {
  id: string
  name: string
  url: string
  type: string
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
}

export interface Database {
  users: User[]
  organizations: Organization[]
  projects: Project[]
  tasks: Task[]
  tags: Tag[]
  settings: {
    showCompletedTasks: boolean
  }
}