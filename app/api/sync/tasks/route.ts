import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/tasks - List all tasks
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    const sectionId = url.searchParams.get('sectionId')
    const completed = url.searchParams.get('completed')
    const assignedTo = url.searchParams.get('assignedTo')
    const dueDate = url.searchParams.get('dueDate')
    
    let query = supabase
      .from('tasks')
      .select('*')
      .order('todoistOrder', { ascending: true })
      .order('createdAt', { ascending: true })
    
    if (projectId) {
      query = query.eq('projectId', projectId)
    }
    
    if (sectionId) {
      query = query.eq('sectionId', sectionId)
    }
    
    if (completed !== null) {
      query = query.eq('completed', completed === 'true')
    }
    
    if (assignedTo) {
      query = query.eq('assignedTo', assignedTo)
    }
    
    if (dueDate) {
      query = query.eq('dueDate', dueDate)
    }
    
    const { data: tasks, error } = await query
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(tasks)
  })
}

// POST /api/sync/tasks - Create new task
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { 
        name, 
        projectId, 
        description, 
        dueDate, 
        dueTime,
        priority, 
        tags,
        assignedTo,
        sectionId,
        parentId,
        dependsOn,
        recurringPattern
      } = body
      
      if (!name || !projectId) {
        return createErrorResponse('Name and projectId are required', 400)
      }
      
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          name,
          projectId,
          description,
          dueDate,
          dueTime,
          priority: priority || 4,
          tags: tags || [],
          assignedTo,
          sectionId,
          parentId,
          dependsOn,
          recurringPattern,
          reminders: [],
          files: [],
          completed: false,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(task, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

// POST /api/sync/tasks/batch - Create multiple tasks
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      if (!Array.isArray(body.tasks)) {
        return createErrorResponse('Tasks array is required', 400)
      }
      
      const tasksToInsert = body.tasks.map(task => ({
        ...task,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        priority: task.priority || 4,
        tags: task.tags || [],
        reminders: task.reminders || [],
        files: task.files || [],
        completed: task.completed || false
      }))
      
      const { data: tasks, error } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(tasks, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}