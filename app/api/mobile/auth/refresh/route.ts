import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const refreshToken = body?.refresh_token || body?.refreshToken

    if (!refreshToken) {
      return NextResponse.json(
        mobileFailure('missing_refresh_token', 'refresh_token is required'),
        { status: 400 },
      )
    }

    const supabase = createAnonSupabase()
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (error || !data?.session) {
      return NextResponse.json(
        mobileFailure(
          'refresh_failed',
          error?.message || 'Token refresh failed',
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
      mobileFailure('internal_error', 'Failed to refresh token', error),
      { status: 500 },
    )
  }
}
