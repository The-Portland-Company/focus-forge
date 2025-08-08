import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, saveDatabase } from '@/lib/db'
import { User } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const database = await getDatabase()
    const newUser = await request.json() as User
    
    // Add the new user to the database
    database.users.push(newUser)
    
    // Save the database
    await saveDatabase(database)
    
    return NextResponse.json(newUser)
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' }, 
      { status: 500 }
    )
  }
}