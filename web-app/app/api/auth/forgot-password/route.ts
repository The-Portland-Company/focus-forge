import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    // Send password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3244'}/auth/reset-password`,
    })
    
    if (error) {
      console.error('Password reset error:', error)
      // Don't expose whether the email exists or not for security
      // Always return success to prevent email enumeration
    }
    
    // Always return success for security (prevents email enumeration)
    return NextResponse.json(
      { 
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.' 
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    )
  }
}