import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Database, DatabaseAdapter } from './types'
import { SupabaseClient } from '@supabase/supabase-js'

export class SupabaseAdapter implements DatabaseAdapter {
  private supabase: any
  private userId: string

  constructor(supabase: any, userId: string) {
    this.supabase = supabase
    this.userId = userId
    console.log('🔧 SupabaseAdapter initialized with userId:', userId)
  }

  async getDatabase(): Promise<Database> {
    // This method is not used in Supabase adapter as we query directly
    throw new Error('getDatabase not implemented for Supabase adapter')
  }

  async saveDatabase(database: Database): Promise<void> {
    // This method is not used in Supabase adapter as we update directly
    throw new Error('saveDatabase not implemented for Supabase adapter')
  }

  // Organizations
  async getOrganizations(userId?: string) {
    const supabase = this.supabase
    const targetUserId = userId || this.userId
    
    console.log('🔍 SupabaseAdapter.getOrganizations - Fetching for user:', targetUserId)
    
    // Get organizations the user belongs to
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', targetUserId)
    
    console.log('📊 User organizations query result:', { 
      userOrgs, 
      userOrgsError,
      count: userOrgs?.length 
    })
    
    if (userOrgsError) {
      console.error('❌ Error fetching user organizations:', userOrgsError)
      return []
    }
    
    if (!userOrgs || userOrgs.length === 0) {
      console.log('No organizations found for user')
      return []
    }
    
    const orgIds = userOrgs.map((uo: { organization_id: string }) => uo.organization_id)
    console.log('📋 Organization IDs to fetch:', orgIds.length, 'IDs')
    
    // Fetch the actual organizations
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .order('order_index')

    if (error) {
      console.error('Error fetching organizations:', error)
      throw error
    }
    
    console.log('📊 Organizations fetched:', { 
      count: data?.length, 
      firstOrg: data?.[0]?.name
    })
    
    return data || []
  }

  async getOrganization(id: string) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  async createOrganization(org: any) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('organizations')
      .insert(org)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateOrganization(id: string, updates: any) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteOrganization(id: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Projects
  async getProjects(organizationId?: string) {
    const supabase = this.supabase
    
    // First get user's organizations if not specified
    if (!organizationId) {
      // Get ALL user organizations (including duplicates) for project fetching
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', this.userId)
      
      if (userOrgsError) {
        console.error('Error fetching user organizations for projects:', userOrgsError)
        return []
      }
      
      if (!userOrgs || userOrgs.length === 0) {
        return []
      }
      
      const allOrgIds = userOrgs.map((uo: { organization_id: string }) => uo.organization_id)
      console.log('📋 Fetching projects for ALL org IDs:', allOrgIds.length)
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .in('organization_id', allOrgIds)
        .order('order_index')
      
      if (error) throw error
      console.log('✅ Projects fetched:', data?.length || 0)
      return data || []
    } else {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', organizationId)
        .order('order_index')
      
      if (error) throw error
      return data || []
    }
  }

  async getProject(id: string) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  async createProject(project: any) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateProject(id: string, updates: any) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteProject(id: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Tasks
  async getTasks(projectId?: string) {
    const supabase = this.supabase

    // If fetching for a specific project, first verify user has access
    if (projectId) {
      const projects = await this.getProjects()
      const hasAccess = projects.some((p: { id: string }) => p.id === projectId)
      if (!hasAccess) {
        return []
      }
    }

    console.log('📋 Fetching tasks for user:', this.userId)
    const projects = projectId ? [] : await this.getProjects()
    const userProjectIds = projects.map((p: { id: string }) => p.id)
    const pageSize = 1000
    let offset = 0
    let allTasks: any[] = []

    while (true) {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          tags:task_tags(tag:tags(*)),
          reminders(*),
          attachments(*),
          assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, email, profile_color, profile_memoji)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (projectId) {
        query = query.eq('project_id', projectId)
      } else if (userProjectIds.length > 0) {
        query = query.or(`assigned_to.eq.${this.userId},and(assigned_to.is.null,project_id.in.(${userProjectIds.join(',')}))`)
      } else {
        query = query.eq('assigned_to', this.userId)
      }

      const { data, error } = await query
      if (error) throw error

      const batch = data || []
      allTasks = allTasks.concat(batch)

      if (batch.length < pageSize) {
        break
      }
      offset += pageSize
    }

    console.log('✅ Tasks fetched:', allTasks.length)

    // Transform the data to match the expected format
    return allTasks.map((task: any) => {
      // Construct assignee info from joined profile data
      let assigneeName: string | null = null
      let assigneeColor: string | null = null
      let assigneeInitial: string | null = null
      let assigneeMemoji: string | null = null
      if (task.assignee) {
        const firstName = task.assignee.first_name || ''
        const lastName = task.assignee.last_name || ''
        assigneeName = `${firstName} ${lastName}`.trim() || task.assignee.email || null
        assigneeColor = task.assignee.profile_color || null
        assigneeInitial = firstName ? firstName.charAt(0).toUpperCase() : (task.assignee.email ? task.assignee.email.charAt(0).toUpperCase() : null)
        assigneeMemoji = task.assignee.profile_memoji || null
      }

      return {
        ...task,
        // Map snake_case to camelCase for frontend compatibility
        projectId: task.project_id,
        dueDate: task.due_date,
        dueTime: task.due_time,
        parentId: task.parent_id,
        assignedTo: task.assigned_to,
        assignedToName: assigneeName,
        assignedToColor: assigneeColor,
        assignedToInitial: assigneeInitial,
        assignedToMemoji: assigneeMemoji,
        completedAt: task.completed_at,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        todoistId: task.todoist_id,
        recurringPattern: task.recurring_pattern,
        orderIndex: task.order_index,
        tags: task.tags?.map((t: any) => t.tag.id) || [],
        reminders: task.reminders || [],
        attachments: task.attachments || [],
        files: task.attachments || [] // Compatibility with file-based system
      }
    })
  }

  async getTask(id: string) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        tags:task_tags(tag:tags(*)),
        reminders(*),
        attachments(*),
        assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, email, profile_color, profile_memoji)
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // Construct assignee info from joined profile data
    let assigneeName: string | null = null
    let assigneeColor: string | null = null
    let assigneeInitial: string | null = null
    let assigneeMemoji: string | null = null
    if (data.assignee) {
      const firstName = data.assignee.first_name || ''
      const lastName = data.assignee.last_name || ''
      assigneeName = `${firstName} ${lastName}`.trim() || data.assignee.email || null
      assigneeColor = data.assignee.profile_color || null
      assigneeInitial = firstName ? firstName.charAt(0).toUpperCase() : (data.assignee.email ? data.assignee.email.charAt(0).toUpperCase() : null)
      assigneeMemoji = data.assignee.profile_memoji || null
    }

