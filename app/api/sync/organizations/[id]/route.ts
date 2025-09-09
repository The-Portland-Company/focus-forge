import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/organizations/[id] - Get single organization
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Organization not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(organization)
  })
}

// PUT /api/sync/organizations/[id] - Update organization
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { data: organization, error } = await supabase
        .from('organizations')
        .update(body)
        .eq('id', params.id)
        .select()
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return createErrorResponse('Organization not found', 404)
        }
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(organization)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

// DELETE /api/sync/organizations/[id] - Delete organization
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', params.id)
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Organization not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse({ success: true }, 200)
  })
}