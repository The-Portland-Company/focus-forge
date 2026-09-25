import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export async function POST(request: Request) {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

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