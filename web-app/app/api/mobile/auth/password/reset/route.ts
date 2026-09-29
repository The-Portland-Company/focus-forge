import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import { MOBILE_RECOVERY_REDIRECT } from '@/lib/mobile/auth-providers'

/**
 * [mobile-sso] Send a password-reset email that deep-links back into the app.
 *
 * Always answers 200 regardless of whether the address exists — a different
 * answer per address would turn this into an account-enumeration oracle.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json(
        mobileFailure('missing_email', 'email is required'),
        { status: 400 },
      )
    }

    const supabase = createAnonSupabase()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: MOBILE_RECOVERY_REDIRECT,
    })

    if (error) {
      console.error('[mobile-sso] password reset request failed:', error.message)
    }

    return NextResponse.json(
      mobileSuccess({
        status: 'sent',
        message: 'If that address has an account, a reset email is on its way.',
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to start password reset', error),
      { status: 500 },
    )
  }
}
