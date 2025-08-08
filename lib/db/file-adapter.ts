import { Database, DatabaseAdapter } from './types'
import fs from 'fs/promises'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'database.json')

export class FileAdapter implements DatabaseAdapter {
  async getDatabase(): Promise<Database> {
    try {
      const data = await fs.readFile(DB_PATH, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Error reading database:', error)
      throw error
    }
  }

  async saveDatabase(database: Database): Promise<void> {
    try {
      await fs.writeFile(DB_PATH, JSON.stringify(database, null, 2))
    } catch (error) {
      console.error('Error saving database:', error)
      throw error
    }
  }

  // Organizations
  async getOrganizations() {
    const db = await this.getDatabase()
    return db.organizations.sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  async getOrganization(id: string) {
    const db = await this.getDatabase()
    return db.organizations.find(o => o.id === id) || null
  }

  async createOrganization(organization: any) {
    const db = await this.getDatabase()
    
    const maxOrder = Math.max(0, ...db.organizations.map(o => o.order || 0))
    
    const newOrganization = {
      ...organization,
      id: `org-${Date.now()}`,
      order: maxOrder + 1
    }
    
    db.organizations.push(newOrganization)
    await this.saveDatabase(db)
    return newOrganization
  }

  async updateOrganization(id: string, updates: any) {
    const db = await this.getDatabase()
    const orgIndex = db.organizations.findIndex(o => o.id === id)
    if (orgIndex === -1) return null
    
    db.organizations[orgIndex] = {
      ...db.organizations[orgIndex],
      ...updates
    }
    await this.saveDatabase(db)
    return db.organizations[orgIndex]
  }

  async deleteOrganization(id: string) {
    const db = await this.getDatabase()
    const initialLength = db.organizations.length
    db.organizations = db.organizations.filter(o => o.id !== id)
    
    // Also delete all projects in this organization
    const projectsToDelete = db.projects.filter(p => p.organizationId === id).map(p => p.id)
    db.projects = db.projects.filter(p => p.organizationId !== id)
    
    // Also delete all tasks in projects that belonged to this organization
    db.tasks = db.tasks.filter(t => !projectsToDelete.includes(t.projectId))
    
    if (db.organizations.length < initialLength) {
      await this.saveDatabase(db)
    }
  }

  // Projects
  async getProjects(organizationId?: string) {
    const db = await this.getDatabase()
    let projects = db.projects
    
    if (organizationId) {
      projects = projects.filter(p => p.organizationId === organizationId)
    }
    
    return projects.sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  async getProject(id: string) {
    const db = await this.getDatabase()
    return db.projects.find(p => p.id === id) || null
  }

  async createProject(project: any) {
    const db = await this.getDatabase()
    
    const orgProjects = db.projects.filter(p => p.organizationId === project.organizationId)
    const maxOrder = Math.max(0, ...orgProjects.map(p => p.order || 0))
    
    const newProject = {
      ...project,
      id: `project-${Date.now()}`,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    db.projects.push(newProject)
    await this.saveDatabase(db)
    return newProject
  }

  async updateProject(id: string, updates: any) {
    const db = await this.getDatabase()
    const projectIndex = db.projects.findIndex(p => p.id === id)
    if (projectIndex === -1) return null
    
    db.projects[projectIndex] = {
      ...db.projects[projectIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.saveDatabase(db)
    return db.projects[projectIndex]
  }

  async deleteProject(id: string) {
    const db = await this.getDatabase()
    const initialLength = db.projects.length
    db.projects = db.projects.filter(p => p.id !== id)
    
    // Also delete all tasks in this project
    db.tasks = db.tasks.filter(t => t.projectId !== id)
    
    if (db.projects.length < initialLength) {
      await this.saveDatabase(db)
    }
  }

  // Tasks
  async getTasks(projectId?: string) {
    const db = await this.getDatabase()
    let tasks = db.tasks
    
    if (projectId) {
      tasks = tasks.filter(t => t.projectId === projectId)
    }
    
    return tasks.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }

  async getTask(id: string) {
    const db = await this.getDatabase()
    return db.tasks.find(t => t.id === id) || null
  }

  async createTask(task: any) {
    const db = await this.getDatabase()
    const newTask = {
      ...task,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: task.files || []
    }
    db.tasks.push(newTask)
    await this.saveDatabase(db)
    return newTask
  }

  async updateTask(id: string, updates: any) {
    const db = await this.getDatabase()
    const taskIndex = db.tasks.findIndex(t => t.id === id)
    if (taskIndex === -1) return null
    
    // Update the main task
    db.tasks[taskIndex] = {
      ...db.tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    // If we're completing a parent task, also complete all subtasks
    if (updates.completed === true && !db.tasks[taskIndex].parentId) {
      const subtasks = db.tasks.filter(t => t.parentId === id)
      const now = new Date().toISOString()
      
      subtasks.forEach(subtask => {
        const subtaskIndex = db.tasks.findIndex(t => t.id === subtask.id)
        if (subtaskIndex !== -1 && !db.tasks[subtaskIndex].completed) {
          db.tasks[subtaskIndex] = {
            ...db.tasks[subtaskIndex],
            completed: true,
            completedAt: now,
            updatedAt: now
          }
        }
      })
    }
    
    await this.saveDatabase(db)
    return db.tasks[taskIndex]
  }

  async deleteTask(id: string) {
    const db = await this.getDatabase()
    const initialLength = db.tasks.length
    db.tasks = db.tasks.filter(t => t.id !== id)
    
    if (db.tasks.length < initialLength) {
      await this.saveDatabase(db)
    }
  }

  // Tags
  async getTags() {
    const db = await this.getDatabase()
    return db.tags.sort((a, b) => a.name.localeCompare(b.name))
  }

  async createTag(tag: any) {
    const db = await this.getDatabase()
    const newTag = {
      ...tag,
      id: `tag-${Date.now()}`
    }
    db.tags.push(newTag)
    await this.saveDatabase(db)
    return newTag
  }

  // Users
  async getUser(id: string) {
    const db = await this.getDatabase()
    return db.users.find(u => u.id === id) || null
  }

  async updateUser(id: string, updates: any) {
    const db = await this.getDatabase()
    const userIndex = db.users.findIndex(u => u.id === id)
    if (userIndex === -1) return null
    
    db.users[userIndex] = {
      ...db.users[userIndex],
      ...updates
    }
    await this.saveDatabase(db)
    return db.users[userIndex]
  }

  // Batch operations
  async batchUpdateTasks(updates: { id: string; updates: any }[]) {
    const db = await this.getDatabase()
    const results = []
    
    for (const { id, updates: taskUpdates } of updates) {
      const taskIndex = db.tasks.findIndex(t => t.id === id)
      if (taskIndex !== -1) {
        db.tasks[taskIndex] = {
          ...db.tasks[taskIndex],
          ...taskUpdates,
          updatedAt: new Date().toISOString()
        }
        results.push(db.tasks[taskIndex])
      }
    }
    
    await this.saveDatabase(db)
    return results
  }
}