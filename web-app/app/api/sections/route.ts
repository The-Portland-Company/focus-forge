import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note: Sections feature not yet migrated to Supabase
// Returns empty results for compatibility

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sections not implemented in Supabase yet
    return NextResponse.json([])
  } catch (error) {
    console.error('Failed to get sections:', error)
    return NextResponse.json({ error: 'Failed to get sections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sections not implemented in Supabase yet
    return NextResponse.json({ error: 'Sections feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to create section:', error)
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
  }
}