import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note: Sections feature not yet migrated to Supabase

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sections not implemented in Supabase yet
    return NextResponse.json({ error: 'Sections feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to update section:', error)
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sections not implemented in Supabase yet
    return NextResponse.json({ error: 'Sections feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to delete section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}