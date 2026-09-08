import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'

// Verify a magic-link token_hash from the emailed link and return the SAME
// session payload shape as /api/mobile/auth/login, so the app can persist a
// session identically to a password login. `type` is "magiclink" (default
// Supabase magic-link template) or "email" (unified template).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const tokenHash = String(body?.token_hash || '').trim()
    const type = String(body?.type || 'magiclink').trim() as EmailOtpType

    if (!tokenHash) {
      return NextResponse.json(
        mobileFailure('missing_token_hash', 'token_hash is required'),
        { status: 400 },
      )
    }

    const supabase = createAnonSupabase()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error || !data?.session || !data?.user) {
      return NextResponse.json(
        mobileFailure(
          'verify_failed',
          error?.message || 'This sign-in link is invalid or has expired',
          error,
        ),
        { status: 401 },
      )
    }

    return NextResponse.json(
      mobileSuccess({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: data.session.token_type,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        user: data.user,
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to verify magic link', error),
      { status: 500 },
    )
  }
}
