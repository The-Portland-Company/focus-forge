import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/tags - List all tags
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(tags)
  })
}

// POST /api/sync/tags - Create new tag
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { name, color } = body
      
      if (!name || !color) {
        return createErrorResponse('Name and color are required', 400)
      }
      
      const { data: tag, error } = await supabase
        .from('tags')
        .insert({
          name,
          color
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(tag, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}