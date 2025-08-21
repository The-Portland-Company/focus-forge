import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export async function POST(request: NextRequest) {
  try {
    const projectData = await request.json()
    
    // Get the Supabase client and authenticated user
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    
    // Get the database user profile
    const dbUser = await adapter.getUser(session.user.id)
    
    if (!dbUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }
    
    // Add the owner ID to the project data
    const projectDataWithOwner = {
      ...projectData,
      ownerId: dbUser.id
    }
    
    const newProject = await adapter.createProject(projectDataWithOwner)
    return NextResponse.json(newProject)
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}