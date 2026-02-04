import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _userId, supabase) => {
    try {
      const { organizationIds } = await req.json()

      if (!Array.isArray(organizationIds)) {
        return createErrorResponse('Invalid request data', 400)
      }

      for (let i = 0; i < organizationIds.length; i++) {
        const { error } = await supabase
          .from('organizations')
          .update({ order_index: i })
          .eq('id', organizationIds[i])

        if (error) {
          return createErrorResponse(error.message, 500)
        }
      }

      return createApiResponse({ success: true })
    } catch (error) {
      return createErrorResponse('Failed to reorder organizations', 500)
    }
  })
}
