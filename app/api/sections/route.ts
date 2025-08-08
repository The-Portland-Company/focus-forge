import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, updateDatabase } from '@/lib/db/factory'
import { Section } from '@/lib/types'

export async function GET() {
  try {
    const database = await getDatabase()
    return NextResponse.json(database.sections || [])
  } catch (error) {
    console.error('Failed to get sections:', error)
    return NextResponse.json({ error: 'Failed to get sections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const database = await getDatabase()
    
    const newSection: Section = {
      id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: body.name,
      projectId: body.projectId,
      parentId: body.parentId,
      color: body.color,
      description: body.description,
      icon: body.icon,
      order: body.order || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    database.sections = database.sections || []
    database.sections.push(newSection)
    
    await updateDatabase(database)
    
    return NextResponse.json(newSection)
  } catch (error) {
    console.error('Failed to create section:', error)
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
  }
}