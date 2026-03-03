import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    
    console.log('🔐 Login request received for:', email)
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }
    
    // Create Supabase client
    console.log('📦 Creating Supabase client...')
    const supabase = await createClient()
    console.log('✅ Supabase client created')
    
    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    console.log('🔐 Login attempt:', { 
      email, 
      hasData: !!data,
      hasUser: !!data?.user,
      hasSession: !!data?.session,
      error: error?.message 
    })
    
    if (error) {
      console.error('❌ Login error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    
    if (!data.user || !data.session) {
      return NextResponse.json(
        { error: 'Login failed' },
        { status: 401 }
      )
    }
    
    // The Supabase client automatically sets the necessary cookies
    // Just return success
    return NextResponse.json(
      { 
        success: true, 
        user: data.user 
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('❌ Login error:', error)
    console.error('Error details:', error instanceof Error ? error.stack : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 500 }
    )
  }
}