export interface Database {
  users: any[]
  organizations: any[]
  projects: any[]
  tasks: any[]
  tags: any[]
  sections: any[]
  taskSections: any[]
  userSectionPreferences: any[]
  settings: {
    showCompletedTasks: boolean
  }
}

export interface DatabaseAdapter {
  // Full database operations (only for file adapter)
  getDatabase?(): Promise<Database>
  saveDatabase?(database: Database): Promise<void>

  // Organizations
  getOrganizations(userId?: string): Promise<any[]>
  getOrganization(id: string): Promise<any>
  createOrganization(org: any): Promise<any>
  updateOrganization(id: string, updates: any): Promise<any>
  deleteOrganization(id: string): Promise<void>

  // Projects
  getProjects(organizationId?: string): Promise<any[]>
  getProject(id: string): Promise<any>
  createProject(project: any): Promise<any>
  updateProject(id: string, updates: any): Promise<any>
  deleteProject(id: string): Promise<void>

  // Tasks
  getTasks(projectId?: string): Promise<any[]>
  getTask(id: string): Promise<any>
  createTask(task: any): Promise<any>
  updateTask(id: string, updates: any): Promise<any>
  deleteTask(id: string): Promise<void>

  // Tags
  getTags(): Promise<any[]>
  createTag(tag: any): Promise<any>

  // Users
  getUser(id: string): Promise<any>
  updateUser(id: string, updates: any): Promise<any>

  // Batch operations
  batchUpdateTasks(updates: { id: string; updates: any }[]): Promise<any[]>
}