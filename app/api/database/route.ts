import { NextResponse } from 'next/server'
import { getDatabaseAdapter } from '@/lib/db/factory'

export async function GET() {
  try {
    const adapter = getDatabaseAdapter()
    
    console.log('Database adapter type:', adapter.constructor.name)
    
    // If it's a file adapter, use the old method without authentication
    if (adapter.constructor.name === 'FileAdapter' && adapter.getDatabase) {
      console.log('Using file adapter - no authentication required')
      const database = await adapter.getDatabase()
      return NextResponse.json(database)
    }
    
    console.log('Using Supabase adapter')
    
    // For Supabase adapter, we need to fetch data differently
    // Check if user is authenticated first
    // Lazy load the Supabase client only when needed
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    
    // First try to get the session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('Session check - Session exists:', !!session, 'User:', session?.user?.email, 'Error:', sessionError?.message)
    
    // Then get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('Auth check - User:', user?.email, 'Error:', authError?.message)
    
    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: 'Authentication error', details: authError.message }, { status: 401 })
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - No user found' }, { status: 401 })
    }
    
    // Fetch all data using the adapter methods with individual error handling
    let organizations = []
    let projects = []
    let tasks = []
    let tags = []
    let userProfile = null
    
    try {
      organizations = await adapter.getOrganizations()
    } catch (error) {
      console.error('Error fetching organizations:', error)
    }
    
    try {
      projects = await adapter.getProjects()
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
    
    try {
      tasks = await adapter.getTasks()
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
    
    try {
      tags = await adapter.getTags()
    } catch (error) {
      console.error('Error fetching tags:', error)
    }
    
    try {
      userProfile = await adapter.getUser(user.id)
    } catch (error) {
      console.error('Error fetching user profile:', error)
      // Create a minimal user profile if fetch fails
      userProfile = {
        id: user.id,
        email: user.email || '',
        firstName: '',
        lastName: ''
      }
    }
    
    // Return data in the expected format
    return NextResponse.json({
      users: [userProfile], // Only return current user for privacy
      organizations,
      projects,
      tasks,
      tags,
      settings: {
        showCompletedTasks: true // Default setting
      }
    })
  } catch (error) {
    console.error('Database fetch error:', error)
    // Return more detailed error information for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = {
      error: 'Failed to fetch database',
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    }
    console.error('Detailed error:', errorDetails)
    return NextResponse.json({ error: 'Failed to fetch database', details: errorMessage }, { status: 500 })
  }
}