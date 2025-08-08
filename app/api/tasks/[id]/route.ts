import { NextRequest, NextResponse } from 'next/server'
import { updateTask, deleteTask, getDatabase } from '@/lib/db'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const database = await getDatabase()
    const task = database.tasks.find(t => t.id === params.id)
    
    if (!task) {
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
    const updatedTask = await updateTask(params.id, updates)
    
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json(updatedTask)
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
    const deleted = await deleteTask(params.id)
    
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}