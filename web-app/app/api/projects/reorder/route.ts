import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organizationId, projectIds } = await request.json()

    if (!organizationId || !Array.isArray(projectIds)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }

    // Update each project's order_index
    for (let i = 0; i < projectIds.length; i++) {
      const { error } = await supabase
        .from('projects')
        .update({ order_index: i })
        .eq('id', projectIds[i])
        .eq('organization_id', organizationId)

      if (error) {
        console.error(`Error updating project ${projectIds[i]}:`, error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reordering projects:', error)
    return NextResponse.json(
      { error: 'Failed to reorder projects' },
      { status: 500 }
    )
  }
}