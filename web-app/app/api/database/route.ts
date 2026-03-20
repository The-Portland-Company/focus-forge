import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    // Check authentication first
    const authClient = await createClient()
    const { data: { session }, error: authError } = await authClient.auth.getSession()
    
    console.log('🔍 Database API - Auth check:', { 
      hasSession: !!session, 
      userId: session?.user?.id, 
      email: session?.user?.email,
      authError: authError?.message 
    })
    
    if (authError || !session?.user) {
      console.error('❌ Auth error in database route:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Use service role client to bypass RLS issues with user_organizations table
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // Test the supabase client directly
    const { data: testOrgs, error: testError } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .limit(1)
    
    console.log('🔍 Direct Supabase test query:', { 
      testOrgs, 
      testError,
      userId: session.user.id 
    })
    
    // Initialize the Supabase adapter with service client
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    
    // Fetch all data from Supabase
    let organizations: any[] = []
    let projects: any[] = []
    let tasks: any[] = []
    let tags: any[] = []
    let sections: any[] = []
    let taskSections: any[] = []
    let userProfile: any = null
    const orgMemberMap = new Map<string, string[]>()
    const orgOwnerMap = new Map<string, string>()
    const projectMemberMap = new Map<string, string[]>()
    const projectOwnerMap = new Map<string, string>()
    
    try {
      console.log('📝 Fetching organizations for user:', session.user.id)
      organizations = await adapter.getOrganizations()
      console.log('✅ Organizations fetched:', organizations.length)
    } catch (error) {
      console.error('❌ Error fetching organizations:', error)
      console.error('Full error details:', JSON.stringify(error, null, 2))
    }
    
    try {
      console.log('📝 Fetching projects...')
      projects = await adapter.getProjects()
      console.log('✅ Projects fetched:', projects.length)
    } catch (error) {
      console.error('❌ Error fetching projects:', error)
      console.error('Full error details:', JSON.stringify(error, null, 2))
    }
    
    try {
      console.log('📝 Fetching tasks...')
      tasks = await adapter.getTasks()
      console.log('✅ Tasks fetched:', tasks.length)
    } catch (error) {
      console.error('❌ Error fetching tasks:', error)
      console.error('Full error details:', JSON.stringify(error, null, 2))
    }
    
    try {
      tags = await adapter.getTags()
    } catch (error) {
      console.error('Error fetching tags:', error)
    }

    try {
      const projectIds = projects.map((project: any) => project.id).filter(Boolean)
      if (projectIds.length > 0) {
        const { data: sectionRows, error: sectionsError } = await supabase
          .from('sections')
          .select('*')
          .in('project_id', projectIds)
          .order('todoist_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (sectionsError) {
          console.error('Error fetching sections:', sectionsError)
        } else {
          sections = (sectionRows || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            projectId: row.project_id,
            parentId: row.parent_id || undefined,
            color: row.color || undefined,
            description: row.description || undefined,
            icon: row.icon || undefined,
            order: row.order_index ?? row.todoist_order ?? 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            todoistId: row.todoist_id || undefined,
            todoistOrder: row.todoist_order ?? undefined,
            todoistCollapsed: row.todoist_collapsed ?? undefined,
          }))
        }
      }
    } catch (error) {
      console.error('Error mapping sections:', error)
    }

    try {
      const taskIds = tasks.map((task: any) => task.id).filter(Boolean)
      if (taskIds.length > 0) {
        const { data: taskSectionRows, error: taskSectionsError } = await supabase
          .from('task_sections')
          .select('*')
          .in('task_id', taskIds)
          .order('created_at', { ascending: true })

        if (taskSectionsError) {
          console.error('Error fetching task_sections:', taskSectionsError)
        } else {
          taskSections = (taskSectionRows || []).map((row: any) => ({
            id: row.id,
            taskId: row.task_id,
            sectionId: row.section_id,
            createdAt: row.created_at,
          }))
        }
      }
    } catch (error) {
      console.error('Error mapping task_sections:', error)
    }
    
    try {
      userProfile = await adapter.getUser(session.user.id)
    } catch (error) {
      console.error('Error fetching user profile:', error)
      // Create a minimal user profile if fetch fails
      userProfile = {
        id: session.user.id,
        email: session.user.email || '',
        firstName: '',
        lastName: '',
        name: session.user.email?.split('@')[0] || 'User',
        profileColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        profileMemoji: null,
        animationsEnabled: true,
        priorityColor: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }
    
    const organizationMemberIds = new Set<string>()
    const orgIds = organizations.map((org: { id: string }) => org.id)

    if (orgIds.length > 0) {
      try {
        const { data: userOrgs, error: userOrgsError } = await supabase
          .from('user_organizations')
          .select('user_id,organization_id,is_owner')
          .in('organization_id', orgIds)

        if (!userOrgsError && userOrgs) {
          userOrgs.forEach((uo: any) => {
            organizationMemberIds.add(uo.user_id)
            if (!uo.organization_id) return
            const memberIds = orgMemberMap.get(uo.organization_id) || []
            if (!memberIds.includes(uo.user_id)) {
              memberIds.push(uo.user_id)
            }
            orgMemberMap.set(uo.organization_id, memberIds)
            if (uo.is_owner && !orgOwnerMap.has(uo.organization_id)) {
              orgOwnerMap.set(uo.organization_id, uo.user_id)
            }
          })
        }
      } catch (error) {
        console.error('Error fetching user_organizations:', error)
      }
    }

    const projectIds = projects.map((project: any) => project.id).filter(Boolean)
    if (projectIds.length > 0) {
      try {
        const { data: userProjects, error: userProjectsError } = await (supabase as any)
          .from('user_projects')
          .select('user_id,project_id,is_owner')
          .in('project_id', projectIds)

        if (!userProjectsError && userProjects) {
          userProjects.forEach((row: any) => {
            organizationMemberIds.add(row.user_id)
            if (!row.project_id) return
            const memberIds = projectMemberMap.get(row.project_id) || []
            if (!memberIds.includes(row.user_id)) {
              memberIds.push(row.user_id)
            }
            projectMemberMap.set(row.project_id, memberIds)
            if (row.is_owner && !projectOwnerMap.has(row.project_id)) {
              projectOwnerMap.set(row.project_id, row.user_id)
            }
          })
        }
      } catch (error) {
        console.error('Error fetching user_projects:', error)
      }
    }

    // Fetch all organization members from Supabase
    let organizationUsers: Array<Record<string, any>> = []
    if (organizationMemberIds.size > 0) {
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(organizationMemberIds))

        if (!error && profiles) {
          organizationUsers = profiles.map(profile => ({
            id: profile.id,
            email: profile.email || '',
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            name: profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
            profileColor: profile.profile_color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            profileMemoji: profile.profile_memoji || null,
            animationsEnabled: profile.animations_enabled ?? true,
            priorityColor: profile.priority_color || null,
            status: profile.status || 'active',
            createdAt: profile.created_at,
            updatedAt: profile.updated_at
          }))
        }
      } catch (error) {
        console.error('Error fetching organization members:', error)
      }
    }
    
    // Include the current user if not already in the list
    if (!organizationUsers.find(u => u.id === session.user.id) && userProfile) {
      organizationUsers.push(userProfile)
    }

    // Ensure the current user is always first in the list
    const currentUserIndex = organizationUsers.findIndex(u => u.id === session.user.id)
    if (currentUserIndex > 0) {
      const currentUser = organizationUsers.splice(currentUserIndex, 1)[0]
      organizationUsers.unshift(currentUser)
    }

    return NextResponse.json({
      users: organizationUsers,
      organizations: organizations.map((org: any) => ({
        ...org,
        memberIds: orgMemberMap.get(org.id) || [],
        ownerId: orgOwnerMap.get(org.id) || org.owner_id || null,
      })),
      projects: projects.map((project: any) => ({
        ...project,
        memberIds: projectMemberMap.get(project.id) || [],
        ownerId: projectOwnerMap.get(project.id) || project.owner_id || null,
      })),
      tasks,
      tags,
      sections,
      reminders: [],
      userSectionPreferences: [],
      settings: { showCompletedTasks: true },
      taskSections
    })
    
  } catch (error) {
    console.error('Database API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    
    // Handle different types of data updates
    if (body.organizations) {
      // Update organizations
      // Implementation would go here
    }
    
    if (body.projects) {
      // Update projects
      // Implementation would go here
    }
    
    if (body.tasks) {
      // Update tasks
      // Implementation would go here
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Database POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
