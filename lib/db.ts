import { Database, Task, Project, Organization } from './types'
import { getDatabaseAdapter } from './db/factory'

// Legacy functions that delegate to the adapter
export async function getDatabase(): Promise<Database> {
  const adapter = getDatabaseAdapter()
  if (adapter.getDatabase) {
    return adapter.getDatabase()
  }
  throw new Error('getDatabase not supported by current adapter')
}

export async function saveDatabase(database: Database): Promise<void> {
  const adapter = getDatabaseAdapter()
  return adapter.updateDatabase(database)
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
  const adapter = getDatabaseAdapter()
  const fullTask: Task = {
    ...task,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  return adapter.createTask(fullTask)
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const adapter = getDatabaseAdapter()
  return adapter.updateTask(id, updates)
}

export async function deleteTask(id: string): Promise<boolean> {
  const adapter = getDatabaseAdapter()
  await adapter.deleteTask(id)
  return true
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const adapter = getDatabaseAdapter()
  return adapter.updateProject(id, updates)
}

export async function deleteProject(id: string): Promise<boolean> {
  const adapter = getDatabaseAdapter()
  await adapter.deleteProject(id)
  return true
}

export async function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  const adapter = getDatabaseAdapter()
  const fullProject: Project = {
    ...project,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  return adapter.createProject(fullProject)
}

export async function createOrganization(organization: Omit<Organization, 'id'>): Promise<Organization> {
  const adapter = getDatabaseAdapter()
  const fullOrganization: Organization = {
    ...organization,
    id: Math.random().toString(36).substr(2, 9)
  }
  return adapter.createOrganization(fullOrganization)
}

export async function updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization | null> {
  const adapter = getDatabaseAdapter()
  return adapter.updateOrganization(id, updates)
}

export async function reorderProjects(organizationId: string, projectIds: string[]): Promise<void> {
  const adapter = getDatabaseAdapter()
  // Update each project's order
  const updateItems = projectIds.map((id, index) => ({
    id,
    updates: { order: index }
  }))
  
  for (const { id, updates } of updateItems) {
    await adapter.updateProject(id, updates)
  }
}

export async function reorderOrganizations(organizationIds: string[]): Promise<void> {
  const adapter = getDatabaseAdapter()
  // Update each organization's order
  const updateItems = organizationIds.map((id, index) => ({
    id,
    updates: { order: index }
  }))
  
  for (const { id, updates } of updateItems) {
    await adapter.updateOrganization(id, updates)
  }
}

export async function deleteOrganization(id: string): Promise<boolean> {
  const adapter = getDatabaseAdapter()
  await adapter.deleteOrganization(id)
  return true
}

export async function updateUser(id: string, updates: any): Promise<any> {
  const adapter = getDatabaseAdapter()
  return adapter.updateUser(id, updates)
}