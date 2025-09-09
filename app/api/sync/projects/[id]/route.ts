import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/projects/[id] - Get single project
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Project not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(project)
  })
}

// PUT /api/sync/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      }
      
      const { data: project, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return createErrorResponse('Project not found', 404)
        }
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(project)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

// DELETE /api/sync/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', params.id)
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Project not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse({ success: true }, 200)
  })
}