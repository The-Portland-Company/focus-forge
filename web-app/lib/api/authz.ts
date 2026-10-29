import { NextResponse, type NextRequest } from 'next/server'
import { getViewer } from '@/lib/auth/tpc-session'
import { resolveLocalUser, scopedSupabaseClient } from '@/lib/auth/local-identity'
import { isProjectAdmin } from '@/lib/db/project-orgs'

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

/**
 * Project-level admin check. Authorized when the user is a global admin, an
 * owner of the project's PRIMARY org, or an owner of an ADDITIONAL org that
 * holds the project with role 'manager' (multi-org projects).
 *
 * `isPrimaryAdmin` is true only for global admins / primary-org owners - that is
 * the bar for changing WHICH organizations a project is shared with, or moving
 * its primary org. `organizationId` stays the PRIMARY org id (legacy contract).
 */
export async function requireProjectAdmin(
  supabase: any,
  userId: string,
  projectId: string,
) {
  const result = await isProjectAdmin(supabase, userId, projectId)
  return {
    authorized: result.authorized,
    isPrimaryAdmin: result.isPrimaryAdmin,
    organizationId: result.primaryOrganizationId,
  }
}
