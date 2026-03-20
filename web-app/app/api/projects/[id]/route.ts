import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { requireProjectAdmin } from '@/lib/api/authz'
import { normalizeRichText } from '@/lib/rich-text-sanitize'

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authz = await requireProjectAdmin(supabase, session.user.id, params.id)
    if (!authz.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates = await request.json()
    if (updates?.description !== undefined) {
      updates.description = normalizeRichText(updates.description)
    }
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    const updatedProject = await adapter.updateProject(params.id, updates)

    if (!updatedProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(updatedProject)
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authz = await requireProjectAdmin(supabase, session.user.id, params.id)
    if (!authz.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id)
    await adapter.deleteProject(params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
