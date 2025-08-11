import { Database, Organization, Project, Task, User, Attachment } from './types'
import { parseTodoistCSV, TodoistTask, TodoistUser, getAllTodoistFiles } from './todoist-parser'
import { saveDatabase } from './db'
import path from 'path'

interface ProjectMapping {
  fileName: string
  organizationId: string
  projectName?: string
  color?: string
}

const ORGANIZATION_COLORS = {
  'The Portland Company': '#3b82f6',
  'Buy Some Lamps': '#10b981',
  'Politogy VRM': '#f59e0b',
  'VillageX': '#8b5cf6',
  'Personal': '#ec4899',
  'Property': '#06b6d4',
  'Client Projects': '#f97316'
}

const PROJECT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e'
]

// Map Todoist files to organizations
const PROJECT_MAPPINGS: ProjectMapping[] = [
  // TPC will be handled specially for sections
  { fileName: 'TPC', organizationId: 'org-tpc' },
  
  // Buy Some Lamps
  { fileName: 'BHS', organizationId: 'org-lamps', projectName: 'Brittany Hill Studios' },
  
  // Politogy VRM
  { fileName: 'Blockchain', organizationId: 'org-politogy' },
  
  // VillageX
  { fileName: 'VillageX.app', organizationId: 'org-villagex', projectName: 'VillageX App' },
  
  // Personal
  { fileName: 'Personal', organizationId: 'org-personal' },
  { fileName: 'Emma', organizationId: 'org-personal' },
  { fileName: 'Liam', organizationId: 'org-personal' },
  { fileName: 'Owen', organizationId: 'org-personal' },
  { fileName: 'Inbox', organizationId: 'org-personal' },
  { fileName: 'Ideas - Personal & Business', organizationId: 'org-personal' },
  { fileName: 'Priorities - Financial', organizationId: 'org-personal' },
  
  // Property
  { fileName: 'House', organizationId: 'org-property' },
  { fileName: 'RV', organizationId: 'org-property' },
  { fileName: 'Tiny House', organizationId: 'org-property' },
  { fileName: 'Studio', organizationId: 'org-property' },
  { fileName: 'Property', organizationId: 'org-property' },
  { fileName: 'Chicken Coop', organizationId: 'org-property' },
  { fileName: 'Vehicles', organizationId: 'org-property' },
  
  // Client Projects
  { fileName: 'Kens Solar Installation', organizationId: 'org-clients', projectName: "Ken's Solar Installation" },
  { fileName: 'Randys Solar System', organizationId: 'org-clients', projectName: "Randy's Solar System" },
  { fileName: 'Sunriver Womens Association', organizationId: 'org-clients', projectName: "Sunriver Women's Association" },
  { fileName: 'Outdoor Rentals Business', organizationId: 'org-clients' },
  { fileName: 'Ideas for Brittany', organizationId: 'org-clients' },
  { fileName: 'rther', organizationId: 'org-clients' },
]

