import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { mapSectionFromDb, mapSectionToDb } from '@/lib/api/sync-mapper'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, _userId, supabase) => {
    const { data: section, error } = await supabase
      .from('sections')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse(mapSectionFromDb(section))
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, _userId, supabase) => {
    try {
      const body = await req.json()

      const { data: section, error } = await supabase
        .from('sections')
        .update(mapSectionToDb({ ...body, updatedAt: new Date().toISOString() }))
        .eq('id', params.id)
        .select()
        .single()

      if (error) {
        return createErrorResponse(error.message, 500)
      }

      return createApiResponse(mapSectionFromDb(section))
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
      .from('sections')
      .delete()
      .eq('id', params.id)

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse({ success: true })
  })
}
