import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

export async function POST(request: NextRequest) {
  try {
    const organizationData = await request.json()
    
    // Get the Supabase client and authenticated user
    const viewerResult = await requireViewerOrUnauthorized();
    
    if (viewerResult instanceof NextResponse) return viewerResult;
    
    const { supabase, user } = viewerResult;
    
    const session = { user };
    
    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id)
    
    // Get the database user profile
    const dbUser = await adapter.getUser(session.user.id)
    
    if (!dbUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }
    
    // Add the owner ID to the organization data
    const orgDataWithOwner = {
      ...organizationData,
      ownerId: dbUser.id,
      memberIds: [dbUser.id]
    }
    
    const newOrganization = await adapter.createOrganization(orgDataWithOwner)
    return NextResponse.json(newOrganization)
  } catch (error) {
    console.error('Failed to create organization:', error)
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
  }
}