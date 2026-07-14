import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  getGoalTaskCounts,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  serializeMobileGoal,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'

type ServiceClient = ReturnType<typeof createServiceSupabase>

async function loadAccessibleGoal(
  serviceSupabase: ServiceClient,
  userId: string,
  goalId: string,
) {
  const { data: goal } = await serviceSupabase
    .from('goals')
    .select(
      'id,section_id,project_id,name,description,completed,completed_at,order_index',
    )
    .eq('id', goalId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!goal) return { goal: null as any, hasAccess: false }

  const adapter = await getMobileAdapterForUser(userId)
  const projects = await adapter.getProjects()
  const hasAccess = projects.some(
    (project: any) => project.id === goal.project_id,
  )

  return { goal, hasAccess }
}

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
    const { goal, hasAccess } = await loadAccessibleGoal(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!goal || !hasAccess) {
      return NextResponse.json(
        mobileFailure('goal_not_found', 'Goal not found for current user'),
        { status: 404 },
      )
    }

    const counts = await getGoalTaskCounts(serviceSupabase, [goal.id])

    return NextResponse.json(
      mobileSuccess(serializeMobileGoal(goal, counts.get(goal.id))),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to fetch goal', error),
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
    const { goal, hasAccess } = await loadAccessibleGoal(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!goal || !hasAccess) {
      return NextResponse.json(
        mobileFailure('goal_not_found', 'Goal not found for current user'),
        { status: 404 },
      )
    }

    const update: Record<string, unknown> = {}

    if (typeof body?.name === 'string') {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json(
          mobileFailure('validation_error', 'Goal name cannot be empty'),
          { status: 400 },
        )
      }
      update.name = name
    }

    if (body?.description !== undefined) {
      update.description =
        typeof body.description === 'string' ? body.description : null
    }

    if (typeof body?.order === 'number') {
      update.order_index = body.order
    }

    if (typeof body?.completed === 'boolean') {
      update.completed = body.completed
      update.completed_at = body.completed ? new Date().toISOString() : null
    }

    // Detect a section_id move (accept snake or camel case; null clears it).
    const hasSectionKey =
      Object.prototype.hasOwnProperty.call(body, 'section_id') ||
      Object.prototype.hasOwnProperty.call(body, 'sectionId')
    let sectionMove = false
    let newSectionId: string | null = goal.section_id

    if (hasSectionKey) {
      const rawSection = Object.prototype.hasOwnProperty.call(body, 'section_id')
        ? body.section_id
        : body.sectionId
      newSectionId =
        typeof rawSection === 'string' && rawSection ? rawSection : null

      if (newSectionId !== goal.section_id) {
        sectionMove = true

        if (newSectionId) {
          const { data: section } = await serviceSupabase
            .from('sections')
            .select('id,project_id')
            .eq('id', newSectionId)
            .is('deleted_at', null)
            .maybeSingle()

          if (!section || section.project_id !== goal.project_id) {
            return NextResponse.json(
              mobileFailure(
                'validation_error',
                'section_id must reference a live section in the same project',
              ),
              { status: 400 },
            )
          }
        }

        update.section_id = newSectionId
      }
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString()
      const { error: updateError } = await serviceSupabase
        .from('goals')
        .update(update)
        .eq('id', goal.id)

      if (updateError) {
        return NextResponse.json(
          mobileFailure('goal_update_failed', updateError.message, updateError),
          { status: 500 },
        )
      }
    }

    // Moving a goal reassigns its live tasks' section_id to match (or clears it).
    if (sectionMove) {
      const { error: taskMoveError } = await serviceSupabase
        .from('tasks')
        .update({
          section_id: newSectionId,
          updated_at: new Date().toISOString(),
        })
        .eq('goal_id', goal.id)
        .is('deleted_at', null)

      if (taskMoveError) {
        return NextResponse.json(
          mobileFailure(
            'goal_update_failed',
            taskMoveError.message,
            taskMoveError,
          ),
          { status: 500 },
        )
      }
    }

    const { data: updated } = await serviceSupabase
      .from('goals')
      .select(
        'id,section_id,project_id,name,description,completed,completed_at,order_index',
      )
      .eq('id', goal.id)
      .maybeSingle()

    const counts = await getGoalTaskCounts(serviceSupabase, [goal.id])

    return NextResponse.json(
      mobileSuccess(serializeMobileGoal(updated || goal, counts.get(goal.id))),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to update goal', error),
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
    const { goal, hasAccess } = await loadAccessibleGoal(
      serviceSupabase,
      auth.user.id,
      params.id,
    )

    if (!goal || !hasAccess) {
      return NextResponse.json(
        mobileFailure('goal_not_found', 'Goal not found for current user'),
        { status: 404 },
      )
    }

    const { error: rpcError } = await serviceSupabase.rpc('soft_delete_entity', {
      p_entity_type: 'goal',
      p_entity_id: goal.id,
    })

    if (rpcError) {
      return NextResponse.json(
        mobileFailure('goal_delete_failed', rpcError.message, rpcError),
        { status: 500 },
      )
    }

    return NextResponse.json(mobileSuccess({ success: true }), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to delete goal', error),
      { status: 500 },
    )
  }
}
