import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, saveDatabase } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { taskIds, updates } = await request.json()
    
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'Task IDs array is required' }, { status: 400 })
    }
    
    const db = await getDatabase()
    const updatedTasks: any[] = []
    const failedIds: string[] = []
    
    // Update all tasks in memory first
    taskIds.forEach(taskId => {
      const taskIndex = db.tasks.findIndex(t => t.id === taskId)
      if (taskIndex !== -1) {
        db.tasks[taskIndex] = {
          ...db.tasks[taskIndex],
          ...updates,
          updatedAt: new Date().toISOString()
        }
        updatedTasks.push(db.tasks[taskIndex])
      } else {
        failedIds.push(taskId)
      }
    })
    
    // Save once with all updates
    if (updatedTasks.length > 0) {
      await saveDatabase(db)
    }
    
    return NextResponse.json({
      updated: updatedTasks,
      failed: failedIds,
      successCount: updatedTasks.length,
      failCount: failedIds.length
    })
  } catch (error) {
    console.error('Batch update error:', error)
    return NextResponse.json({ error: 'Failed to batch update tasks' }, { status: 500 })
  }
}