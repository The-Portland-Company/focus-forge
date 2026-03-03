import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const resolved = searchParams.get('resolved') === 'true'

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let query = supabase
      .from('todoist_sync_conflicts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (resolved) {
      query = query.not('resolved_at', 'is', null)
    } else {
      query = query.is('resolved_at', null)
    }

    const { data: conflicts, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      conflicts: conflicts || [],
      count: conflicts?.length || 0
    })

  } catch (error) {
    console.error('Failed to fetch conflicts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conflicts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { conflictId, resolution, userId } = await request.json()

    if (!conflictId || !resolution || !userId) {
      return NextResponse.json(
        { error: 'Conflict ID, resolution, and user ID are required' },
        { status: 400 }
      )
    }

    const validResolutions = ['local_wins', 'todoist_wins', 'manual', 'merged']
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { error: 'Invalid resolution strategy' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the conflict
    const { data: conflict, error: fetchError } = await supabase
      .from('todoist_sync_conflicts')
      .select('*')
      .eq('id', conflictId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !conflict) {
      return NextResponse.json(
        { error: 'Conflict not found' },
        { status: 404 }
      )
    }

    // Apply resolution
    let resolutionData = {}
    
    if (resolution === 'local_wins') {
      // Keep local data, ignore Todoist changes
      resolutionData = conflict.local_data
    } else if (resolution === 'todoist_wins') {
      // Apply Todoist data to local
      resolutionData = conflict.todoist_data
      
      // Update the actual resource
      if (conflict.resource_type === 'task') {
        await supabase
          .from('tasks')
          .update(conflict.todoist_data)
          .eq('id', conflict.resource_id)
      } else if (conflict.resource_type === 'project') {
        await supabase
          .from('projects')
          .update(conflict.todoist_data)
          .eq('id', conflict.resource_id)
      }
    } else if (resolution === 'merged') {
      // Merge both datasets (prefer more recent non-null values)
      resolutionData = {
        ...conflict.todoist_data,
        ...conflict.local_data,
        // Keep the most recent update
        updated_at: new Date().toISOString()
      }
      
      // Update the resource with merged data
      if (conflict.resource_type === 'task') {
        await supabase
          .from('tasks')
          .update(resolutionData)
          .eq('id', conflict.resource_id)
      } else if (conflict.resource_type === 'project') {
        await supabase
          .from('projects')
          .update(resolutionData)
          .eq('id', conflict.resource_id)
      }
    }

    // Mark conflict as resolved
    const { error: updateError } = await supabase
      .from('todoist_sync_conflicts')
      .update({
        resolution_strategy: resolution,
        resolution_data: resolutionData,
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', conflictId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: 'Conflict resolved successfully',
      resolution: resolution
    })

  } catch (error) {
    console.error('Failed to resolve conflict:', error)
    return NextResponse.json(
      { error: 'Failed to resolve conflict' },
      { status: 500 }
    )
  }
}