import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/organizations - List all organizations
export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .order('order', { ascending: true })
      .order('name', { ascending: true })
    
    if (error) {
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(organizations)
  })
}

// POST /api/sync/organizations - Create new organization
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const { name, color, description, order } = body
      
      if (!name || !color) {
        return createErrorResponse('Name and color are required', 400)
      }
      
      const { data: organization, error } = await supabase
        .from('organizations')
        .insert({
          name,
          color,
          description,
          order: order ?? 0,
          ownerId: userId,
          memberIds: [userId],
          archived: false
        })
        .select()
        .single()
      
      if (error) {
        return createErrorResponse(error.message, 500)
      }
      
      return createApiResponse(organization, 201)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}