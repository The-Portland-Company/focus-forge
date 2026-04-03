import { NextResponse } from 'next/server'
import { sendPasswordResetEmail } from '@/lib/email'
import { getResetPasswordUrl } from '@/lib/auth/urls'
import { getAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }
    
    const admin = getAdminClient()
    const redirectTo = getResetPasswordUrl({ requestUrl: request.url })

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    if (!error && data?.properties?.action_link) {
      const { data: profile } = await admin
        .from('profiles')
        .select('first_name')
        .eq('email', email)
        .maybeSingle()

      try {
        await sendPasswordResetEmail({
          to: email,
          firstName: profile?.first_name || '',
          resetUrl: data.properties.action_link,
        })
      } catch (emailError) {
        console.error('Password reset email send error:', { email, redirectTo, emailError })
      }
    } else if (error) {
      console.error('Password reset link generation error:', { email, redirectTo, error })
      // Don't expose whether the email exists or not for security.
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
