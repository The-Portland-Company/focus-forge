import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { taskIds, updates } = await request.json()
    
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'Task IDs array is required' }, { status: 400 })
    }
    
    const supabase = await createClient()
    const updatedTasks: any[] = []
    const failedIds: string[] = []
    
    // Convert camelCase to snake_case for database fields
    const dbUpdates: any = {}
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate
    if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId
    
    // Add updated_at timestamp
    dbUpdates.updated_at = new Date().toISOString()
    
    // Update all tasks in a single query using the IN operator
    const { data, error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .in('id', taskIds)
      .select()
    
    if (error) {
      console.error('Batch update error:', error)
      return NextResponse.json({ 
        error: 'Failed to batch update tasks',
        details: error.message 
      }, { status: 500 })
    }
    
    // Determine which IDs succeeded and which failed
    const successIds = data ? data.map(task => task.id) : []
    taskIds.forEach(id => {
      if (successIds.includes(id)) {
        const task = data?.find(t => t.id === id)
        if (task) updatedTasks.push(task)
      } else {
        failedIds.push(id)
      }
    })
    
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