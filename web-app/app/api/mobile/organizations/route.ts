import { NextRequest, NextResponse } from 'next/server'
import {
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['read', 'write', 'admin'],
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const organizations = await adapter.getOrganizations()
    return NextResponse.json(mobileSuccess(organizations), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to fetch organizations', error),
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['write', 'admin'],
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const color = String(body?.color || '#6B7280').trim() || '#6B7280'

    if (!name) {
      return NextResponse.json(
        mobileFailure('validation_error', 'Organization name is required'),
        { status: 400 },
      )
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const created = await adapter.createOrganization({
      name,
      color,
      archived: false,
      order_index: 0,
    })

    return NextResponse.json(mobileSuccess(created), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create organization', error),
      { status: 500 },
    )
  }
}
