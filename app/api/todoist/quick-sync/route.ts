import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TodoistClient } from '@/lib/services/todoist-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  const { userId, mode = 'merge' } = await request.json()

  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        sendProgress({ type: 'status', message: 'Connecting to database...' })

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Get user's Todoist API token
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('todoist_api_token')
          .eq('id', userId)
          .single()

        if (profileError || !profile?.todoist_api_token) {
          sendProgress({ type: 'error', message: 'Todoist not connected' })
          controller.close()
          return
        }

        sendProgress({ type: 'status', message: 'Connecting to Todoist...' })

        // Initialize Todoist client (uses REST API)
        const todoistClient = new TodoistClient(profile.todoist_api_token)

        // Fetch data from Todoist using REST API
        sendProgress({ type: 'status', message: 'Fetching projects from Todoist...' })

        let todoistProjects, todoistTasks
        try {
          todoistProjects = await todoistClient.getProjects()
          sendProgress({
            type: 'progress',
            message: `Found ${todoistProjects.length} projects in Todoist`,
            projectsTotal: todoistProjects.length
          })

          sendProgress({ type: 'status', message: 'Fetching tasks from Todoist...' })
          todoistTasks = await todoistClient.getTasks()
          sendProgress({
            type: 'progress',
            message: `Found ${todoistTasks.length} tasks in Todoist`,
            tasksTotal: todoistTasks.length
          })
        } catch (todoistError: any) {
          console.error('Todoist API error:', todoistError)
          if (todoistError.message?.includes('401') || todoistError.message?.includes('Forbidden')) {
            sendProgress({ type: 'error', message: 'Todoist API token is invalid or expired. Please reconnect.' })
          } else {
            sendProgress({ type: 'error', message: `Failed to fetch from Todoist: ${todoistError.message}` })
          }
          controller.close()
          return
        }

        // Get user's first organization (for new projects)
        const { data: userOrgs } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userId)
          .limit(1)

        if (!userOrgs || userOrgs.length === 0) {
          sendProgress({ type: 'error', message: 'User has no organization' })
          controller.close()
          return
        }

        const defaultOrgId = userOrgs[0].organization_id

        const result = {
          projectsCreated: 0,
          projectsUpdated: 0,
          tasksCreated: 0,
          tasksUpdated: 0,
          errors: [] as string[]
        }

        // If overwrite mode, delete existing Todoist-synced items first
        if (mode === 'overwrite') {
          sendProgress({ type: 'status', message: 'Clearing existing Todoist items...' })

          // Delete tasks with real todoist_id first (numeric IDs, not file paths)
          await supabase
            .from('tasks')
            .delete()
            .not('todoist_id', 'is', null)
            .not('todoist_id', 'like', '/%')
            .not('todoist_id', 'like', 'proj-%')

          // Delete projects with real todoist_id
          await supabase
            .from('projects')
            .delete()
            .not('todoist_id', 'is', null)
            .not('todoist_id', 'like', '/%')
            .not('todoist_id', 'like', 'proj-%')

          sendProgress({ type: 'status', message: 'Existing items cleared' })
        }

        // Process projects first (tasks need project IDs)
        const projectIdMap = new Map<string, string>() // Todoist ID -> Local ID

        sendProgress({ type: 'status', message: 'Syncing projects...' })

        for (let i = 0; i < todoistProjects.length; i++) {
          const todoistProject = todoistProjects[i]

          sendProgress({
            type: 'project_progress',
            current: i + 1,
            total: todoistProjects.length,
            name: todoistProject.name
          })

          try {
            // Check if project already exists
            const { data: existingProject } = await supabase
              .from('projects')
              .select('id')
              .eq('todoist_id', todoistProject.id)
              .maybeSingle()

            if (existingProject) {
              // Update existing project
              const { error: updateError } = await supabase
                .from('projects')
                .update({
                  name: todoistProject.name,
                  color: todoistProject.color || '#808080',
                  todoist_id: todoistProject.id,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingProject.id)

              if (updateError) {
                result.errors.push(`Failed to update project ${todoistProject.name}: ${updateError.message}`)
              } else {
                result.projectsUpdated++
                projectIdMap.set(todoistProject.id, existingProject.id)
              }
            } else {
              // Create new project
              const { data: newProject, error: insertError } = await supabase
                .from('projects')
                .insert({
                  name: todoistProject.name,
                  color: todoistProject.color || '#808080',
                  organization_id: defaultOrgId,
                  todoist_id: todoistProject.id,
                  is_favorite: todoistProject.is_favorite || false
                })
                .select('id')
                .single()

              if (insertError) {
                result.errors.push(`Failed to create project ${todoistProject.name}: ${insertError.message}`)
              } else if (newProject) {
                result.projectsCreated++
                projectIdMap.set(todoistProject.id, newProject.id)
              }
            }
          } catch (error: any) {
            result.errors.push(`Error processing project ${todoistProject.name}: ${error.message}`)
          }
        }

        sendProgress({
          type: 'status',
          message: `Projects: ${result.projectsCreated} created, ${result.projectsUpdated} updated`
        })

        // Process tasks
        sendProgress({ type: 'status', message: 'Syncing tasks...' })

        for (let i = 0; i < todoistTasks.length; i++) {
          const todoistTask = todoistTasks[i]

          sendProgress({
            type: 'task_progress',
            current: i + 1,
            total: todoistTasks.length,
            name: todoistTask.content.substring(0, 50) + (todoistTask.content.length > 50 ? '...' : '')
          })

          try {
            // Find local project ID
            let localProjectId = projectIdMap.get(todoistTask.project_id)

            // If not in our map, try to find it in the database
            if (!localProjectId) {
              const { data: existingProject } = await supabase
                .from('projects')
                .select('id')
                .eq('todoist_id', todoistTask.project_id)
                .maybeSingle()

              if (existingProject) {
                localProjectId = existingProject.id
                projectIdMap.set(todoistTask.project_id, existingProject.id)
              }
            }

            if (!localProjectId) {
              // Project not found, skip this task
              continue
            }

            // Check if task already exists
            const { data: existingTask } = await supabase
              .from('tasks')
              .select('id')
              .eq('todoist_id', todoistTask.id)
              .maybeSingle()

            // Map Todoist priority (1=lowest, 4=highest) to our priority (1=highest, 4=lowest)
            const priority = 5 - (todoistTask.priority || 1)

            // Don't auto-assign imported tasks - leave them unassigned
            // User can assign them manually or filter will show them in "unassigned"
            const assignedTo = null

            const taskData = {
              name: todoistTask.content,
              description: todoistTask.description || null,
              project_id: localProjectId,
              priority: priority,
              completed: todoistTask.is_completed || false,
              todoist_id: todoistTask.id,
              due_date: todoistTask.due?.date || null,
              recurring_pattern: todoistTask.due?.is_recurring ? todoistTask.due?.string : null,
              assigned_to: assignedTo,
              updated_at: new Date().toISOString()
            }

            if (existingTask) {
              // Update existing task
              const { error: updateError } = await supabase
                .from('tasks')
                .update(taskData)
                .eq('id', existingTask.id)

              if (updateError) {
                result.errors.push(`Failed to update task: ${updateError.message}`)
              } else {
                result.tasksUpdated++
              }
            } else {
              // Create new task
              const { error: insertError } = await supabase
                .from('tasks')
                .insert({
                  ...taskData,
                  created_at: new Date().toISOString()
                })

              if (insertError) {
                result.errors.push(`Failed to create task: ${insertError.message}`)
              } else {
                result.tasksCreated++
              }
            }
          } catch (error: any) {
            result.errors.push(`Error processing task: ${error.message}`)
          }
        }

        sendProgress({
          type: 'status',
          message: `Tasks: ${result.tasksCreated} created, ${result.tasksUpdated} updated`
        })

        // Log sync history
        sendProgress({ type: 'status', message: 'Saving sync history...' })

        await supabase
          .from('todoist_sync_history')
          .insert({
            user_id: userId,
            sync_type: mode === 'overwrite' ? 'full' : 'incremental',
            sync_direction: 'from_todoist',
            items_created: result.tasksCreated,
            items_updated: result.tasksUpdated,
            projects_created: result.projectsCreated,
            projects_updated: result.projectsUpdated,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            error_details: result.errors.length > 0 ? { errors: result.errors } : null
          })

        // Update last sync time on profile
        await supabase
          .from('profiles')
          .update({ last_todoist_sync: new Date().toISOString() })
          .eq('id', userId)

        // Send final result
        sendProgress({
          type: 'complete',
          success: true,
          result: {
            projectsCreated: result.projectsCreated,
            projectsUpdated: result.projectsUpdated,
            tasksCreated: result.tasksCreated,
            tasksUpdated: result.tasksUpdated,
            totalErrors: result.errors.length
          },
          message: `Synced ${result.projectsCreated + result.projectsUpdated} projects and ${result.tasksCreated + result.tasksUpdated} tasks from Todoist`
        })

        controller.close()

      } catch (error: any) {
        console.error('Quick sync error:', error)
        sendProgress({ type: 'error', message: error.message || 'Sync failed' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
