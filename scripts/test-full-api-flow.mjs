#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

// Mimic the exact SupabaseAdapter implementation
class SupabaseAdapter {
  constructor(supabase, userId) {
    this.supabase = supabase
    this.userId = userId
    console.log('🔧 SupabaseAdapter initialized with userId:', userId)
  }

  async getOrganizations(userId) {
    const supabase = this.supabase
    const targetUserId = userId || this.userId
    
    console.log('🔍 Getting organizations for user:', targetUserId)
    
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', targetUserId)
    
    if (userOrgsError) {
      console.error('❌ Error fetching user organizations:', userOrgsError)
      return []
    }
    
    if (!userOrgs || userOrgs.length === 0) {
      console.log('No organizations found for user')
      return []
    }
    
    const orgIds = userOrgs.map(uo => uo.organization_id)
    
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

  async getProjects(organizationId) {
    const supabase = this.supabase
    
    if (!organizationId) {
      const orgs = await this.getOrganizations()
      const orgIds = orgs.map(o => o.id)
      
      if (orgIds.length === 0) {
        return []
      }
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .in('organization_id', orgIds)
        .order('order_index')
      
      if (error) throw error
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

  async getTasks(projectId) {
    const supabase = this.supabase
    let query = supabase
      .from('tasks')
      .select(`
        *,
        tags:task_tags(tag:tags(*)),
        reminders(*),
        attachments(*)
      `)
      .or(`assigned_to.eq.${this.userId},assigned_to.is.null`)
      .order('created_at')

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error in getTasks:', error)
      throw error
    }

    // Transform the data to match the expected format
    return (data || []).map((task) => ({
      ...task,
      tags: task.tags?.map((t) => t.tag.id) || [],
      reminders: task.reminders || [],
      attachments: task.attachments || [],
      files: task.attachments || []
    }))
  }
}

async function test() {
  const userId = 'f7c172d9-f2de-43a0-a984-8f6b7b17c70d' // Spencer's ID
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  
  console.log('Testing full API flow as it would run...\n')
  
  const adapter = new SupabaseAdapter(supabase, userId)
  
  let organizations = []
  let projects = []
  let tasks = []
  
  try {
    // Get organizations
    console.log('1️⃣ Fetching organizations...')
    organizations = await adapter.getOrganizations()
    console.log('   ✅ Organizations:', organizations.length)
    
    // Get projects
    console.log('\n2️⃣ Fetching projects...')
    projects = await adapter.getProjects()
    console.log('   ✅ Projects:', projects.length)
    console.log('   First 3 projects:')
    projects.slice(0, 3).forEach(p => {
      console.log(`     - ${p.name} (org: ${p.organization_id})`)
    })
    
    // Get tasks
    console.log('\n3️⃣ Fetching tasks...')
    tasks = await adapter.getTasks()
    console.log('   ✅ Tasks:', tasks.length)
    console.log('   First 5 tasks:')
    tasks.slice(0, 5).forEach(t => {
      console.log(`     - ${t.name?.substring(0, 50)}... (due: ${t.due_date || 'none'})`)
    })
    
    // Check tasks for specific projects
    console.log('\n4️⃣ Checking tasks for specific projects:')
    for (const project of projects.slice(0, 3)) {
      const projectTasks = await adapter.getTasks(project.id)
      console.log(`   Project "${project.name}": ${projectTasks.length} tasks`)
    }
    
    // Check today tasks
    console.log('\n5️⃣ Checking today tasks:')
    const today = new Date().toISOString().split('T')[0]
    const todayTasks = tasks.filter(t => t.due_date === today)
    console.log(`   Tasks due today: ${todayTasks.length}`)
    
    // Check overdue tasks
    const overdueTasks = tasks.filter(t => 
      t.due_date && 
      t.due_date < today && 
      !t.completed
    )
    console.log(`   Overdue tasks: ${overdueTasks.length}`)
    
  } catch (error) {
    console.error('❌ Error in test:', error)
  }
  
  console.log('\n📊 Final counts:')
  console.log('   Organizations:', organizations.length)
  console.log('   Projects:', projects.length)
  console.log('   Tasks:', tasks.length)
}

test()