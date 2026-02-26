import { NextRequest, NextResponse } from 'next/server'
import {
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  normalizeTaskInput,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const params = await props.params
    const raw = await request.json()
    const payload = normalizeTaskInput(raw)

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const updated = await adapter.updateTask(params.id, {
      ...payload,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json(mobileSuccess(updated), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to update task', error),
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const params = await props.params
    const adapter = await getMobileAdapterForUser(auth.user.id)
    await adapter.deleteTask(params.id)

    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to delete task', error),
      { status: 500 },
    )
  }
}
