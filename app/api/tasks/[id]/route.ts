import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const supabase = await createClient()
    
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json(task)
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to get task' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const updates = await request.json()
    const supabase = await createClient()
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session?.user) {
      console.error('PUT /api/tasks/[id] auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const user = session.user
    
    // Filter updates to only include valid database fields
    const dbUpdates: any = {}
    if (updates.due_date !== undefined) {
      dbUpdates.due_date = updates.due_date
    }
    if (updates.dueDate !== undefined) {
      dbUpdates.due_date = updates.dueDate
    }
    if (updates.due_time !== undefined) dbUpdates.due_time = updates.due_time
    if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed
    if (updates.completed_at !== undefined) dbUpdates.completed_at = updates.completed_at
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt
    if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo
    if (updates.project_id !== undefined) dbUpdates.project_id = updates.project_id
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.description !== undefined) dbUpdates.description = updates.description
    if (updates.order !== undefined) dbUpdates.order = updates.order
    
    // Add updated_at timestamp
    dbUpdates.updated_at = new Date().toISOString()
    
    console.log(`Updating task ${params.id} with:`, dbUpdates)
    
    try {
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', params.id)
        .select()
        .single()
      
      if (error) {
        console.error('PUT /api/tasks/[id] Supabase error:', JSON.stringify(error, null, 2))
        if (error.code === 'PGRST116') {
          return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }
        return NextResponse.json({ 
          error: 'Failed to update task', 
          details: error.message 
        }, { status: 500 })
      }
      
      if (!updatedTask) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
      
      return NextResponse.json(updatedTask)
    } catch (error) {
      console.error('PUT /api/tasks/[id] caught error:', error)
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', params.id)
    
    if (error) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}