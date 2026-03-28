import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { normalizeRichText } from '@/lib/rich-text-sanitize'
import { normalizeProjectContentFields } from '@/lib/devnotes-meta'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Get the Supabase client and authenticated user
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const name = String(body?.name || '').trim()
    const organizationId =
      body?.organization_id ||
      body?.organizationId ||
      null

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    const normalizedDescription =
      body?.description !== undefined ? normalizeRichText(body.description) : null
    const normalizedContent = normalizeProjectContentFields({
      description: normalizedDescription,
      devnotesMeta: body?.devnotesMeta,
      devnotes_meta: body?.devnotes_meta,
    })

    const projectData = {
      name,
      description: normalizedContent.description,
      devnotes_meta: normalizedContent.devnotesMeta,
      color: body?.color || '#6B7280',
      organization_id: organizationId,
      is_favorite: body?.is_favorite ?? body?.isFavorite ?? false,
      archived: body?.archived ?? false,
      budget: body?.budget ?? null,
      deadline: body?.deadline || null,
      order_index: body?.order_index ?? body?.orderIndex ?? 0,
    }

    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    const newProject = await adapter.createProject(projectData)
    return NextResponse.json(newProject)
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      {
        error: 'Failed to create project',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
