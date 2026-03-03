import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import { mapSectionFromDb, mapSectionToDb } from '@/lib/api/sync-mapper'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, _userId) => {
    const supabase = await createClient()
    const { data: section, error } = await supabase
      .from('sections')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse(mapSectionFromDb(section))
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, _userId) => {
    const supabase = await createClient()
    try {
      const body = await req.json()

      const { data: section, error } = await supabase
        .from('sections')
        .update(mapSectionToDb({ ...body, updatedAt: new Date().toISOString() }))
        .eq('id', id)
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, _userId) => {
    const supabase = await createClient()
    const { error } = await supabase
      .from('sections')
      .delete()
      .eq('id', id)

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    return createApiResponse({ success: true })
  })
}
