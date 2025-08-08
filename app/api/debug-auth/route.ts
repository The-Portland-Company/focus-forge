import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    // Test a simple query with RLS
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(5)
    
    // Test the profile query
    let profile = null
    let profileError = null
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      profile = data
      profileError = error
    }
    
    return NextResponse.json({
      auth: {
        session: {
          exists: !!session,
          user: session?.user ? {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role
          } : null,
          access_token: session?.access_token ? 'exists' : 'missing'
        },
        user: user ? {
          id: user.id,
          email: user.email,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata
        } : null,
        sessionError: sessionError?.message,
        userError: userError?.message
      },
      profile: {
        data: profile,
        error: profileError?.message
      },
      organizations: {
        count: orgs?.length || 0,
        data: orgs,
        error: orgsError?.message
      }
    })
  } catch (error) {
    console.error('Debug auth error:', error)
    return NextResponse.json({ 
      error: 'Debug auth error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}