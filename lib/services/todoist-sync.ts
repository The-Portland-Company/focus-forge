// Todoist Sync Service
// Handles bidirectional synchronization between Todoist and Command Center

import { TodoistClient } from './todoist-client'
import { 
  TodoistSyncResponse,
  TodoistApiTask,
  TodoistApiProject,
  TodoistApiLabel,
  TodoistApiComment,
  TodoistApiSection,
  TodoistSyncState,
  TodoistSyncHistory,
  TodoistSyncConflict
} from '../todoist-types'
import { Task, Project, Tag, Section, Comment, User } from '../types'
import { createClient } from '@supabase/supabase-js'

export interface SyncResult {
  success: boolean
  itemsCreated: number
  itemsUpdated: number
  itemsDeleted: number
  projectsCreated: number
  projectsUpdated: number
  projectsDeleted: number
  conflictsFound: number
  conflictsResolved: number
  errors: string[]
  syncToken?: string
}

export class TodoistSyncService {
  private client: TodoistClient
  private supabase: any
  private userId: string

  constructor(apiToken: string, supabaseClient: any, userId: string) {
    this.client = new TodoistClient(apiToken)
    this.supabase = supabaseClient
    this.userId = userId
  }

  /**
   * Perform initial full import from Todoist
   */
  async initialImport(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      projectsCreated: 0,
      projectsUpdated: 0,
      projectsDeleted: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      errors: []
    }

    try {
      // Create backup before import
      await this.createBackup('pre_import')

      // Get full sync from Todoist
      const syncResponse = await this.client.fullSync()
      
      // Update user profile with Todoist info
      if (syncResponse.user) {
        await this.updateUserProfile(syncResponse.user)
      }

      // Sync projects first (they're needed for tasks)
      if (syncResponse.projects) {
        const projectResults = await this.syncProjects(syncResponse.projects)
        result.projectsCreated += projectResults.created
        result.projectsUpdated += projectResults.updated
      }

      // Sync sections
      if (syncResponse.sections) {
        await this.syncSections(syncResponse.sections)
      }

      // Sync labels/tags
      if (syncResponse.labels) {
        await this.syncLabels(syncResponse.labels)
      }

      // Sync tasks
      if (syncResponse.items) {
        const taskResults = await this.syncTasks(syncResponse.items)
        result.itemsCreated += taskResults.created
        result.itemsUpdated += taskResults.updated
      }

      // Sync comments
      if (syncResponse.notes || syncResponse.project_notes) {
        await this.syncComments([
          ...(syncResponse.notes || []),
          ...(syncResponse.project_notes || [])
        ])
      }

      // Save sync state
      await this.saveSyncState(syncResponse.sync_token, 'completed')
      
      result.syncToken = syncResponse.sync_token
      result.success = true

      // Log sync history
      await this.logSyncHistory('full', result)

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push(message)
      await this.saveSyncState(null, 'failed', message)
    }

