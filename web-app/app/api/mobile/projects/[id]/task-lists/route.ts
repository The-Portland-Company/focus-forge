import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'

type TaskListSummary = {
  id: string
  section_id: string | null
  name: string
  task_count: number
}

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

    const [{ data: sections, error: sectionsError }, { data: tasks, error: tasksError }] =
      await Promise.all([
        serviceSupabase
          .from('sections')
          .select('id,name')
          .eq('project_id', projectId)
          .order('name', { ascending: true }),
        serviceSupabase
          .from('tasks')
          .select('id,section_id')
          .eq('project_id', projectId)
          .eq('completed', false),
      ])

    if (sectionsError || tasksError) {
      return NextResponse.json(
        mobileFailure(
          'task_list_fetch_failed',
          'Failed to load task lists for project',
          sectionsError || tasksError,
        ),
        { status: 500 },
      )
    }

    const counts = new Map<string, number>()
    ;(tasks || []).forEach((task: any) => {
      const key = task.section_id || 'unsectioned'
      counts.set(key, (counts.get(key) || 0) + 1)
    })

    const taskLists: TaskListSummary[] = [
      {
        id: 'unsectioned',
        section_id: null,
        name: 'Unsectioned',
        task_count: counts.get('unsectioned') || 0,
      },
      ...(sections || []).map((section: any) => ({
        id: section.id,
        section_id: section.id,
        name: section.name,
        task_count: counts.get(section.id) || 0,
      })),
    ]

    return NextResponse.json(mobileSuccess(taskLists), { status: 200 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to load project task lists', error),
      { status: 500 },
    )
  }
}

export async function POST(
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
    const body = await request.json()
    const name = String(body?.name || '').trim()

    if (!name) {
      return NextResponse.json(
        mobileFailure('validation_error', 'Task list name is required'),
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
    const { data: created, error: createError } = await serviceSupabase
      .from('sections')
      .insert({
        name,
        project_id: projectId,
      })
      .select('id,name')
      .single()

    if (createError || !created) {
      return NextResponse.json(
        mobileFailure(
          'task_list_create_failed',
          createError?.message || 'Failed to create task list',
          createError,
        ),
        { status: 500 },
      )
    }

    const createdList: TaskListSummary = {
      id: created.id,
      section_id: created.id,
      name: created.name,
      task_count: 0,
    }

    return NextResponse.json(mobileSuccess(createdList), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create project task list', error),
      { status: 500 },
    )
  }
}
