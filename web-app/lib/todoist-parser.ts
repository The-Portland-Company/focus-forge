import { parse } from 'csv-parse/sync'
import fs from 'fs/promises'
import path from 'path'

export interface TodoistRow {
  TYPE: string
  CONTENT: string
  DESCRIPTION: string
  PRIORITY: string
  INDENT: string
  AUTHOR: string
  RESPONSIBLE: string
  DATE: string
  DATE_LANG: string
  TIMEZONE: string
  DURATION: string
  DURATION_UNIT: string
  DEADLINE: string
  DEADLINE_LANG: string
}

export interface TodoistTask {
  type: string
  content: string
  description: string
  priority: number
  indent: number
  author: string
  responsible: string
  date: string
  timezone: string
  duration?: number
  durationUnit?: string
  deadline?: string
  isCompleted: boolean
  completedDate?: string
  files: string[]
  recurringPattern?: string
}

export interface TodoistUser {
  name: string
  id: string
}

export async function parseTodoistCSV(filePath: string): Promise<{
  tasks: TodoistTask[]
  sections: string[]
  users: Set<TodoistUser>
}> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  
  // Remove BOM if present
  const content = fileContent.replace(/^\uFEFF/, '')
  
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  }) as TodoistRow[]
  
  const tasks: TodoistTask[] = []
  const sections: string[] = []
  const users = new Set<TodoistUser>()
  
  for (const row of records) {
    if (row.TYPE === 'task') {
      const task = parseTask(row)
      tasks.push(task)
      
      // Extract users
      if (row.AUTHOR) {
        const authorMatch = row.AUTHOR.match(/(.+?)\s*\((\d+)\)/)
        if (authorMatch) {
          users.add({ name: authorMatch[1], id: authorMatch[2] })
        }
      }
      
      if (row.RESPONSIBLE) {
        const respMatch = row.RESPONSIBLE.match(/(.+?)\s*\((\d+)\)/)
        if (respMatch) {
          users.add({ name: respMatch[1], id: respMatch[2] })
        }
      }
    } else if (row.TYPE === 'section') {
      sections.push(row.CONTENT)
    }
  }
  
  return { tasks, sections, users }
}

function parseTask(row: TodoistRow): TodoistTask {
  // Check if task is completed (has completion date in description or special format)
  const isCompleted = row.CONTENT.includes('✓') || row.DESCRIPTION.includes('completed:')
  const completedMatch = row.DESCRIPTION.match(/completed:\s*(\d{4}-\d{2}-\d{2})/)
  
  // Extract file attachments from description
  const files: string[] = []
  const fileMatches = row.DESCRIPTION.matchAll(/\[([^\]]+)\]\((https:\/\/todoist\.com\/app\/project\/[^)]+)\)/g)
  for (const match of fileMatches) {
    files.push(match[2])
  }
  
  // Parse recurring pattern from DATE field
  let recurringPattern: string | undefined
  if (row.DATE && (row.DATE.includes('every') || row.DATE.includes('after'))) {
    recurringPattern = row.DATE
  }
  
  return {
    type: row.TYPE,
    content: row.CONTENT.replace('✓', '').trim(),
    description: row.DESCRIPTION,
    priority: parseInt(row.PRIORITY) || 4,
    indent: parseInt(row.INDENT) || 1,
    author: row.AUTHOR,
    responsible: row.RESPONSIBLE,
    date: row.DATE,
    timezone: row.TIMEZONE,
    duration: row.DURATION ? parseInt(row.DURATION) : undefined,
    durationUnit: row.DURATION_UNIT,
    deadline: row.DEADLINE,
    isCompleted,
    completedDate: completedMatch ? completedMatch[1] : undefined,
    files,
    recurringPattern
  }
}

export async function getAllTodoistFiles(backupDir: string): Promise<string[]> {
  const files = await fs.readdir(backupDir)
  return files
    .filter(file => file.endsWith('.csv'))
    .map(file => path.join(backupDir, file))
}