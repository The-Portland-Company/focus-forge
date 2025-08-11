import { Database, Task, Project, Organization, Tag, User } from './types'

/**
 * Database Adapter Interface
 * Provides abstraction layer for different database implementations
 * Allows switching between file-based and cloud-based storage
 */
export interface DatabaseAdapter {
  // Core database operations
  getDatabase(): Promise<Database>
  updateDatabase(data: Database): Promise<void>
  
  // Task operations
  getTasks(): Promise<Task[]>
  getTask(id: string): Promise<Task | undefined>
  createTask(task: Task): Promise<Task>
  updateTask(id: string, updates: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>
  batchUpdateTasks(updates: { id: string; changes: Partial<Task> }[]): Promise<void>
  
  // Project operations
  getProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | undefined>
  createProject(project: Project): Promise<Project>
  updateProject(id: string, updates: Partial<Project>): Promise<Project>
  deleteProject(id: string): Promise<void>
  reorderProjects(organizationId: string, projectIds: string[]): Promise<void>
  
  // Organization operations
  getOrganizations(): Promise<Organization[]>
  getOrganization(id: string): Promise<Organization | undefined>
  createOrganization(organization: Organization): Promise<Organization>
  updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization>
  deleteOrganization(id: string): Promise<void>
  reorderOrganizations(organizationIds: string[]): Promise<void>
  
  // Tag operations
  getTags(): Promise<Tag[]>
  getTag(id: string): Promise<Tag | undefined>
  createTag(tag: Tag): Promise<Tag>
  updateTag(id: string, updates: Partial<Tag>): Promise<Tag>
  deleteTag(id: string): Promise<void>
  
  // User operations
  getUsers(): Promise<User[]>
  getUser(id: string): Promise<User | undefined>
  getCurrentUser(): Promise<User | undefined>
  updateUser(id: string, updates: Partial<User>): Promise<User>
  
  // Settings operations
  getSettings(): Promise<Database['settings']>
  updateSettings(settings: Partial<Database['settings']>): Promise<void>
  
  // Utility operations
  initialize?(): Promise<void>
  close?(): Promise<void>
  backup?(): Promise<void>
  restore?(backup: Database): Promise<void>
}

/**
 * Factory function to create appropriate database adapter
 * based on environment configuration
 */
export async function createDatabaseAdapter(): Promise<DatabaseAdapter> {
  const useSupabase = process.env.USE_SUPABASE === 'true'
  
  if (useSupabase) {
    const { SupabaseAdapter } = await import('./adapters/supabase-adapter')
    return new SupabaseAdapter()
  } else {
    const { FileAdapter } = await import('./adapters/file-adapter')
    return new FileAdapter()
  }
}

// Singleton instance
let adapterInstance: DatabaseAdapter | null = null

/**
 * Get singleton database adapter instance
 */
export async function getDatabaseAdapter(): Promise<DatabaseAdapter> {
  if (!adapterInstance) {
    adapterInstance = await createDatabaseAdapter()
    if (adapterInstance.initialize) {
      await adapterInstance.initialize()
    }
  }
  return adapterInstance
}

/**
 * Reset adapter instance (useful for testing)
 */
export function resetDatabaseAdapter(): void {
  if (adapterInstance && adapterInstance.close) {
    adapterInstance.close()
  }
  adapterInstance = null
}