import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const serviceSupabase = createServiceSupabase()
    const { error } = await serviceSupabase.auth.admin.signOut(auth.user.id, 'global')

    if (error) {
      return NextResponse.json(
        mobileFailure('logout_failed', error.message, error),
        { status: 500 },
      )
    }

    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to logout', error),
      { status: 500 },
    )
  }
}
