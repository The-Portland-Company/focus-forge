import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export async function GET(
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
    const timeBlock = await adapter.getTimeBlock(params.id)
    
    if (!timeBlock) {
      return NextResponse.json({ error: 'Time block not found' }, { status: 404 })
    }
    
    return NextResponse.json(timeBlock)
  } catch (error) {
    console.error('Error fetching time block:', error)
    return NextResponse.json(
      { error: 'Failed to fetch time block' },
      { status: 500 }
    )
  }
}

export async function PATCH(
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
    const body = await request.json()
    
    const updatedBlock = await adapter.updateTimeBlock(params.id, body)
    
    return NextResponse.json(updatedBlock)
  } catch (error) {
    console.error('Error updating time block:', error)
    return NextResponse.json(
      { error: 'Failed to update time block' },
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
    await adapter.deleteTimeBlock(params.id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting time block:', error)
    return NextResponse.json(
      { error: 'Failed to delete time block' },
      { status: 500 }
    )
  }
}