import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, user.id)
    
    // Get query parameters for date range
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    const timeBlocks = await adapter.getTimeBlocks(startDate || undefined, endDate || undefined)
    
    return NextResponse.json({ timeBlocks })
  } catch (error) {
    console.error('Error fetching time blocks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch time blocks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adapter = new SupabaseAdapter(supabase, user.id)
    const body = await request.json()
    
    const timeBlock = await adapter.createTimeBlock({
      startTime: body.startTime,
      endTime: body.endTime,
      title: body.title,
      description: body.description,
      organizationId: body.organizationId,
      tasks: body.tasks || []
    })
    
    return NextResponse.json(timeBlock)
  } catch (error) {
    console.error('Error creating time block:', error)
    return NextResponse.json(
      { error: 'Failed to create time block' },
      { status: 500 }
    )
  }
}