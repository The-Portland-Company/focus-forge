import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/sections - List all sections
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    
    let query = supabase
      .from('sections')
      .select('*')
      .order('todoist_order', { ascending: true })
      .order('created_at', { ascending: true })
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data: sections, error } = await query
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(sections)
  })
}

// POST /api/sync/sections - Create new section
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { name, projectId, order, todoistOrder } = body
      
      if (!name || !projectId) {
        return createErrorResponse('Name and projectId are required', 400)
      }
      
      const nextOrder =
        todoistOrder !== undefined && Number.isFinite(Number(todoistOrder))
          ? Number(todoistOrder)
          : order !== undefined && Number.isFinite(Number(order))
            ? Number(order)
            : 0

      const { data: section, error } = await supabase
        .from('sections')
        .insert({
          name,
          project_id: projectId,
          todoist_order: nextOrder,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(section, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}