export async function migrateTodoistData(backupDir: string): Promise<Database> {
  console.log('Starting Todoist migration...')
  
  // Initialize database structure
  const database: Database = {
    users: [],
    organizations: createOrganizations(),
    projects: [],
    tasks: [],
    tags: [],
    sections: [],
    taskSections: [],
    userSectionPreferences: [],
    settings: {
      showCompletedTasks: false
    }
  }
  
  // Get all Todoist files
  const files = await getAllTodoistFiles(backupDir)
  const allUsers = new Map<string, User>()
  let projectCounter = 0
  let taskCounter = 0
  
  // Process each file
  for (const filePath of files) {
    const fileName = path.basename(filePath, '.csv').split(' [')[0]
    console.log(`Processing ${fileName}...`)
    
    try {
      const { tasks, sections, users } = await parseTodoistCSV(filePath)
      
      // Collect users
      users.forEach(user => {
        if (!allUsers.has(user.id)) {
          allUsers.set(user.id, createUser(user))
        }
      })
      
      // Find mapping for this file
      const mapping = PROJECT_MAPPINGS.find(m => fileName.startsWith(m.fileName))
      if (!mapping) {
        console.warn(`No mapping found for ${fileName}, skipping...`)
        continue
      }
      
      // Handle TPC specially - create projects from sections
      if (fileName === 'TPC') {
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i]
          const now = new Date().toISOString()
          const project: Project = {
            id: `proj-${++projectCounter}`,
            name: section,
            color: PROJECT_COLORS[i % PROJECT_COLORS.length],
            organizationId: mapping.organizationId,
            isFavorite: false,
            todoistId: `${filePath}-section-${i}`,
            createdAt: now,
            updatedAt: now
          }
          database.projects.push(project)
          
          // Add tasks for this section
          const sectionTasks = tasks.filter((task, idx) => {
            // Find tasks that belong to this section based on position
            // This is a simplified approach - you might need to adjust based on actual data
            return getSectionForTask(tasks, sections, idx) === i
          })
          
          const taskIdMap = new Map<number, string>() // Map task index to task ID
          for (let i = 0; i < sectionTasks.length; i++) {
            const todoistTask = sectionTasks[i]
            const taskId = `task-${taskCounter++}`
            taskIdMap.set(i, taskId)
            
            // Find parent task based on indent level
            let parentId: string | undefined
            if (todoistTask.indent > 1) {
              // Look backwards for a task with lower indent
              for (let j = i - 1; j >= 0; j--) {
                if (sectionTasks[j].indent < todoistTask.indent) {
                  parentId = taskIdMap.get(j)
                  break
                }
              }
            }
            
            const task = createTask(todoistTask, project.id, allUsers, parseInt(taskId.split('-')[1]))
            task.parentId = parentId
            database.tasks.push(task)
          }
        }
      } else {
        // Create single project for this file
        const now = new Date().toISOString()
        const project: Project = {
          id: `proj-${++projectCounter}`,
          name: mapping.projectName || fileName,
          color: mapping.color || PROJECT_COLORS[projectCounter % PROJECT_COLORS.length],
          organizationId: mapping.organizationId,
          isFavorite: false,
          todoistId: filePath,
          createdAt: now,
          updatedAt: now
        }
        database.projects.push(project)
        
        // Add all tasks to this project with parent relationships
        const taskIdMap = new Map<number, string>() // Map task index to task ID
        for (let i = 0; i < tasks.length; i++) {
          const todoistTask = tasks[i]
          const taskId = `task-${taskCounter++}`
          taskIdMap.set(i, taskId)
          
          // Find parent task based on indent level
          let parentId: string | undefined
          if (todoistTask.indent > 1) {
            // Look backwards for a task with lower indent
            for (let j = i - 1; j >= 0; j--) {
              if (tasks[j].indent < todoistTask.indent) {
                parentId = taskIdMap.get(j)
                break
              }
            }
          }
          
          const task = createTask(todoistTask, project.id, allUsers, parseInt(taskId.split('-')[1]))
          task.parentId = parentId
          database.tasks.push(task)
        }
      }
      
    } catch (error) {
      console.error(`Error processing ${fileName}:`, error)
    }
  }
  
  // Add all collected users to database
  database.users = Array.from(allUsers.values())
  
  console.log(`Migration complete! Imported ${database.projects.length} projects and ${database.tasks.length} tasks.`)
  
  return database
}

function createOrganizations(): Organization[] {
  return [
    { id: 'org-tpc', name: 'The Portland Company', color: ORGANIZATION_COLORS['The Portland Company'] },
    { id: 'org-lamps', name: 'Buy Some Lamps', color: ORGANIZATION_COLORS['Buy Some Lamps'] },
    { id: 'org-politogy', name: 'Politogy VRM', color: ORGANIZATION_COLORS['Politogy VRM'] },
    { id: 'org-villagex', name: 'VillageX', color: ORGANIZATION_COLORS['VillageX'] },
    { id: 'org-personal', name: 'Personal', color: ORGANIZATION_COLORS['Personal'] },
    { id: 'org-property', name: 'Property', color: ORGANIZATION_COLORS['Property'] },
    { id: 'org-clients', name: 'Client Projects', color: ORGANIZATION_COLORS['Client Projects'] }
  ]
}

