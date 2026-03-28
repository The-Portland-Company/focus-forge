import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { requireOrgAdmin } from '@/lib/api/authz'

const ADMIN_ROLES = new Set(['admin', 'super_admin'])

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const updates = await request.json()
    
    // Get the Supabase client and authenticated user
    const supabase = await createClient()
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (currentProfileError) {
      return NextResponse.json({ error: currentProfileError.message }, { status: 500 })
    }

    const isSelfUpdate = params.id === session.user.id
    const requestedRoleChange = updates?.role !== undefined

    if (requestedRoleChange && !ADMIN_ROLES.has(String(currentProfile?.role || ''))) {
      const organizationId =
        typeof updates?.organizationId === 'string' ? updates.organizationId : ''
      if (!organizationId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const authz = await requireOrgAdmin(supabase, session.user.id, organizationId)
      if (!authz.authorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (!requestedRoleChange && !isSelfUpdate && !ADMIN_ROLES.has(String(currentProfile?.role || ''))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    delete updates.organizationId
    
    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    
    const updatedUser = await adapter.updateUser(params.id, updates)
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
