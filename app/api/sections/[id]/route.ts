import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, saveDatabase } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const { id } = params
  
  try {
    const body = await request.json()
    const database = await getDatabase()
    
    const sectionIndex = database.sections?.findIndex(s => s.id === id) ?? -1
    if (sectionIndex === -1) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    
    database.sections[sectionIndex] = {
      ...database.sections[sectionIndex],
      ...body,
      updatedAt: new Date().toISOString()
    }
    
    await saveDatabase(database)
    
    return NextResponse.json(database.sections[sectionIndex])
  } catch (error) {
    console.error('Failed to update section:', error)
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const { id } = params
  
  try {
    const database = await getDatabase()
    
    if (!database.sections) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    
    const sectionIndex = database.sections.findIndex(s => s.id === id)
    if (sectionIndex === -1) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    
    // Remove the section
    database.sections.splice(sectionIndex, 1)
    
    // Remove all task-section associations for this section
    if (database.taskSections) {
      database.taskSections = database.taskSections.filter(ts => ts.sectionId !== id)
    }
    
    // Remove user preferences for this section
    if (database.userSectionPreferences) {
      database.userSectionPreferences = database.userSectionPreferences.filter(pref => pref.sectionId !== id)
    }
    
    // Delete child sections
    const childSections = database.sections.filter(s => s.parentId === id)
    for (const child of childSections) {
      const childIndex = database.sections.findIndex(s => s.id === child.id)
      if (childIndex !== -1) {
        database.sections.splice(childIndex, 1)
      }
    }
    
    await saveDatabase(database)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}