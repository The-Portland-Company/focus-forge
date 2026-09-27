import { NextResponse, type NextRequest } from 'next/server'
import { getViewer } from '@/lib/auth/tpc-session'
import { resolveLocalUser, scopedSupabaseClient } from '@/lib/auth/local-identity'

// `_request` is unused now that identity comes from the TPC session cookies
// rather than an inbound Supabase cookie header, but kept so call sites don't
// need to change their call signature.
export async function requireAuth(_request: NextRequest) {
  const viewer = await getViewer()
  const localUser = viewer ? await resolveLocalUser(viewer) : null

  if (!localUser) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = scopedSupabaseClient(localUser.id)

  // Shaped like the old Supabase Auth `User` object (id/email) so existing
  // call sites reading `user.id` / `user.email` keep working unchanged.
  return { supabase, user: { id: localUser.id, email: localUser.email } }
}

export async function requireOrgAdmin(supabase: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (!profileError && profile?.role && ['admin', 'super_admin'].includes(profile.role)) {
    return { authorized: true }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('user_organizations')
    .select('is_owner')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .single()

  if (membershipError || !membership?.is_owner) {
    return { authorized: false }
  }

  return { authorized: true }
}

export async function requireProjectAdmin(
  supabase: any,
  userId: string,
  projectId: string,
) {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project?.organization_id) {
    return { authorized: false, organizationId: null }
  }

  const authz = await requireOrgAdmin(supabase, userId, project.organization_id)
  return {
    authorized: authz.authorized,
    organizationId: project.organization_id as string,
  }
}
