import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  loadAccessiblePlan,
  mobileFailure,
  mobileSuccess,
  serializeMobilePlan,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['read', 'write', 'admin'],
    )
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const params = await props.params
    const serviceSupabase = createServiceSupabase()
    const { plan, hasAccess } = await loadAccessiblePlan(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!plan || !hasAccess) {
      return NextResponse.json(
        mobileFailure('plan_not_found', 'Plan not found for current user'),
        { status: 404 },
      )
    }

    return NextResponse.json(mobileSuccess(serializeMobilePlan(plan)), {
      status: 200,
    })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to fetch plan', error),
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['write', 'admin'],
    )
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const params = await props.params
    const body = await request.json()
    const serviceSupabase = createServiceSupabase()
    const { plan, hasAccess } = await loadAccessiblePlan(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!plan || !hasAccess) {
      return NextResponse.json(
        mobileFailure('plan_not_found', 'Plan not found for current user'),
        { status: 404 },
      )
    }

    const update: Record<string, unknown> = {}

    if (typeof body?.name === 'string') {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json(
          mobileFailure('validation_error', 'Plan name cannot be empty'),
          { status: 400 },
        )
      }
      update.name = name
    }

    const rawContent =
      body?.content_markdown !== undefined
        ? body.content_markdown
        : body?.contentMarkdown
    if (typeof rawContent === 'string') {
      update.content_markdown = rawContent
    }

    if (typeof body?.order === 'number' && Number.isFinite(body.order)) {
      update.order_index = body.order
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        mobileFailure('validation_error', 'No valid updates provided'),
        { status: 400 },
      )
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await serviceSupabase
      .from('plans')
      .update(update)
      .eq('id', plan.id)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json(
        mobileFailure('plan_update_failed', error?.message || 'Failed', error),
        { status: 500 },
      )
    }

    return NextResponse.json(mobileSuccess(serializeMobilePlan(data)), {
      status: 200,
    })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to update plan', error),
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
      ['write', 'admin'],
    )
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const params = await props.params
    const serviceSupabase = createServiceSupabase()
    const { plan, hasAccess } = await loadAccessiblePlan(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!plan || !hasAccess) {
      return NextResponse.json(
        mobileFailure('plan_not_found', 'Plan not found for current user'),
        { status: 404 },
      )
    }

    const { error: rpcError } = await serviceSupabase.rpc('soft_delete_entity', {
      p_entity_type: 'plan',
      p_entity_id: plan.id,
    })

    if (rpcError) {
      return NextResponse.json(
        mobileFailure('plan_delete_failed', rpcError.message, rpcError),
        { status: 500 },
      )
    }

    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to delete plan', error),
      { status: 500 },
    )
  }
}
