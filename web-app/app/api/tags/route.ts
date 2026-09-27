import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export async function GET() {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    const adapter = new SupabaseAdapter(supabase, session.user.id)
    const tags = await adapter.getTags()
    return NextResponse.json(tags)
  } catch (error) {
    console.error('Error fetching tags:', error)
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerResult = await requireViewerOrUnauthorized();

    if (viewerResult instanceof NextResponse) return viewerResult;

    const { supabase, user } = viewerResult;

    const session = { user };

    const body = await request.json()
    const { name, color } = body

    if (!name || !color) {
      return NextResponse.json({ error: 'Name and color are required' }, { status: 400 })
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id)
    const newTag = await adapter.createTag({ name, color })

    return NextResponse.json(newTag)
  } catch (error) {
    console.error('Error creating tag:', error)
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
  }
}