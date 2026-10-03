import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'
import { buildProjectRollups, type ProjectRollup } from '@/lib/rollup'

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

    const projectIds = (projects || []).map((p: any) => p.id)
    let rollups = new Map<string, ProjectRollup>()
    if (projectIds.length > 0) {
      const service = createServiceSupabase()
      const { data: tasks } = await service
        .from('tasks')
        .select('project_id,completed')
        .in('project_id', projectIds)
        .is('deleted_at', null)
      rollups = buildProjectRollups(projects as any, tasks || [])
    }

    const projectsWithRollup = (projects || []).map((project: any) => ({
      ...project,
      rollup: rollups.get(project.id) ?? {
        childProjectCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
        progress: 0,
      },
    }))

    return NextResponse.json(mobileSuccess(projectsWithRollup), { status: 200 })
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
    const mission =
      body?.mission === undefined || body?.mission === null
        ? undefined
        : String(body.mission)

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
      ...(mission !== undefined ? { mission } : {}),
    })

    return NextResponse.json(mobileSuccess(created), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create project', error),
      { status: 500 },
    )
  }
}
