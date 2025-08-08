import { createClient } from '@/lib/supabase/server'
import { Database, DatabaseAdapter } from './types'

export class SupabaseAdapter implements DatabaseAdapter {
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
    const supabase = await createClient()
    
    // First get the user to check if they're a super admin
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return []
    }
    
    // Check if user is super admin by querying profiles directly
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    console.log('User profile check:', { userId: user.id, role: profile?.role, error: profileError })
    
    // For super admins, we need to bypass RLS entirely
    if (profile?.role === 'super_admin') {
      // Use service role client to bypass RLS for super admin
      const { createServiceClient } = require('@/lib/supabase/server')
      const serviceSupabase = await createServiceClient()
      
      const { data, error } = await serviceSupabase
        .from('organizations')
        .select('*')
        .order('order_index')
      
      console.log('Super admin organizations query:', { count: data?.length, error })
      
      if (error) {
        console.error('Error fetching organizations for super admin:', error)
        throw error
      }
      
      return data || []
    }
    
    // For regular users, get their organizations
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
    
    console.log('User organizations:', { userId: user.id, count: userOrgs?.length, error: userOrgsError })
    
    const orgIds = userOrgs?.map(uo => uo.organization_id) || []
    
    if (orgIds.length === 0) {
      return []
    }
    
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .order('order_index')

    if (error) {
      console.error('Error fetching organizations:', error)
      throw error
    }
    
    return data || []
  }

  async getOrganization(id: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  async createOrganization(org: any) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organizations')
      .insert(org)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateOrganization(id: string, updates: any) {
    const supabase = await createClient()
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
    const supabase = await createClient()
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Projects
  async getProjects(organizationId?: string) {
    const supabase = await createClient()
    let query = supabase
      .from('projects')
      .select('*')
      .order('order_index')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  async getProject(id: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  async createProject(project: any) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateProject(id: string, updates: any) {
    const supabase = await createClient()
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
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Tasks
  async getTasks(projectId?: string) {
    const supabase = await createClient()
    let query = supabase
      .from('tasks')
      .select(`
        *,
        tags:task_tags(tag:tags(*)),
        reminders(*),
        attachments(*)
      `)
      .order('created_at')

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
    if (error) throw error

    // Transform the data to match the expected format
    return (data || []).map((task: any) => ({
      ...task,
      tags: task.tags?.map((t: any) => t.tag.id) || [],
      reminders: task.reminders || [],
      attachments: task.attachments || [],
      files: task.attachments || [] // Compatibility with file-based system
    }))
  }

  async getTask(id: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        tags:task_tags(tag:tags(*)),
        reminders(*),
        attachments(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // Transform the data to match the expected format
    return {
      ...data,
      tags: data.tags?.map((t: any) => t.tag.id) || [],
      reminders: data.reminders || [],
      attachments: data.attachments || [],
      files: data.attachments || []
    }
  }

  async createTask(task: any) {
    const supabase = await createClient()
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
    const supabase = await createClient()
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
    const supabase = await createClient()
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Tags
  async getTags() {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name')

    if (error) throw error
    return data || []
  }

  async createTag(tag: any) {
    const supabase = await createClient()
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
    const supabase = await createClient()
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
      animationsEnabled: data.animations_enabled,
      role: data.role
    }
  }

  async updateUser(id: string, updates: any) {
    const supabase = await createClient()
    
    // Map from file-based structure to Supabase structure
    const supabaseUpdates: any = {}
    if (updates.firstName !== undefined) supabaseUpdates.first_name = updates.firstName
    if (updates.lastName !== undefined) supabaseUpdates.last_name = updates.lastName
    if (updates.profileColor !== undefined) supabaseUpdates.profile_color = updates.profileColor
    if (updates.animationsEnabled !== undefined) supabaseUpdates.animations_enabled = updates.animationsEnabled
    
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
      animationsEnabled: data.animations_enabled,
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
}