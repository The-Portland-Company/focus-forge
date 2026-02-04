import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { mapTagFromDb, mapTagToDb } from '@/lib/api/sync-mapper'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, _userId, supabase) => {
    const { data: tag, error } = await supabase
      .from('tags')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse(mapTagFromDb(tag))
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, _userId, supabase) => {
    try {
      const body = await req.json()

      if (!body.name && !body.color) {
        return createErrorResponse('Name or color is required', 400)
      }

      const { data: tag, error } = await supabase
        .from('tags')
        .update(mapTagToDb(body))
        .eq('id', params.id)
        .select()
        .single()

      if (error) {
        return createErrorResponse(error.message, 500)
      }

      return createApiResponse(mapTagFromDb(tag))
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, _userId, supabase) => {
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', params.id)

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse({ success: true })
  })
}
