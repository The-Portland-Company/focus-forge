import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, user.id)
    const { taskId } = await request.json()
    
    await adapter.addTaskToTimeBlock(params.id, taskId)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding task to time block:', error)
    return NextResponse.json(
      { error: 'Failed to add task to time block' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, user.id)
    const { taskId } = await request.json()
    
    await adapter.removeTaskFromTimeBlock(params.id, taskId)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing task from time block:', error)
    return NextResponse.json(
      { error: 'Failed to remove task from time block' },
      { status: 500 }
    )
  }
}