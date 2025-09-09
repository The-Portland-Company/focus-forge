import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/projects - List all projects
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const url = new URL(req.url)
    const organizationId = url.searchParams.get('organizationId')
    const archived = url.searchParams.get('archived') === 'true'
    
    let query = supabase
      .from('projects')
      .select('*')
      .order('order', { ascending: true })
      .order('name', { ascending: true })
    
    if (organizationId) {
      query = query.eq('organizationId', organizationId)
    }
    
    if (archived !== null) {
      query = query.eq('archived', archived)
    }
    
    const { data: projects, error } = await query
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(projects)
  })
}

// POST /api/sync/projects - Create new project
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { name, color, organizationId, description, budget, deadline, order } = body
      
      if (!name || !color || !organizationId) {
        return createErrorResponse('Name, color, and organizationId are required', 400)
      }
      
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name,
          color,
          organizationId,
          description,
          budget,
          deadline,
          order: order ?? 0,
          ownerId: userId,
          isFavorite: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(project, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}