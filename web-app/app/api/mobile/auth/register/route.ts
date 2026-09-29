import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import { MOBILE_OAUTH_REDIRECT } from '@/lib/mobile/auth-providers'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * [mobile-sso] Email + password registration for the iOS app.
 *
 * Mirrors the web `/api/auth/register` contract but returns the mobile envelope
 * and, when the project has email confirmation disabled, hands back a usable
 * session so the app can drop the user straight into Today.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    const firstName = String(body?.first_name ?? body?.firstName ?? '').trim()
    const lastName = String(body?.last_name ?? body?.lastName ?? '').trim()

    if (!email || !password) {
      return NextResponse.json(
        mobileFailure('missing_credentials', 'email and password are required'),
        { status: 400 },
      )
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        mobileFailure('invalid_email', 'Enter a valid email address'),
        { status: 400 },
      )
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        mobileFailure(
          'weak_password',
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        ),
        { status: 400 },
      )
    }

    const displayName = `${firstName} ${lastName}`.trim()
    const supabase = createAnonSupabase()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: MOBILE_OAUTH_REDIRECT,
        data: {
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
          ...(displayName ? { display_name: displayName } : {}),
        },
      },
    })

    if (error) {
      const message = error.message || 'Registration failed'
      const alreadyRegistered = /already registered|already exists/i.test(message)
      return NextResponse.json(
        mobileFailure(
          alreadyRegistered ? 'email_taken' : 'registration_failed',
          alreadyRegistered
            ? 'An account with that email already exists. Try signing in instead.'
            : message,
          error,
        ),
        { status: alreadyRegistered ? 409 : 400 },
      )
    }

    // Supabase returns a user with no identities when the address already has an
    // account and confirmation emails are on — surfacing that as success would
    // leave the app waiting on a confirmation email that never arrives.
    if (data?.user && (data.user.identities?.length ?? 0) === 0) {
      return NextResponse.json(
        mobileFailure(
          'email_taken',
          'An account with that email already exists. Try signing in instead.',
        ),
        { status: 409 },
      )
    }

    if (data?.session && data?.user) {
      return NextResponse.json(
        mobileSuccess({
          status: 'signed_in',
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          token_type: data.session.token_type,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
          user: data.user,
        }),
        { status: 201 },
      )
    }

    return NextResponse.json(
      mobileSuccess({
        status: 'confirmation_required',
        email,
      }),
      { status: 202 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to register', error),
      { status: 500 },
    )
  }
}
