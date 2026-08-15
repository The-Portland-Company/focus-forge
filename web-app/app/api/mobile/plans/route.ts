import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  resolvePlanOwner,
  serializeMobilePlan,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'

const OWNER_COLUMN: Record<string, string> = {
  organization: 'organization_id',
  project: 'project_id',
  goal: 'goal_id',
  section: 'section_id',
}

// GET /api/mobile/plans?ownerType=project&ownerId=<id> — list live plans.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['read', 'write', 'admin'],
    )
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const ownerType = searchParams.get('ownerType') || ''
    const ownerId = searchParams.get('ownerId') || ''
    const column = OWNER_COLUMN[ownerType]

    if (!column || !ownerId) {
      return NextResponse.json(
        mobileFailure(
          'validation_error',
          'ownerType (organization|project|goal|section) and ownerId are required',
        ),
        { status: 400 },
      )
    }

    // Confirm the caller can access the owner before listing its plans.
    const owner = await resolvePlanOwner(createServiceSupabase(), auth.user.id, {
      [`${ownerType}Id`]: ownerId,
    })
    if (!owner.ok) {
      return NextResponse.json(mobileFailure(owner.code, owner.message), {
        status: owner.code === 'owner_not_found' ? 404 : 400,
      })
    }

    const serviceSupabase = createServiceSupabase()
    const { data, error } = await serviceSupabase
      .from('plans')
      .select('*')
      .eq(column, ownerId)
      .is('deleted_at', null)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json(
        mobileFailure('plan_list_failed', error.message, error),
        { status: 500 },
      )
    }

    return NextResponse.json(
      mobileSuccess((data || []).map(serializeMobilePlan)),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to list plans', error),
      { status: 500 },
    )
  }
}

// POST /api/mobile/plans — create a plan owned by exactly one entity.
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
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json(
        mobileFailure('validation_error', 'name is required'),
        { status: 400 },
      )
    }

    const serviceSupabase = createServiceSupabase()
    const owner = await resolvePlanOwner(serviceSupabase, auth.user.id, body)
    if (!owner.ok) {
      return NextResponse.json(mobileFailure(owner.code, owner.message), {
        status: owner.code === 'owner_not_found' ? 404 : 400,
      })
    }

    const contentMarkdown =
      typeof body?.content_markdown === 'string'
        ? body.content_markdown
        : typeof body?.contentMarkdown === 'string'
          ? body.contentMarkdown
          : ''
    const order =
      typeof body?.order === 'number' && Number.isFinite(body.order)
        ? body.order
        : 0

    const { data, error } = await serviceSupabase
      .from('plans')
      .insert({
        name,
        content_markdown: contentMarkdown,
        order_index: order,
        [owner.column]: owner.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json(
        mobileFailure('plan_create_failed', error?.message || 'Failed', error),
        { status: 500 },
      )
    }

    return NextResponse.json(mobileSuccess(serializeMobilePlan(data)), {
      status: 201,
    })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create plan', error),
      { status: 500 },
    )
  }
}