    // Transform the data to match the expected format
    return {
      ...data,
      // Map snake_case to camelCase for frontend compatibility
      projectId: data.project_id,
      dueDate: data.due_date,
      dueTime: data.due_time,
      parentId: data.parent_id,
      assignedTo: data.assigned_to,
      assignedToName: assigneeName,
      assignedToColor: assigneeColor,
      assignedToInitial: assigneeInitial,
      assignedToMemoji: assigneeMemoji,
      completedAt: data.completed_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      todoistId: data.todoist_id,
      recurringPattern: data.recurring_pattern,
      orderIndex: data.order_index,
      tags: data.tags?.map((t: any) => t.tag.id) || [],
      reminders: data.reminders || [],
      attachments: data.attachments || [],
      files: data.attachments || []
    }
  }

  async createTask(task: any) {
    const supabase = this.supabase
    // Extract tags, reminders, and attachments
    const { tags, reminders, attachments, ...taskData } = task

    // Create the task
    const { data: newTask, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) throw error

    // Add tags
    if (tags && tags.length > 0) {
      await supabase
        .from('task_tags')
        .insert(tags.map((tagId: string) => ({
          task_id: newTask.id,
          tag_id: tagId
        })))
    }

    // Add reminders
    if (reminders && reminders.length > 0) {
      await supabase
        .from('reminders')
        .insert(reminders.map((reminder: any) => ({
          ...reminder,
          task_id: newTask.id
        })))
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      await supabase
        .from('attachments')
        .insert(attachments.map((attachment: any) => ({
          ...attachment,
          task_id: newTask.id
        })))
    }

    return this.getTask(newTask.id)
  }

  async updateTask(id: string, updates: any) {
    const supabase = this.supabase
    const { tags, reminders, attachments, ...taskData } = updates

    // Update the task
    if (Object.keys(taskData).length > 0) {
      const { error } = await supabase
        .from('tasks')
        .update(taskData)
        .eq('id', id)

      if (error) throw error
    }

    // Update tags if provided
    if (tags !== undefined) {
      // Remove existing tags
      await supabase
        .from('task_tags')
        .delete()
        .eq('task_id', id)

      // Add new tags
      if (tags.length > 0) {
        await supabase
          .from('task_tags')
          .insert(tags.map((tagId: string) => ({
            task_id: id,
            tag_id: tagId
          })))
      }
    }

    // Update reminders if provided
    if (reminders !== undefined) {
      // Remove existing reminders
      await supabase
        .from('reminders')
        .delete()
        .eq('task_id', id)

      // Add new reminders
      if (reminders.length > 0) {
        await supabase
          .from('reminders')
          .insert(reminders.map((reminder: any) => ({
            ...reminder,
            task_id: id
          })))
      }
    }

    // Update attachments if provided
    if (attachments !== undefined) {
      // Remove existing attachments
      await supabase
        .from('attachments')
        .delete()
        .eq('task_id', id)

      // Add new attachments
      if (attachments.length > 0) {
        await supabase
          .from('attachments')
          .insert(attachments.map((attachment: any) => ({
            ...attachment,
            task_id: id
          })))
      }
    }

    return this.getTask(id)
  }

  async deleteTask(id: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Tags
  async getTags() {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name')

    if (error) throw error
    return data || []
  }

  async createTag(tag: any) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('tags')
      .insert(tag)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Users
  async getUser(id: string) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    
    // Map to match file-based user structure
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      profileColor: data.profile_color,
      profileMemoji: data.profile_memoji,
      animationsEnabled: data.animations_enabled,
      priorityColor: data.priority_color,
      role: data.role
    }
  }

  async updateUser(id: string, updates: any) {
    const supabase = this.supabase
    
    // Map from file-based structure to Supabase structure
    const supabaseUpdates: any = {}
    if (updates.firstName !== undefined) supabaseUpdates.first_name = updates.firstName
    if (updates.lastName !== undefined) supabaseUpdates.last_name = updates.lastName
    if (updates.profileColor !== undefined) supabaseUpdates.profile_color = updates.profileColor
    if (updates.profileMemoji !== undefined) supabaseUpdates.profile_memoji = updates.profileMemoji
    if (updates.animationsEnabled !== undefined) supabaseUpdates.animations_enabled = updates.animationsEnabled
    if (updates.priorityColor !== undefined) supabaseUpdates.priority_color = updates.priorityColor
    
    const { data, error } = await supabase
      .from('profiles')
      .update(supabaseUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    
    // Map back to file-based structure
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      profileColor: data.profile_color,
      profileMemoji: data.profile_memoji,
      animationsEnabled: data.animations_enabled,
      priorityColor: data.priority_color,
      role: data.role
    }
  }

  // Batch operations
  async batchUpdateTasks(updateItems: { id: string; updates: any }[]) {
    const results = []
    
    for (const { id, updates } of updateItems) {
      try {
        const result = await this.updateTask(id, updates)
        results.push(result)
      } catch (error) {
        console.error(`Error updating task ${id}:`, error)
      }
    }

    return results
  }

  // Time Blocks
  async getTimeBlocks(startDate?: string, endDate?: string) {
    const supabase = this.supabase
    let query = supabase
      .from('time_blocks')
      .select(`
        *,
        time_block_tasks (
          task_id,
          tasks (*)
        )
      `)
      .eq('user_id', this.userId)
      .order('start_time', { ascending: true })

    if (startDate) {
      query = query.gte('start_time', startDate)
    }
    if (endDate) {
      query = query.lte('start_time', endDate)
    }

    const { data, error } = await query

    if (error) throw error

    // Transform the data to include tasks array
    return (data || []).map((block: any) => ({
      ...block,
      tasks: block.time_block_tasks?.map((tbt: any) => tbt.tasks).filter(Boolean) || []
    }))
  }

  async getTimeBlock(id: string) {
    const supabase = this.supabase
    const { data, error } = await supabase
      .from('time_blocks')
      .select(`
        *,
        time_block_tasks (
          task_id,
          tasks (*)
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    
    return {
      ...data,
      tasks: data.time_block_tasks?.map((tbt: any) => tbt.tasks).filter(Boolean) || []
    }
  }

  async createTimeBlock(timeBlock: any) {
    const supabase = this.supabase
    const { tasks, ...blockData } = timeBlock
    
    // Create the time block
    const { data: blockResult, error: blockError } = await supabase
      .from('time_blocks')
      .insert({
        ...blockData,
        user_id: this.userId
      })
      .select()
      .single()

    if (blockError) throw blockError

    // Add task associations if provided
    if (tasks && tasks.length > 0) {
      const taskAssociations = tasks.map((taskId: string) => ({
        time_block_id: blockResult.id,
        task_id: taskId
      }))

      const { error: assocError } = await supabase
        .from('time_block_tasks')
        .insert(taskAssociations)

      if (assocError) throw assocError
    }

    return blockResult
  }

  async updateTimeBlock(id: string, updates: any) {
    const supabase = this.supabase
    const { tasks, ...blockUpdates } = updates

    // Update the time block
    const { data: blockResult, error: blockError } = await supabase
      .from('time_blocks')
      .update(blockUpdates)
      .eq('id', id)
      .select()
      .single()

    if (blockError) throw blockError

    // Update task associations if provided
    if (tasks !== undefined) {
      // Remove existing associations
      await supabase
        .from('time_block_tasks')
        .delete()
        .eq('time_block_id', id)

      // Add new associations
      if (tasks.length > 0) {
        const taskAssociations = tasks.map((taskId: string) => ({
          time_block_id: id,
          task_id: taskId
        }))

        const { error: assocError } = await supabase
          .from('time_block_tasks')
          .insert(taskAssociations)

        if (assocError) throw assocError
      }
    }

    return blockResult
  }

  async deleteTimeBlock(id: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('time_blocks')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  async addTaskToTimeBlock(timeBlockId: string, taskId: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('time_block_tasks')
      .insert({
        time_block_id: timeBlockId,
        task_id: taskId
      })

    if (error) throw error
  }

  async removeTaskFromTimeBlock(timeBlockId: string, taskId: string) {
    const supabase = this.supabase
    const { error } = await supabase
      .from('time_block_tasks')
      .delete()
      .eq('time_block_id', timeBlockId)
      .eq('task_id', taskId)

    if (error) throw error
  }
}
