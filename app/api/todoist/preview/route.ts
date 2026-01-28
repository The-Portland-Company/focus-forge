import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TodoistClient } from '@/lib/services/todoist-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user's Todoist API token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('todoist_api_token')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.todoist_api_token) {
      return NextResponse.json(
        { error: 'Todoist not connected' },
        { status: 400 }
      )
    }

    // Fetch from Todoist
    const todoistClient = new TodoistClient(profile.todoist_api_token)

    let todoistProjects, todoistTasks
    try {
      ;[todoistProjects, todoistTasks] = await Promise.all([
        todoistClient.getProjects(),
        todoistClient.getTasks()
      ])
    } catch (todoistError: any) {
      console.error('Todoist API error:', todoistError)

      // Check for auth errors
      if (todoistError.message?.includes('401') || todoistError.message?.includes('Forbidden')) {
        return NextResponse.json(
          { error: 'Todoist API token is invalid or expired. Please reconnect your Todoist account.' },
          { status: 401 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to fetch from Todoist', details: todoistError.message },
        { status: 502 }
      )
    }

    // Fetch current local data
    const [localProjects, localTasks] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, todoist_id, color, updated_at')
        .not('todoist_id', 'is', null),
      supabase
        .from('tasks')
        .select('id, name, todoist_id, completed, priority, due_date, updated_at')
        .not('todoist_id', 'is', null)
    ])

    // Build comparison data
    const todoistProjectMap = new Map(todoistProjects.map(p => [p.id, p]))
    const localProjectMap = new Map(localProjects.data?.map(p => [p.todoist_id, p]) || [])

    const todoistTaskMap = new Map(todoistTasks.map(t => [t.id, t]))
    const localTaskMap = new Map(localTasks.data?.map(t => [t.todoist_id, t]) || [])

    // Find new, updated, and unchanged items
    const projectChanges = {
      new: [] as any[],
      updated: [] as any[],
      unchanged: [] as any[],
      deleted: [] as any[]
    }

    const taskChanges = {
      new: [] as any[],
      updated: [] as any[],
      unchanged: [] as any[],
      deleted: [] as any[]
    }

    // Check Todoist projects
    for (const [todoistId, project] of todoistProjectMap) {
      const local = localProjectMap.get(todoistId)
      if (!local) {
        projectChanges.new.push({
          name: project.name,
          color: project.color,
          todoistId
        })
      } else {
        // Simple change detection - compare names
        if (project.name !== local.name) {
          projectChanges.updated.push({
            name: project.name,
            localName: local.name,
            todoistId
          })
        } else {
          projectChanges.unchanged.push({
            name: project.name,
            todoistId
          })
        }
      }
    }

    // Check for deleted projects (in local but not in Todoist)
    for (const [todoistId, local] of localProjectMap) {
      if (!todoistProjectMap.has(todoistId)) {
        projectChanges.deleted.push({
          name: local.name,
          todoistId
        })
      }
    }

    // Check Todoist tasks
    for (const [todoistId, task] of todoistTaskMap) {
      const local = localTaskMap.get(todoistId)
      if (!local) {
        taskChanges.new.push({
          name: task.content,
          priority: task.priority,
          dueDate: task.due?.date || null,
          todoistId
        })
      } else {
        // Check for changes
        const hasChanges =
          task.content !== local.name ||
          task.priority !== local.priority ||
          (task.is_completed || false) !== local.completed

        if (hasChanges) {
          taskChanges.updated.push({
            name: task.content,
            localName: local.name,
            priority: task.priority,
            localPriority: local.priority,
            completed: task.is_completed || false,
            localCompleted: local.completed,
            todoistId
          })
        } else {
          taskChanges.unchanged.push({
            name: task.content,
            todoistId
          })
        }
      }
    }

    // Check for deleted tasks
    for (const [todoistId, local] of localTaskMap) {
      if (!todoistTaskMap.has(todoistId)) {
        taskChanges.deleted.push({
          name: local.name,
          todoistId
        })
      }
    }

    return NextResponse.json({
      success: true,
      todoist: {
        projectCount: todoistProjects.length,
        taskCount: todoistTasks.length
      },
      local: {
        projectCount: localProjects.data?.length || 0,
        taskCount: localTasks.data?.length || 0
      },
      changes: {
        projects: projectChanges,
        tasks: taskChanges
      },
      summary: {
        newProjects: projectChanges.new.length,
        updatedProjects: projectChanges.updated.length,
        deletedProjects: projectChanges.deleted.length,
        newTasks: taskChanges.new.length,
        updatedTasks: taskChanges.updated.length,
        deletedTasks: taskChanges.deleted.length
      }
    })

  } catch (error: any) {
    console.error('Preview error:', error.message, error.stack)
    return NextResponse.json(
      { error: 'Failed to fetch preview', details: error.message },
      { status: 500 }
    )
  }
}
