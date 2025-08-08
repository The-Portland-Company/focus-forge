import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseAdapter } from '@/lib/db/factory'
import { updateUser } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const updates = await request.json()
    
    const updatedUser = await updateUser(params.id, updates)
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}