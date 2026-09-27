import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

// Note: User section preferences not yet migrated to Supabase

export async function POST(request: NextRequest) {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    // User section preferences not implemented in Supabase yet
    return NextResponse.json({ error: 'User section preferences feature not yet available' }, { status: 501 })
  } catch (error) {
    console.error('Failed to update user section preference:', error)
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 })
  }
}