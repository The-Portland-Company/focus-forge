import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export async function POST(request: Request) {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

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