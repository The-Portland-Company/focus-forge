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
    const projectId = params.id
    const adapter = await getMobileAdapterForUser(auth.user.id)
    const projects = await adapter.getProjects()
    const hasAccess = projects.some((project: any) => project.id === projectId)

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure('project_not_found', 'Project not found for current user'),
        { status: 404 },
      )
    }

    const q = (request.nextUrl.searchParams.get('q') || '').trim()
    const serviceSupabase = createServiceSupabase()

    let query = serviceSupabase
      .from('goals')
      .select(
        'id,section_id,project_id,name,description,completed,completed_at,order_index',
      )
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('order_index', { ascending: true })

    if (q) {
      query = query.ilike('name', `%${q}%`)
    }

    const { data: goals, error: goalsError } = await query

    if (goalsError) {
      return NextResponse.json(
        mobileFailure('goal_fetch_failed', 'Failed to load goals for project', goalsError),
        { status: 500 },
      )
    }

    const counts = await getGoalTaskCounts(
      serviceSupabase,
      (goals || []).map((goal: any) => goal.id),
    )

    const summaries = (goals || []).map((goal: any) =>
      serializeMobileGoal(goal, counts.get(goal.id)),
    )

    return NextResponse.json(mobileSuccess(summaries), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to load project goals', error),
      { status: 500 },
    )
  }
}

export async function POST(
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
    const projectId = params.id
    const body = await request.json()
    const name = String(body?.name || '').trim()

    if (!name) {
      return NextResponse.json(
        mobileFailure('validation_error', 'Goal name is required'),
        { status: 400 },
      )
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const projects = await adapter.getProjects()
    const hasAccess = projects.some((project: any) => project.id === projectId)

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure('project_not_found', 'Project not found for current user'),
        { status: 404 },
      )
    }

    const serviceSupabase = createServiceSupabase()

    const sectionId =
      typeof body?.section_id === 'string' && body.section_id
        ? body.section_id
        : null

    if (sectionId) {
      const { data: section } = await serviceSupabase
        .from('sections')
        .select('id,project_id')
        .eq('id', sectionId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!section || section.project_id !== projectId) {
        return NextResponse.json(
          mobileFailure(
            'validation_error',
            'section_id must reference a live section in this project',
          ),
          { status: 400 },
        )
      }
    }

    let orderIndex: number | null =
      typeof body?.order === 'number' ? body.order : null

    if (orderIndex === null) {
      const { data: last } = await serviceSupabase
        .from('goals')
        .select('order_index')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      orderIndex = ((last?.order_index as number | null) ?? -1) + 1
    }

    const { data: created, error: createError } = await serviceSupabase
      .from('goals')
      .insert({
        name,
        description:
          typeof body?.description === 'string' ? body.description : null,
        project_id: projectId,
        section_id: sectionId,
        order_index: orderIndex,
      })
      .select(
        'id,section_id,project_id,name,description,completed,completed_at,order_index',
      )
      .single()

    if (createError || !created) {
      return NextResponse.json(
        mobileFailure(
          'goal_create_failed',
          createError?.message || 'Failed to create goal',
          createError,
        ),
        { status: 500 },
      )
    }

    return NextResponse.json(
      mobileSuccess(serializeMobileGoal(created, { total: 0, completed: 0 })),
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create project goal', error),
      { status: 500 },
    )
  }
}
