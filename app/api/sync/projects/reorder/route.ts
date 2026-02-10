import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _userId) => {
    try {
      const supabase = await createClient()
      const { organizationId, projectIds } = await req.json()

      if (!organizationId || !Array.isArray(projectIds)) {
        return createErrorResponse('Invalid request data', 400)
      }

      for (let i = 0; i < projectIds.length; i++) {
        const { error } = await supabase
          .from('projects')
          .update({ order_index: i })
          .eq('id', projectIds[i])
          .eq('organization_id', organizationId)

        if (error) {
          return createErrorResponse(error.message, 500)
        }
      }

      return createApiResponse({ success: true })
    } catch (error) {
      return createErrorResponse('Failed to reorder projects', 500)
    }
  })
}
