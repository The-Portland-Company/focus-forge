import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { requireOrgAdmin } from '@/lib/api/authz'

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId, supabase) => {
    const url = new URL(req.url)
    const organizationId = url.searchParams.get('organizationId')

    if (!organizationId) {
      return createErrorResponse('organizationId is required', 400)
    }

    const authz = await requireOrgAdmin(supabase, userId, organizationId)
    if (!authz.authorized) {
      return createErrorResponse('Forbidden', 403)
    }

    const { data, error } = await supabase
      .from('merge_events')
      .select('id, created_at, created_by, source_organization_id, target_organization_id, status')
      .or(`source_organization_id.eq.${organizationId},target_organization_id.eq.${organizationId}`)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse(data || [])
  })
}
