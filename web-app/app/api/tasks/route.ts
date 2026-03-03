import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id)
    const tasks = await adapter.getTasks()
    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Failed to get tasks:', error)
    return NextResponse.json({ error: 'Failed to get tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const taskData = await request.json()
    
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
    
    // Add the creator ID to the task data
    const taskDataWithCreator = {
      ...taskData,
      createdBy: dbUser.id
    }
    
    const newTask = await adapter.createTask(taskDataWithCreator)
    return NextResponse.json(newTask)
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
