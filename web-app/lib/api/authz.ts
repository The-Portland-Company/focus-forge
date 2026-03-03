import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireAuth(request: NextRequest) {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session?.user) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { supabase, user: session.user }
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
