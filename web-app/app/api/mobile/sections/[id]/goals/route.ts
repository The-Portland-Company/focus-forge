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
    const sectionId = params.id
    const serviceSupabase = createServiceSupabase()

    const { data: section } = await serviceSupabase
      .from('sections')
      .select('id,project_id')
      .eq('id', sectionId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!section) {
      return NextResponse.json(
        mobileFailure('section_not_found', 'Section not found for current user'),
        { status: 404 },
      )
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const projects = await adapter.getProjects()
    const hasAccess = projects.some(
      (project: any) => project.id === section.project_id,
    )

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure('section_not_found', 'Section not found for current user'),
        { status: 404 },
      )
    }

    const { data: goals, error: goalsError } = await serviceSupabase
      .from('goals')
      .select(
        'id,section_id,project_id,name,description,completed,completed_at,order_index',
      )
      .eq('section_id', sectionId)
      .is('deleted_at', null)
      .order('order_index', { ascending: true })

    if (goalsError) {
      return NextResponse.json(
        mobileFailure('goal_fetch_failed', 'Failed to load goals for section', goalsError),
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
      mobileFailure('internal_error', 'Failed to load section goals', error),
      { status: 500 },
    )
  }
}
