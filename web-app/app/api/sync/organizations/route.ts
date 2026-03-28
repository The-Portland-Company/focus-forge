import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { mapOrganizationFromDb } from '@/lib/api/sync-mapper'

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
    const adapter = new SupabaseAdapter(supabase, userId)
    
    try {
      const body = await req.json()
      
      const { name, color, description, order } = body
      
      if (!name || !color) {
        return createErrorResponse('Name and color are required', 400)
      }
      
      const organization = await adapter.createOrganization({
        name,
        color,
        description,
        order,
        ownerId: userId,
        memberIds: [userId],
        archived: false,
      })

      return createApiResponse(
        {
          ...mapOrganizationFromDb(organization),
          ownerId: userId,
          memberIds: [userId],
        },
        201,
      )
    } catch (error) {
      if (error instanceof Error) {
        return createErrorResponse(error.message, 500)
      }
      return createErrorResponse('Invalid request body', 400)
    }
  })
}
