import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note: User creation is handled through Supabase Auth + invite-user API
// This endpoint is kept for compatibility but redirects to proper flow

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Users should be created through Supabase Auth via /api/invite-user
    return NextResponse.json(
      { error: 'Please use /api/invite-user to create new users' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}