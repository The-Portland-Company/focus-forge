import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organizationIds } = await request.json()

    if (!Array.isArray(organizationIds)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }

    // Update each organization's order_index
    for (let i = 0; i < organizationIds.length; i++) {
      const { error } = await supabase
        .from('organizations')
        .update({ order_index: i })
        .eq('id', organizationIds[i])

      if (error) {
        console.error(`Error updating organization ${organizationIds[i]}:`, error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reordering organizations:', error)
    return NextResponse.json(
      { error: 'Failed to reorder organizations' },
      { status: 500 }
    )
  }
}