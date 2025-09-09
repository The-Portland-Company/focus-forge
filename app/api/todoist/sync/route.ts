import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TodoistSyncService } from '@/lib/services/todoist-sync'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { userId, syncType = 'incremental' } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user's Todoist API token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('todoist_api_token, todoist_sync_enabled')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    if (!profile.todoist_api_token) {
      return NextResponse.json(
        { error: 'Todoist not connected. Please connect your Todoist account first.' },
        { status: 400 }
      )
    }

    if (!profile.todoist_sync_enabled) {
      return NextResponse.json(
        { error: 'Todoist sync is disabled for this account' },
        { status: 400 }
      )
    }

    // Check if another sync is already running
    const { data: syncState } = await supabase
      .from('todoist_sync_state')
      .select('sync_status')
      .eq('user_id', userId)
      .single()

    if (syncState?.sync_status === 'syncing') {
      return NextResponse.json(
        { error: 'A sync is already in progress' },
        { status: 409 }
      )
    }

    // Check rate limits
    const { data: recentCalls } = await supabase
      .from('todoist_api_calls')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

    if (recentCalls && recentCalls.length >= 450) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429 }
      )
    }

    // Initialize sync service
    const syncService = new TodoistSyncService(
      profile.todoist_api_token,
      supabase,
      userId
    )

    // Perform sync based on type
    let result
    if (syncType === 'full' || !syncState?.sync_token) {
      result = await syncService.initialImport()
    } else {
      result = await syncService.incrementalSync()
    }

    // Log API call
    await supabase
      .from('todoist_api_calls')
      .insert({
        user_id: userId,
        endpoint: '/sync',
        method: 'POST',
        status_code: result.success ? 200 : 500,
        response_time_ms: Date.now(),
        error_message: result.errors.join(', ') || null
      })

    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Sync failed',
          details: result.errors,
          partial: result
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      result: {
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsDeleted: result.itemsDeleted,
        projectsCreated: result.projectsCreated,
        projectsUpdated: result.projectsUpdated,
        projectsDeleted: result.projectsDeleted,
        conflictsFound: result.conflictsFound,
        conflictsResolved: result.conflictsResolved,
        syncToken: result.syncToken
      },
      message: `Sync completed successfully`
    })

  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    )
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get sync state
    const { data: syncState, error: stateError } = await supabase
      .from('todoist_sync_state')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (stateError || !syncState) {
      return NextResponse.json({
        connected: false,
        syncStatus: 'not_connected',
        message: 'Todoist not connected'
      })
    }

    // Get recent sync history
    const { data: syncHistory } = await supabase
      .from('todoist_sync_history')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(10)

    // Get unresolved conflicts count
    const { data: conflicts } = await supabase
      .from('todoist_sync_conflicts')
      .select('id')
      .eq('user_id', userId)
      .is('resolved_at', null)

    // Get profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('todoist_sync_enabled, todoist_auto_sync, todoist_sync_frequency, todoist_premium')
      .eq('id', userId)
      .single()

    return NextResponse.json({
      connected: true,
      syncState: {
        status: syncState.sync_status,
        lastSyncAt: syncState.last_sync_at,
        nextSyncAt: syncState.next_sync_at,
        errorMessage: syncState.error_message,
        errorCount: syncState.error_count,
        consecutiveFailures: syncState.consecutive_failures
      },
      syncSettings: {
        enabled: profile?.todoist_sync_enabled || false,
        autoSync: profile?.todoist_auto_sync || false,
        frequency: profile?.todoist_sync_frequency || 5,
        isPremium: profile?.todoist_premium || false
      },
      recentSyncs: syncHistory || [],
      unresolvedConflicts: conflicts?.length || 0
    })

  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}