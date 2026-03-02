import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'

export async function GET(
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

    const serviceSupabase = createServiceSupabase()

    const { data: tasks, error } = await serviceSupabase
      .from('tasks')
      .select(
        'id,name,description,due_date,due_time,priority,project_id,section_id,completed',
      )
      .eq('project_id', projectId)
      .eq('completed', false)
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        mobileFailure('project_tasks_fetch_failed', 'Failed to load project tasks', error),
        { status: 500 },
      )
    }

    return NextResponse.json(
      mobileSuccess(tasks || [], {
        project_id: projectId,
        count: (tasks || []).length,
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to load project tasks', error),
      { status: 500 },
    )
  }
}