function createUser(todoistUser: TodoistUser): User {
  const names: Record<string, { first: string, last: string }> = {
    'Spencer': { first: 'Spencer', last: 'Hill' },
    'Britt': { first: 'Brittany', last: 'Hill' },
    'Brittany': { first: 'Brittany', last: 'Hill' },
    'Emma': { first: 'Emma', last: 'Hill' },
    'Liam': { first: 'Liam', last: 'Hill' },
    'Owen': { first: 'Owen', last: 'Hill' }
  }
  
  const nameData = names[todoistUser.name] || { first: todoistUser.name, last: '' }
  
  const now = new Date().toISOString()
  return {
    id: `user-${todoistUser.id}`,
    name: todoistUser.name,
    firstName: nameData.first,
    lastName: nameData.last,
    email: '',
    todoistId: todoistUser.id,
    createdAt: now,
    updatedAt: now
  }
}

function createTask(
  todoistTask: TodoistTask,
  projectId: string,
  users: Map<string, User>,
  taskId: number
): Task {
  // Parse assigned user
  let assignedUserId: string | undefined
  let assignedUserName: string | undefined
  
  if (todoistTask.responsible) {
    const respMatch = todoistTask.responsible.match(/(.+?)\s*\((\d+)\)/)
    if (respMatch) {
      const user = users.get(respMatch[2])
      if (user) {
        assignedUserId = user.id
        assignedUserName = `${user.firstName} ${user.lastName}`.trim()
      }
    }
  }
  
  // Convert files to attachments
  const attachments: Attachment[] = todoistTask.files.map((url, idx) => ({
    id: `att-${taskId}-${idx}`,
    name: `Attachment ${idx + 1}`,
    url,
    type: 'todoist'
  }))
  
  // Build enhanced description
  let description = todoistTask.description || ''
  if (assignedUserName) {
    description = `Assigned to: ${assignedUserName}\n\n${description}`
  }
  
  const task: Task = {
    id: `task-${taskId}`,
    name: todoistTask.content,
    description: description || undefined,
    dueDate: parseDueDate(todoistTask.date),
    deadline: todoistTask.deadline ? parseDueDate(todoistTask.deadline) : undefined,
    priority: todoistTask.priority as 1 | 2 | 3 | 4,
    reminders: [],
    files: attachments,
    projectId,
    assignedTo: assignedUserId,
    assignedToName: assignedUserName,
    tags: [],
    completed: todoistTask.isCompleted,
    completedAt: todoistTask.completedDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    todoistId: `${projectId}-${taskId}`,
    recurringPattern: todoistTask.recurringPattern,
    indent: todoistTask.indent
  }
  
  return task
}

function parseDueDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined
  
  const currentYear = new Date().getFullYear()
  
  // Try to parse common Todoist date formats
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,  // YYYY-MM-DD
    /(\w+ \d+, \d{4})/,     // Month DD, YYYY
    /(\w+ \d+)/             // Month DD (no year)
  ]
  
  for (const pattern of datePatterns) {
    const match = dateStr.match(pattern)
    if (match) {
      try {
        let dateString = match[1]
        
        // If the date doesn't include a year (pattern 3), add the current year
        if (pattern === datePatterns[2]) {
          dateString = `${match[1]}, ${currentYear}`
        }
        
        const date = new Date(dateString)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } catch {}
    }
  }
  
  return undefined
}

function getSectionForTask(tasks: TodoistTask[], sections: string[], taskIndex: number): number {
  // This is a simplified approach - you might need to refine based on actual data structure
  // For now, we'll distribute tasks evenly among sections
  if (sections.length === 0) return 0
  
  const tasksPerSection = Math.ceil(tasks.length / sections.length)
  return Math.floor(taskIndex / tasksPerSection)
}

export async function runMigration() {
  const backupDir = path.join(process.cwd(), 'documents', 'todoist-backup')
  const database = await migrateTodoistData(backupDir)
  await saveDatabase(database)
  console.log('Database saved successfully!')
}