import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/comments/[id] - Get single comment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: comment, error } = await supabase
      .from('comments')
      .select('*')
      .eq('id', params.id)
      .eq('isDeleted', false)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Comment not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(comment)
  })
}

// PUT /api/sync/comments/[id] - Update comment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { content } = body
      
      if (!content) {
        return createErrorResponse('Content is required', 400)
      }
      
      const { data: comment, error } = await supabase
        .from('comments')
        .update({
          content,
          updatedAt: new Date().toISOString()
        })
        .eq('id', params.id)
        .eq('userId', userId) // Only allow users to edit their own comments
        .select()
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return createErrorResponse('Comment not found or unauthorized', 404)
        }
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(comment)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

// DELETE /api/sync/comments/[id] - Soft delete comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: comment, error } = await supabase
      .from('comments')
      .update({
        isDeleted: true,
        updatedAt: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('userId', userId) // Only allow users to delete their own comments
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Comment not found or unauthorized', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse({ success: true }, 200)
  })
}