import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'

// Send a passwordless magic-link (email OTP) to the native app. Mirrors the
// web login screen's default method. `shouldCreateUser: false` keeps signup
// restricted — the login screen cannot mint new accounts.
//
// The emailed link opens the app via the custom scheme focusforge://auth-callback
// (also the Apple OAuth redirect). Default redirect_to matches that scheme so
// the token_hash / implicit-fragment lands back in the app; the app then calls
// /api/mobile/auth/magic-link/verify (token_hash path) or applies the session
// directly (implicit-fragment path).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const redirectTo =
      String(body?.redirect_to || '').trim() || 'focusforge://auth-callback'

    if (!email) {
      return NextResponse.json(
        mobileFailure('missing_email', 'email is required'),
        { status: 400 },
      )
    }

    const supabase = createAnonSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    })

    if (error) {
      return NextResponse.json(
        mobileFailure('magic_link_failed', error.message, error),
        { status: 400 },
      )
    }

    return NextResponse.json(mobileSuccess({ sent: true }), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to send magic link', error),
      { status: 500 },
    )
  }
}
