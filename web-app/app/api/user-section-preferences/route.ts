import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note: User section preferences not yet migrated to Supabase

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // User section preferences not implemented in Supabase yet
    return NextResponse.json({ error: 'User section preferences feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to update user section preference:', error)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}