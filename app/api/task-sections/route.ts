import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note: Task sections feature not yet migrated to Supabase

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Task sections not implemented in Supabase yet
    return NextResponse.json({ error: 'Task sections feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to create task-section association:', error)
    return NextResponse.json({ error: 'Failed to create association' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Task sections not implemented in Supabase yet
    return NextResponse.json({ error: 'Task sections feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to delete task-section association:', error)
    return NextResponse.json({ error: 'Failed to delete association' }, { status: 500 })
  }
}