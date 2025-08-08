import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, updateDatabase } from '@/lib/db/factory'
import { TaskSection } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const database = await getDatabase()
    
    // Initialize taskSections if it doesn't exist
    if (!database.taskSections) {
      database.taskSections = []
    }
    
    // Check if association already exists
    const exists = database.taskSections.some(
      ts => ts.taskId === body.taskId && ts.sectionId === body.sectionId
    )
    
    if (exists) {
      return NextResponse.json({ error: 'Association already exists' }, { status: 400 })
    }
    
    const newTaskSection: TaskSection = {
      id: `ts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId: body.taskId,
      sectionId: body.sectionId,
      createdAt: new Date().toISOString()
    }
    
    database.taskSections.push(newTaskSection)
    await updateDatabase(database)
    
    return NextResponse.json(newTaskSection)
  } catch (error) {
    console.error('Failed to create task-section association:', error)
    return NextResponse.json({ error: 'Failed to create association' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    const sectionId = searchParams.get('sectionId')
    
    if (!taskId || !sectionId) {
      return NextResponse.json({ error: 'taskId and sectionId are required' }, { status: 400 })
    }
    
    const database = await getDatabase()
    
    if (!database.taskSections) {
      return NextResponse.json({ error: 'Association not found' }, { status: 404 })
    }
    
    const index = database.taskSections.findIndex(
      ts => ts.taskId === taskId && ts.sectionId === sectionId
    )
    
    if (index === -1) {
      return NextResponse.json({ error: 'Association not found' }, { status: 404 })
    }
    
    database.taskSections.splice(index, 1)
    await updateDatabase(database)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task-section association:', error)
    return NextResponse.json({ error: 'Failed to delete association' }, { status: 500 })
  }
}