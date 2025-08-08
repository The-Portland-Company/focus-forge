import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    // Check cookies
    const cookieStore = await cookies()
    const supabaseCookies = cookieStore.getAll().filter(c => 
      c.name.includes('supabase') || c.name.includes('auth')
    )
    
    // Create regular client
    const supabase = await createClient()
    
    // Try to get session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    // Try to get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    // Test a query with regular client
    let regularQueryResult = null
    let regularQueryError = null
    if (user) {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .limit(1)
      regularQueryResult = data
      regularQueryError = error
    }
    
    // Test with service client
    const serviceSupabase = await createServiceClient()
    const { data: serviceData, error: serviceError } = await serviceSupabase
      .from('organizations')
      .select('id, name')
      .limit(3)
    
    // Check super admin profile
    let superAdminProfile = null
    if (user) {
      const { data, error } = await serviceSupabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      superAdminProfile = { data, error: error?.message }
    }
    
    return NextResponse.json({
      cookies: {
        count: supabaseCookies.length,
        names: supabaseCookies.map(c => c.name)
      },
      auth: {
        session: {
          exists: !!session,
          userId: session?.user?.id,
          email: session?.user?.email,
          expiresAt: session?.expires_at
        },
        user: user ? {
          id: user.id,
          email: user.email,
          role: user.role
        } : null,
        sessionError: sessionError?.message,
        userError: userError?.message
      },
      queries: {
        withRegularClient: {
          data: regularQueryResult,
          error: regularQueryError?.message,
          errorCode: regularQueryError?.code
        },
        withServiceClient: {
          count: serviceData?.length || 0,
          data: serviceData,
          error: serviceError?.message
        }
      },
      superAdminProfile,
      debug: {
        USE_SUPABASE: process.env.USE_SUPABASE,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'exists' : 'missing',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'exists' : 'missing'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    })
  } catch (error) {
    console.error('Auth debug error:', error)
    return NextResponse.json({ 
      error: 'Auth debug error', 
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}