    return result
  }

  /**
   * Perform incremental sync
   */
  async incrementalSync(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      projectsCreated: 0,
      projectsUpdated: 0,
      projectsDeleted: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      errors: []
    }

    try {
      // Get current sync token
      const syncState = await this.getSyncState()
      if (!syncState?.syncToken) {
        throw new Error('No sync token found. Please perform initial import first.')
      }

      // Mark as syncing
      await this.saveSyncState(syncState.syncToken, 'syncing')

      // Get incremental changes from Todoist
      const syncResponse = await this.client.incrementalSync(syncState.syncToken)

      // Process changes
      if (syncResponse.projects) {
        const projectResults = await this.syncProjects(syncResponse.projects)
        result.projectsCreated += projectResults.created
        result.projectsUpdated += projectResults.updated
      }

      if (syncResponse.sections) {
        await this.syncSections(syncResponse.sections)
      }

      if (syncResponse.labels) {
        await this.syncLabels(syncResponse.labels)
      }

      if (syncResponse.items) {
        const taskResults = await this.syncTasks(syncResponse.items)
        result.itemsCreated += taskResults.created
        result.itemsUpdated += taskResults.updated
      }

      if (syncResponse.notes || syncResponse.project_notes) {
        await this.syncComments([
          ...(syncResponse.notes || []),
          ...(syncResponse.project_notes || [])
        ])
      }

      // Push local changes to Todoist
      await this.pushLocalChanges()

      // Save new sync token
      await this.saveSyncState(syncResponse.sync_token, 'completed')
      
      result.syncToken = syncResponse.sync_token
      result.success = true

      // Log sync history
      await this.logSyncHistory('incremental', result)

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push(message)
      await this.saveSyncState(null, 'failed', message)
    }

    return result
  }

  /**
   * Push local changes to Todoist
   */
  private async pushLocalChanges(): Promise<void> {
    // Get tasks that were modified locally since last sync
    const { data: localTasks } = await this.supabase
      .from('tasks')
      .select('*')
      .gt('updated_at', 'last_todoist_sync')
      .not('todoist_id', 'is', null)

    if (localTasks && localTasks.length > 0) {
      for (const task of localTasks) {
        try {
          if (task.completed && !task.todoist_completed) {
            // Complete task in Todoist
            await this.client.closeTask(task.todoist_id)
          } else if (!task.completed && task.todoist_completed) {
            // Reopen task in Todoist
            await this.client.reopenTask(task.todoist_id)
          } else {
            // Update task in Todoist
            await this.client.updateTask(task.todoist_id, {
              content: task.name,
              description: task.description,
              priority: 5 - task.priority, // Todoist uses reverse priority
              due: task.due_date ? {
                date: task.due_date,
                ...(task.due_time && { datetime: `${task.due_date}T${task.due_time}` })
              } : undefined
            })
          }

          // Update last sync time
          await this.supabase
            .from('tasks')
            .update({ last_todoist_sync: new Date().toISOString() })
            .eq('id', task.id)

        } catch (error) {
          console.error(`Failed to push task ${task.id} to Todoist:`, error)
        }
      }
    }

    // Similarly handle projects, comments, etc.
    await this.pushProjectChanges()
  }

  /**
   * Push project changes to Todoist
   */
  private async pushProjectChanges(): Promise<void> {
    const { data: localProjects } = await this.supabase
      .from('projects')
      .select('*')
      .gt('updated_at', 'last_todoist_sync')
      .not('todoist_id', 'is', null)

    if (localProjects && localProjects.length > 0) {
      for (const project of localProjects) {
        try {
          await this.client.updateProject(project.todoist_id, {
            name: project.name,
            color: project.color,
            is_favorite: project.is_favorite
          })

          await this.supabase
            .from('projects')
            .update({ last_todoist_sync: new Date().toISOString() })
            .eq('id', project.id)

        } catch (error) {
          console.error(`Failed to push project ${project.id} to Todoist:`, error)
        }
      }
    }
  }

  /**
   * Sync projects from Todoist
   */
  private async syncProjects(todoistProjects: TodoistApiProject[]): Promise<{ created: number; updated: number }> {
    let created = 0
    let updated = 0

    for (const todoistProject of todoistProjects) {
      // Check if project exists
      const { data: existingProject } = await this.supabase
        .from('projects')
        .select('*')
        .eq('todoist_id', todoistProject.id)
        .single()

      const projectData = {
        name: todoistProject.name,
        color: todoistProject.color,
        todoist_id: todoistProject.id,
        todoist_parent_id: todoistProject.parent_id,
        todoist_child_order: todoistProject.order,
        todoist_shared: todoistProject.is_shared,
        todoist_is_favorite: todoistProject.is_favorite,
        todoist_view_style: todoistProject.view_style,
        last_todoist_sync: new Date().toISOString()
      }

      if (existingProject) {
        // Check for conflicts
        if (await this.hasConflict(existingProject, projectData)) {
          await this.createConflict('project', existingProject.id, todoistProject.id, existingProject, projectData)
        } else {
          // Update existing project
          await this.supabase
            .from('projects')
            .update(projectData)
            .eq('id', existingProject.id)
          updated++
        }
      } else {
        // Create new project (need to associate with an organization)
        const { data: defaultOrg } = await this.supabase
          .from('organizations')
          .select('id')
          .limit(1)
          .single()

        if (defaultOrg) {
          await this.supabase
            .from('projects')
            .insert({
              ...projectData,
              organization_id: defaultOrg.id
            })
          created++
        }
      }
    }

    return { created, updated }
  }

  /**
   * Sync tasks from Todoist
   */
  private async syncTasks(todoistTasks: TodoistApiTask[]): Promise<{ created: number; updated: number }> {
    let created = 0
    let updated = 0

    for (const todoistTask of todoistTasks) {
      // Find project by todoist_id
      const { data: project } = await this.supabase
        .from('projects')
        .select('id')
        .eq('todoist_id', todoistTask.project_id)
        .single()

      if (!project) {
        console.warn(`Project not found for task ${todoistTask.id}`)
        continue
      }

      // Check if task exists
      const { data: existingTask } = await this.supabase
        .from('tasks')
        .select('*')
        .eq('todoist_id', todoistTask.id)
        .single()

      const taskData: Record<string, any> = {
        name: todoistTask.content,
        description: todoistTask.description,
        project_id: project.id,
        priority: 5 - todoistTask.priority, // Convert Todoist priority
        completed: todoistTask.is_completed,
        todoist_id: todoistTask.id,
        todoist_order: todoistTask.order,
        todoist_labels: todoistTask.labels,
        todoist_assignee_id: todoistTask.assignee_id,
        todoist_assigner_id: todoistTask.assigner_id,
        todoist_comment_count: todoistTask.comment_count,
        todoist_url: todoistTask.url,
        is_recurring: todoistTask.due?.is_recurring || false,
        recurring_pattern: todoistTask.due?.string,
        due_date: todoistTask.due?.date,
        last_todoist_sync: new Date().toISOString()
      }

      if (todoistTask.parent_id) {
        // Find parent task
        const { data: parentTask } = await this.supabase
          .from('tasks')
          .select('id')
          .eq('todoist_id', todoistTask.parent_id)
          .single()
        
        if (parentTask) {
          taskData['parent_id'] = parentTask.id
        }
      }

      if (todoistTask.section_id) {
        // Find section
        const { data: section } = await this.supabase
          .from('sections')
          .select('id')
          .eq('todoist_id', todoistTask.section_id)
          .single()
        
        if (section) {
          taskData['section_id'] = section.id
        }
      }

      if (existingTask) {
        // Check for conflicts
        if (await this.hasConflict(existingTask, taskData)) {
          await this.createConflict('task', existingTask.id, todoistTask.id, existingTask, taskData)
        } else {
          // Update existing task
          await this.supabase
            .from('tasks')
            .update(taskData)
            .eq('id', existingTask.id)
          updated++
        }
      } else {
        // Create new task
        await this.supabase
          .from('tasks')
          .insert(taskData)
        created++
      }
    }

    return { created, updated }
  }

  /**
   * Sync labels/tags from Todoist
   */
  private async syncLabels(todoistLabels: TodoistApiLabel[]): Promise<void> {
    for (const todoistLabel of todoistLabels) {
      const { data: existingTag } = await this.supabase
        .from('tags')
        .select('*')
        .eq('todoist_id', todoistLabel.id)
        .single()

      const tagData = {
        name: todoistLabel.name,
        color: todoistLabel.color,
        todoist_id: todoistLabel.id,
        todoist_order: todoistLabel.order,
        todoist_is_favorite: todoistLabel.is_favorite
      }

      if (existingTag) {
        await this.supabase
          .from('tags')
          .update(tagData)
          .eq('id', existingTag.id)
      } else {
        await this.supabase
          .from('tags')
          .insert(tagData)
      }
    }
  }

  /**
   * Sync sections from Todoist
   */
  private async syncSections(todoistSections: TodoistApiSection[]): Promise<void> {
    for (const todoistSection of todoistSections) {
      // Find project by todoist_id
      const { data: project } = await this.supabase
        .from('projects')
        .select('id')
        .eq('todoist_id', todoistSection.project_id)
        .single()

      if (!project) continue

      const { data: existingSection } = await this.supabase
        .from('sections')
        .select('*')
        .eq('todoist_id', todoistSection.id)
        .single()

      const sectionData = {
        name: todoistSection.name,
        project_id: project.id,
        todoist_id: todoistSection.id,
        todoist_order: todoistSection.order
      }

      if (existingSection) {
        await this.supabase
          .from('sections')
          .update(sectionData)
          .eq('id', existingSection.id)
      } else {
        await this.supabase
          .from('sections')
          .insert(sectionData)
      }
    }
  }

  /**
   * Sync comments from Todoist
   */
  private async syncComments(todoistComments: TodoistApiComment[]): Promise<void> {
    for (const todoistComment of todoistComments) {
      const { data: existingComment } = await this.supabase
        .from('comments')
        .select('*')
        .eq('todoist_id', todoistComment.id)
        .single()

      const commentData: any = {
        content: todoistComment.content,
        todoist_id: todoistComment.id,
        todoist_posted_at: todoistComment.posted_at,
        todoist_attachment: todoistComment.attachment,
        user_id: this.userId
      }

      if (todoistComment.task_id) {
        const { data: task } = await this.supabase
          .from('tasks')
          .select('id')
          .eq('todoist_id', todoistComment.task_id)
          .single()
        
        if (task) {
          commentData.task_id = task.id
        }
      }

      if (todoistComment.project_id) {
        const { data: project } = await this.supabase
          .from('projects')
          .select('id')
          .eq('todoist_id', todoistComment.project_id)
          .single()
        
        if (project) {
          commentData.project_id = project.id
        }
      }

      if (existingComment) {
        await this.supabase
          .from('comments')
          .update(commentData)
          .eq('id', existingComment.id)
      } else {
        await this.supabase
          .from('comments')
          .insert(commentData)
      }
    }
  }

  /**
   * Update user profile with Todoist info
   */
  private async updateUserProfile(todoistUser: any): Promise<void> {
    await this.supabase
      .from('profiles')
      .update({
        todoist_user_id: todoistUser.id,
        todoist_email: todoistUser.email,
        todoist_full_name: todoistUser.full_name,
        todoist_timezone: todoistUser.timezone,
        todoist_start_page: todoistUser.start_page,
        todoist_start_day: todoistUser.start_day,
        todoist_karma: todoistUser.karma,
        todoist_karma_trend: todoistUser.karma_trend,
        todoist_premium: todoistUser.is_premium
      })
      .eq('id', this.userId)
  }

  /**
   * Check if there's a conflict between local and Todoist data
   */
  private async hasConflict(localData: any, todoistData: any): Promise<boolean> {
    // Simple timestamp comparison - if both were updated within 1 minute, it's a conflict
    if (!localData.updated_at || !localData.last_todoist_sync) {
      return false
    }

    const localUpdate = new Date(localData.updated_at).getTime()
    const lastSync = new Date(localData.last_todoist_sync).getTime()

    // If local was updated after last sync, there might be a conflict
    return localUpdate > lastSync
  }

  /**
   * Create a conflict record
   */
  private async createConflict(
    resourceType: string,
    resourceId: string,
    todoistId: string,
    localData: any,
    todoistData: any
  ): Promise<void> {
    // Use last-write-wins strategy
    const localUpdate = new Date(localData.updated_at).getTime()
    const now = Date.now()

    // If local update is more recent, keep local
    if (now - localUpdate < 60000) { // Within last minute
      // Local wins - don't update
      return
    }

    // Otherwise, Todoist wins - update local
    if (resourceType === 'task') {
      await this.supabase
        .from('tasks')
        .update(todoistData)
        .eq('id', resourceId)
    } else if (resourceType === 'project') {
      await this.supabase
        .from('projects')
        .update(todoistData)
        .eq('id', resourceId)
    }

    // Log the conflict
    await this.supabase
      .from('todoist_sync_conflicts')
      .insert({
        user_id: this.userId,
        resource_type: resourceType,
        resource_id: resourceId,
        todoist_id: todoistId,
        local_data: localData,
        todoist_data: todoistData,
        local_updated_at: localData.updated_at,
        todoist_updated_at: new Date().toISOString(),
        resolution_strategy: 'last_write_wins',
        resolved_at: new Date().toISOString()
      })
  }

  /**
   * Get current sync state
   */
  private async getSyncState(): Promise<TodoistSyncState | null> {
    const { data } = await this.supabase
      .from('todoist_sync_state')
      .select('*')
      .eq('user_id', this.userId)
      .single()

    return data
  }

  /**
   * Save sync state
   */
  private async saveSyncState(
    syncToken: string | null,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    const stateData = {
      user_id: this.userId,
      sync_token: syncToken,
      sync_status: status,
      error_message: errorMessage,
      last_sync_at: new Date().toISOString(),
      next_sync_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
    }

    const existingState = await this.getSyncState()

    if (existingState) {
      await this.supabase
        .from('todoist_sync_state')
        .update(stateData)
        .eq('user_id', this.userId)
    } else {
      await this.supabase
        .from('todoist_sync_state')
        .insert(stateData)
    }
  }

  /**
   * Create backup before import
   */
  private async createBackup(backupType: string): Promise<void> {
    // Get all user data
    const { data: tasks } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('created_by', this.userId)

    const { data: projects } = await this.supabase
      .from('projects')
      .select('*')

    const { data: tags } = await this.supabase
      .from('tags')
      .select('*')

    const backupData = {
      tasks,
      projects,
      tags,
      timestamp: new Date().toISOString()
    }

    await this.supabase
      .from('todoist_import_backup')
      .insert({
        user_id: this.userId,
        backup_type: backupType,
        data: backupData,
        item_count: tasks?.length || 0,
        project_count: projects?.length || 0,
        tag_count: tags?.length || 0
      })
  }

  /**
   * Log sync history
   */
  private async logSyncHistory(syncType: string, result: SyncResult): Promise<void> {
    await this.supabase
      .from('todoist_sync_history')
      .insert({
        user_id: this.userId,
        sync_type: syncType,
        sync_direction: 'bidirectional',
        items_created: result.itemsCreated,
        items_updated: result.itemsUpdated,
        items_deleted: result.itemsDeleted,
        projects_created: result.projectsCreated,
        projects_updated: result.projectsUpdated,
        projects_deleted: result.projectsDeleted,
        conflicts_resolved: result.conflictsResolved,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        sync_token_after: result.syncToken,
        error_details: result.errors.length > 0 ? { errors: result.errors } : null
      })
  }
}
