import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const { userId, email, organizationId } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Update the local database
    const dbPath = path.join(process.cwd(), 'data', 'database.json')
    const database = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'))

    // Find the user by email
    let user = database.users.find((u: any) => u.email === email)

    if (user) {
      // Update user status from pending to active
      if (user.status === 'pending') {
        user.status = 'active'
        user.acceptedAt = new Date().toISOString()
        user.updatedAt = new Date().toISOString()
        
        // Update authId if provided
        if (userId && !user.authId) {
          user.authId = userId
        }
      }
    } else {
      // User doesn't exist locally, create them
      user = {
        id: userId || `user-${Date.now()}`,
        email,
        firstName: '',
        lastName: '',
        name: email.split('@')[0], // Use email prefix as default name
        status: 'active',
        acceptedAt: new Date().toISOString(),
        profileColor: '#667eea',
        authId: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      database.users.push(user)
    }

    // Ensure user is in the organization if organizationId is provided
    if (organizationId) {
      const org = database.organizations.find((o: any) => o.id === organizationId)
      if (org && !org.memberIds?.includes(user.id)) {
        org.memberIds = org.memberIds || []
        org.memberIds.push(user.id)
      }
    }

    // Save the updated database
    await fs.promises.writeFile(dbPath, JSON.stringify(database, null, 2))

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation accepted successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })

  } catch (error: any) {
    console.error('Accept invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}