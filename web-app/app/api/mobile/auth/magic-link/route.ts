import { NextRequest, NextResponse } from 'next/server'
import { mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import { sendMagicLink } from '@/lib/auth/send-magic-link'

// Send a passwordless magic-link to the native app. Generates the link with the
// admin API and sends it via Resend (NOT Supabase's shared mailer, capped at
// 2/hour). The emailed link opens the app via the custom scheme
// focusforge://auth-callback carrying token_hash; the app then posts to
// /api/mobile/auth/magic-link/verify.
//
// Always reports { sent: true } — never leaks whether the account exists.
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

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

    const { rateLimited } = await sendMagicLink({ email, redirectTo, ip })
    if (rateLimited) {
      return NextResponse.json(
        mobileFailure('rate_limited', 'Too many requests. Please wait a few minutes and try again.'),
        { status: 429 },
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
