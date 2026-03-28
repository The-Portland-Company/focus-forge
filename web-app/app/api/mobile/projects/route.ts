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

    const organizationId = request.nextUrl.searchParams.get('organizationId') || undefined
    const adapter = await getMobileAdapterForUser(auth.user.id)
    const projects = await adapter.getProjects(organizationId)
    return NextResponse.json(mobileSuccess(projects), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to fetch projects', error),
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
    const organizationId = String(body?.organization_id || body?.organizationId || '').trim()
    const color = String(body?.color || '#6B7280').trim() || '#6B7280'

    if (!name || !organizationId) {
      return NextResponse.json(
        mobileFailure('validation_error', 'Project name and organization_id are required'),
        { status: 400 },
      )
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const created = await adapter.createProject({
      name,
      color,
      organization_id: organizationId,
      archived: false,
      is_favorite: false,
      order_index: 0,
    })

    return NextResponse.json(mobileSuccess(created), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create project', error),
      { status: 500 },
    )
  }
}
