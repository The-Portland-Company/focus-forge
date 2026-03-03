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
    let organizations = []
    let projects = []
    let tasks = []
    let tags = []
    let userProfile = null
    
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
    
    // Get all organization members using the user_organizations join table
    const organizationMemberIds = new Set<string>()
    const orgIds = organizations.map((org: { id: string }) => org.id)

    if (orgIds.length > 0) {
      try {
        // Fetch all members from user_organizations for these orgs
        const { data: userOrgs, error: userOrgsError } = await supabase
          .from('user_organizations')
          .select('user_id')
          .in('organization_id', orgIds)

        if (!userOrgsError && userOrgs) {
          userOrgs.forEach(uo => organizationMemberIds.add(uo.user_id))
        }
      } catch (error) {
        console.error('Error fetching user_organizations:', error)
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
      organizations,
      projects,
      tasks,
      tags,
      sections: [],
      reminders: [],
      userSectionPreferences: [],
      settings: { showCompletedTasks: true },
      taskSections: []
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
