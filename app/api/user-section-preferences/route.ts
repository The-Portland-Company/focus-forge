import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, updateDatabase } from '@/lib/db/factory'
import { UserSectionPreference } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const database = await getDatabase()
    
    // Initialize userSectionPreferences if it doesn't exist
    if (!database.userSectionPreferences) {
      database.userSectionPreferences = []
    }
    
    // Check if preference already exists
    const existingIndex = database.userSectionPreferences.findIndex(
      pref => pref.userId === body.userId && pref.sectionId === body.sectionId
    )
    
    if (existingIndex !== -1) {
      // Update existing preference
      database.userSectionPreferences[existingIndex] = {
        ...database.userSectionPreferences[existingIndex],
        isCollapsed: body.isCollapsed,
        updatedAt: new Date().toISOString()
      }
    } else {
      // Create new preference
      const newPreference: UserSectionPreference = {
        id: `pref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: body.userId,
        sectionId: body.sectionId,
        isCollapsed: body.isCollapsed,
        updatedAt: new Date().toISOString()
      }
      database.userSectionPreferences.push(newPreference)
    }
    
    await updateDatabase(database)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update user section preference:', error)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}