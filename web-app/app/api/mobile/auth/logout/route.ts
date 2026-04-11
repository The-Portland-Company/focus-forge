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
    const body = await request.json().catch(() => ({}))
    const deviceId = String(body?.device_id || '').trim().toLowerCase()

    if (deviceId) {
      await serviceSupabase
        .from('mobile_push_devices')
        .update({
          is_active: false,
          last_error_at: null,
          last_error_message: null,
        })
        .eq('user_id', auth.user.id)
        .eq('platform', 'ios')
        .eq('device_id', deviceId)
    }

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
