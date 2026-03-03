import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { email, password, firstName, lastName } = await request.json()
    
    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }
    
    const cookieStore = await cookies()
    
    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          },
        },
      }
    )
    
    // Register with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: `${firstName} ${lastName}`
        }
      }
    })
    
    if (error) {
      const isEmailRateLimit = /email rate limit exceeded/i.test(error.message || '')

      if (isEmailRateLimit) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } }
        )

        const { error: adminError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            display_name: `${firstName} ${lastName}`
          }
        })

        if (!adminError) {
          return NextResponse.json(
            {
              success: true,
              message: 'Registration successful'
            },
            { status: 201 }
          )
        }

        return NextResponse.json(
          { error: adminError.message },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    // Create response
    const response = NextResponse.json(
      { success: true, message: 'Registration successful' },
      { status: 201 }
    )
    
    return response
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    )
  }
}
