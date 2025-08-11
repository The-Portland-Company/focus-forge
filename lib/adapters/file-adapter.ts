import { DatabaseAdapter } from '../db-adapter'
import { Database, Task, Project, Organization, Tag, User } from '../types'
import fs from 'fs/promises'
import path from 'path'

/**
 * File-based database adapter
 * Implements the existing file-based storage logic
 * This maintains backward compatibility with the current system
 */
export class FileAdapter implements DatabaseAdapter {
  private dbPath: string

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'database.json')
  }

  async initialize(): Promise<void> {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath)
    try {
      await fs.access(dataDir)
    } catch {
      await fs.mkdir(dataDir, { recursive: true })
    }

    // Ensure database file exists
    try {
      await fs.access(this.dbPath)
    } catch {
      // Create initial database structure
      const initialDb: Database = {
        users: [],
        organizations: [],
        projects: [],
        tasks: [],
        tags: [],
        sections: [],
        taskSections: [],
        userSectionPreferences: [],
        settings: {
          showCompletedTasks: true
        }
      }
      await this.updateDatabase(initialDb)
    }
  }

  async getDatabase(): Promise<Database> {
    try {
      const data = await fs.readFile(this.dbPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Error reading database:', error)
      throw error
    }
  }

  async updateDatabase(data: Database): Promise<void> {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Error saving database:', error)
      throw error
    }
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    const db = await this.getDatabase()
    return db.tasks
  }

  async getTask(id: string): Promise<Task | undefined> {
    const db = await this.getDatabase()
    return db.tasks.find(t => t.id === id)
  }

  async createTask(task: Task): Promise<Task> {
    const db = await this.getDatabase()
    db.tasks.push(task)
    await this.updateDatabase(db)
    return task
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const db = await this.getDatabase()
    const taskIndex = db.tasks.findIndex(t => t.id === id)
    if (taskIndex === -1) {
      throw new Error(`Task with id ${id} not found`)
    }
    
    db.tasks[taskIndex] = {
      ...db.tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.updateDatabase(db)
    return db.tasks[taskIndex]
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.getDatabase()
    const initialLength = db.tasks.length
    db.tasks = db.tasks.filter(t => t.id !== id)
    
    // Also delete subtasks
    const subtaskIds = db.tasks.filter(t => t.parentId === id).map(t => t.id)
    for (const subtaskId of subtaskIds) {
      await this.deleteTask(subtaskId)
    }
    
    if (db.tasks.length < initialLength) {
      await this.updateDatabase(db)
    } else {
      throw new Error(`Task with id ${id} not found`)
    }
  }

  async batchUpdateTasks(updates: { id: string; changes: Partial<Task> }[]): Promise<void> {
    const db = await this.getDatabase()
    
    for (const { id, changes } of updates) {
      const taskIndex = db.tasks.findIndex(t => t.id === id)
      if (taskIndex !== -1) {
        db.tasks[taskIndex] = {
          ...db.tasks[taskIndex],
          ...changes,
          updatedAt: new Date().toISOString()
        }
      }
    }
    
    await this.updateDatabase(db)
  }

  // Project operations
  async getProjects(): Promise<Project[]> {
    const db = await this.getDatabase()
    return db.projects
  }

  async getProject(id: string): Promise<Project | undefined> {
    const db = await this.getDatabase()
    return db.projects.find(p => p.id === id)
  }

  async createProject(project: Project): Promise<Project> {
    const db = await this.getDatabase()
    db.projects.push(project)
    await this.updateDatabase(db)
    return project
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const db = await this.getDatabase()
    const projectIndex = db.projects.findIndex(p => p.id === id)
    if (projectIndex === -1) {
      throw new Error(`Project with id ${id} not found`)
    }
    
    db.projects[projectIndex] = {
      ...db.projects[projectIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.updateDatabase(db)
    return db.projects[projectIndex]
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.getDatabase()
    const initialLength = db.projects.length
    db.projects = db.projects.filter(p => p.id !== id)
    
    // Also delete all tasks in this project
    db.tasks = db.tasks.filter(t => t.projectId !== id)
    
    if (db.projects.length < initialLength) {
      await this.updateDatabase(db)
    } else {
      throw new Error(`Project with id ${id} not found`)
    }
  }

  async reorderProjects(organizationId: string, projectIds: string[]): Promise<void> {
    const db = await this.getDatabase()
    
    // Update the order of each project
    projectIds.forEach((projectId, index) => {
      const projectIndex = db.projects.findIndex(p => p.id === projectId)
      if (projectIndex !== -1) {
        db.projects[projectIndex].order = index
      }
    })
    
    await this.updateDatabase(db)
  }

  // Organization operations
  async getOrganizations(): Promise<Organization[]> {
    const db = await this.getDatabase()
    return db.organizations
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const db = await this.getDatabase()
    return db.organizations.find(o => o.id === id)
  }

  async createOrganization(organization: Organization): Promise<Organization> {
    const db = await this.getDatabase()
    db.organizations.push(organization)
    await this.updateDatabase(db)
    return organization
  }

  async updateOrganization(id: string, updates: Partial<Organization>): Promise<Organization> {
    const db = await this.getDatabase()
    const orgIndex = db.organizations.findIndex(o => o.id === id)
    if (orgIndex === -1) {
      throw new Error(`Organization with id ${id} not found`)
    }
    
    db.organizations[orgIndex] = {
      ...db.organizations[orgIndex],
      ...updates
    }
    await this.updateDatabase(db)
    return db.organizations[orgIndex]
  }

  async deleteOrganization(id: string): Promise<void> {
    const db = await this.getDatabase()
    const initialLength = db.organizations.length
    db.organizations = db.organizations.filter(o => o.id !== id)
    
    // Also delete all projects in this organization
    const projectsToDelete = db.projects.filter(p => p.organizationId === id).map(p => p.id)
    db.projects = db.projects.filter(p => p.organizationId !== id)
    
    // Also delete all tasks in projects that belonged to this organization
    db.tasks = db.tasks.filter(t => !projectsToDelete.includes(t.projectId))
    
    if (db.organizations.length < initialLength) {
      await this.updateDatabase(db)
    } else {
      throw new Error(`Organization with id ${id} not found`)
    }
  }

  async reorderOrganizations(organizationIds: string[]): Promise<void> {
    const db = await this.getDatabase()
    
    // Update the order of each organization
    organizationIds.forEach((orgId, index) => {
      const orgIndex = db.organizations.findIndex(o => o.id === orgId)
      if (orgIndex !== -1) {
        db.organizations[orgIndex].order = index
      }
    })
    
    await this.updateDatabase(db)
  }

  // Tag operations
  async getTags(): Promise<Tag[]> {
    const db = await this.getDatabase()
    return db.tags
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const db = await this.getDatabase()
    return db.tags.find(t => t.id === id)
  }

  async createTag(tag: Tag): Promise<Tag> {
    const db = await this.getDatabase()
    db.tags.push(tag)
    await this.updateDatabase(db)
    return tag
  }

  async updateTag(id: string, updates: Partial<Tag>): Promise<Tag> {
    const db = await this.getDatabase()
    const tagIndex = db.tags.findIndex(t => t.id === id)
    if (tagIndex === -1) {
      throw new Error(`Tag with id ${id} not found`)
    }
    
    db.tags[tagIndex] = {
      ...db.tags[tagIndex],
      ...updates
    }
    await this.updateDatabase(db)
    return db.tags[tagIndex]
  }

  async deleteTag(id: string): Promise<void> {
    const db = await this.getDatabase()
    const initialLength = db.tags.length
    db.tags = db.tags.filter(t => t.id !== id)
    
    // Remove tag from all tasks
    db.tasks = db.tasks.map(task => ({
      ...task,
      tags: task.tags.filter(tagId => tagId !== id)
    }))
    
    if (db.tags.length < initialLength) {
      await this.updateDatabase(db)
    } else {
      throw new Error(`Tag with id ${id} not found`)
    }
  }

  // User operations
  async getUsers(): Promise<User[]> {
    const db = await this.getDatabase()
    return db.users
  }

  async getUser(id: string): Promise<User | undefined> {
    const db = await this.getDatabase()
    return db.users.find(u => u.id === id)
  }

  async getCurrentUser(): Promise<User | undefined> {
    const db = await this.getDatabase()
    return db.users[0] // Default to first user as per existing logic
  }

  // Settings operations
  async getSettings(): Promise<Database['settings']> {
    const db = await this.getDatabase()
    return db.settings
  }

  async updateSettings(settings: Partial<Database['settings']>): Promise<void> {
    const db = await this.getDatabase()
    db.settings = {
      ...db.settings,
      ...settings
    }
    await this.updateDatabase(db)
  }

  // Utility operations
  async backup(): Promise<void> {
    const db = await this.getDatabase()
    const backupPath = this.dbPath.replace('.json', `-backup-${Date.now()}.json`)
    await fs.writeFile(backupPath, JSON.stringify(db, null, 2))
  }

  async restore(backup: Database): Promise<void> {
    await this.updateDatabase(backup)
  }
}