import { NextRequest, NextResponse } from 'next/server'
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'
import { getAdminClient } from '@/lib/supabase/admin'

const MIN_PASSWORD_LENGTH = 8

/**
 * [mobile-sso] Finish a password reset from the app.
 *
 * The recovery deep link hands the app a short-lived session; it calls here with
 * that access token as the bearer and the new password. Only the token holder's
 * own password can be changed.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(request.headers.get('authorization'))
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const body = await request.json()
    const password = String(body?.password || '')

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        mobileFailure(
          'weak_password',
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        ),
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const { error } = await admin.auth.admin.updateUserById(auth.user.id, {
      password,
    })

    if (error) {
      return NextResponse.json(
        mobileFailure('password_update_failed', error.message, error),
        { status: 400 },
      )
    }

    return NextResponse.json(
      mobileSuccess({ status: 'updated' }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to update password', error),
      { status: 500 },
    )
  }
}
