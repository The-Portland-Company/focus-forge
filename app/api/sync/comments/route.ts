import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/comments - List all comments
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const url = new URL(req.url)
    const taskId = url.searchParams.get('taskId')
    const projectId = url.searchParams.get('projectId')
    
    let query = supabase
      .from('comments')
      .select('*')
      .eq('isDeleted', false)
      .order('createdAt', { ascending: false })
    
    if (taskId) {
      query = query.eq('taskId', taskId)
    }
    
    if (projectId) {
      query = query.eq('projectId', projectId)
    }
    
    const { data: comments, error } = await query
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(comments)
  })
}

// POST /api/sync/comments - Create new comment
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { content, taskId, projectId } = body
      
      if (!content || (!taskId && !projectId)) {
        return createErrorResponse('Content and either taskId or projectId are required', 400)
      }
      
      // Get user details
      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('authId', userId)
        .single()
      
      const { data: comment, error } = await supabase
        .from('comments')
        .insert({
          content,
          taskId,
          projectId,
          userId,
          userName: user?.name || 'Unknown User',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(comment, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}