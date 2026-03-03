import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TodoistClient } from '@/lib/services/todoist-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { apiToken, userId } = await request.json()
    const trimmedToken = typeof apiToken === 'string' ? apiToken.trim() : apiToken

    if (!trimmedToken || !userId) {
      return NextResponse.json(
        { error: 'API token and user ID are required' },
        { status: 400 }
      )
    }

    // Initialize Todoist client to validate token
    const todoistClient = new TodoistClient(trimmedToken)
    
    // Test the token and get user info
    let todoistUserInfo
    try {
      todoistUserInfo = await todoistClient.getUserInfo()
      if (!todoistUserInfo) {
        throw new Error('Invalid API token')
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid Todoist API token' },
        { status: 401 }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if user is already connected to a different Todoist account
    const { data: existingConnection } = await supabase
      .from('profiles')
      .select('todoist_user_id')
      .eq('id', userId)
      .single()

    if (existingConnection?.todoist_user_id && 
        existingConnection.todoist_user_id !== todoistUserInfo.id) {
      return NextResponse.json(
        { 
          error: 'This account is already connected to a different Todoist account',
          existingTodoistId: existingConnection.todoist_user_id 
        },
        { status: 409 }
      )
    }

    // Update user profile with Todoist connection info
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        todoist_api_token: trimmedToken,
        todoist_user_id: todoistUserInfo.id,
        todoist_email: todoistUserInfo.email,
        todoist_full_name: todoistUserInfo.full_name,
        todoist_timezone: todoistUserInfo.timezone,
        todoist_start_page: todoistUserInfo.start_page,
        todoist_start_day: todoistUserInfo.start_day,
        todoist_karma: todoistUserInfo.karma,
        todoist_karma_trend: todoistUserInfo.karma_trend,
        todoist_premium: todoistUserInfo.is_premium,
        todoist_sync_enabled: true,
        todoist_auto_sync: true,
        todoist_sync_frequency: 5
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to update profile:', updateError)
      return NextResponse.json(
        { error: 'Failed to save Todoist connection' },
        { status: 500 }
      )
    }

    // Initialize sync state
    const { data: existingSyncState } = await supabase
      .from('todoist_sync_state')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!existingSyncState) {
      await supabase
        .from('todoist_sync_state')
        .insert({
          user_id: userId,
          sync_status: 'idle',
          error_count: 0,
          consecutive_failures: 0
        })
    }

    return NextResponse.json({
      success: true,
      todoistUser: {
        id: todoistUserInfo.id,
        email: todoistUserInfo.email,
        fullName: todoistUserInfo.full_name,
        isPremium: todoistUserInfo.is_premium,
        karma: todoistUserInfo.karma
      },
      message: 'Successfully connected to Todoist'
    })

  } catch (error) {
    console.error('Todoist connection error:', error)
    return NextResponse.json(
      { error: 'Failed to connect to Todoist' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId, keepData } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (!keepData) {
      // Create backup before deletion
      await supabase
        .from('todoist_import_backup')
        .insert({
          user_id: userId,
          backup_type: 'pre_disconnect',
          data: await getBackupData(supabase, userId),
          created_at: new Date().toISOString()
        })

      // Delete all Todoist-synced data
      await supabase
        .from('tasks')
        .delete()
        .not('todoist_id', 'is', null)

      await supabase
        .from('projects')
        .delete()
        .not('todoist_id', 'is', null)

      await supabase
        .from('comments')
        .delete()
        .not('todoist_id', 'is', null)

      await supabase
        .from('sections')
        .delete()
        .not('todoist_id', 'is', null)
    } else {
      // Just remove Todoist IDs to disconnect
      await supabase
        .from('tasks')
        .update({ 
          todoist_id: null,
          todoist_sync_token: null,
          last_todoist_sync: null
        })
        .not('todoist_id', 'is', null)

      await supabase
        .from('projects')
        .update({ 
          todoist_id: null,
          todoist_sync_token: null,
          last_todoist_sync: null
        })
        .not('todoist_id', 'is', null)
    }

    // Clear Todoist connection from profile
    await supabase
      .from('profiles')
      .update({
        todoist_api_token: null,
        todoist_user_id: null,
        todoist_email: null,
        todoist_full_name: null,
        todoist_timezone: null,
        todoist_sync_enabled: false,
        todoist_auto_sync: false
      })
      .eq('id', userId)

    // Clear sync state
    await supabase
      .from('todoist_sync_state')
      .delete()
      .eq('user_id', userId)

    return NextResponse.json({
      success: true,
      message: 'Successfully disconnected from Todoist',
      dataKept: keepData
    })

  } catch (error) {
    console.error('Todoist disconnection error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect from Todoist' },
      { status: 500 }
    )
  }
}

async function getBackupData(supabase: any, userId: string) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .not('todoist_id', 'is', null)

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .not('todoist_id', 'is', null)

  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('user_id', userId)

  return {
    tasks,
    projects,
    comments,
    timestamp: new Date().toISOString()
  }
}
