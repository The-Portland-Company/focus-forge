import { NextRequest, NextResponse } from 'next/server'
import { syncScheduler } from '@/lib/services/sync-scheduler'

// This endpoint is called to manage the sync scheduler
export async function POST(request: NextRequest) {
  try {
    const { action, userId } = await request.json()

    switch (action) {
      case 'start-all':
        await syncScheduler.startAll()
        return NextResponse.json({ 
          success: true, 
          message: 'Sync scheduler started for all users' 
        })

      case 'stop-all':
        syncScheduler.stopAll()
        return NextResponse.json({ 
          success: true, 
          message: 'Sync scheduler stopped for all users' 
        })

      case 'update-user':
        if (!userId) {
          return NextResponse.json(
            { error: 'User ID required for update action' },
            { status: 400 }
          )
        }
        await syncScheduler.handleUserUpdate(userId)
        return NextResponse.json({ 
          success: true, 
          message: `Sync scheduler updated for user ${userId}` 
        })

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Scheduler error:', error)
    return NextResponse.json(
      { error: 'Failed to manage sync scheduler' },
      { status: 500 }
    )
  }
}

// Initialize scheduler on app start (this is called by the app initialization)
export async function GET(request: NextRequest) {
  try {
    // Start the scheduler for all users
    await syncScheduler.startAll()
    
    return NextResponse.json({
      success: true,
      message: 'Sync scheduler initialized'
    })
  } catch (error) {
    console.error('Failed to initialize scheduler:', error)
    return NextResponse.json(
      { error: 'Failed to initialize sync scheduler' },
      { status: 500 }
    )
  }
}