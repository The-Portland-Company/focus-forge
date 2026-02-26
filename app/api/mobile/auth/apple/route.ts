import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'

const parseJwtPayload = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const identityToken = body?.identity_token || body?.identityToken
    const nonce = body?.nonce

    if (!identityToken) {
      return NextResponse.json(
        mobileFailure('missing_identity_token', 'identity_token is required'),
        { status: 400 },
      )
    }

    const jwtPayload = parseJwtPayload(identityToken)
    if (jwtPayload) {
      console.log('🍎 Apple token payload summary:', {
        iss: jwtPayload.iss,
        aud: jwtPayload.aud,
        nonce: jwtPayload.nonce,
        sub: jwtPayload.sub,
        exp: jwtPayload.exp,
      })
    }

    const supabase = createAnonSupabase()
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
      ...(nonce ? { nonce } : {}),
    })

    if (error || !data?.session || !data?.user) {
      const message = error?.message || 'Apple Sign In failed'
      console.error('❌ /api/mobile/auth/apple failed:', {
        message,
        code: (error as any)?.code,
        status: (error as any)?.status,
        aud: jwtPayload?.aud,
        iss: jwtPayload?.iss,
      })

      // Expose actionable hint for the common config mismatch case.
      const details = /aud|audience|client.?id/i.test(message)
        ? {
            hint: 'Apple token audience mismatch. Ensure Supabase Apple provider client IDs include this app bundle/service ID.',
            token_aud: jwtPayload?.aud,
          }
        : error

      return NextResponse.json(
        mobileFailure('apple_signin_failed', message, details),
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
    console.error('❌ /api/mobile/auth/apple internal error:', error)
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to process Apple Sign In', error),
      { status: 500 },
    )
  }
}
