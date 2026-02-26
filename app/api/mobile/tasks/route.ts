import { NextRequest, NextResponse } from 'next/server'
import {
  filterTasksByView,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
  normalizeTaskInput,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const view = request.nextUrl.searchParams.get('view') || 'all'
    const projectId = request.nextUrl.searchParams.get('projectId') || undefined

    const tasks = await adapter.getTasks(projectId)
    const filtered = filterTasksByView(tasks, view)

    return NextResponse.json(
      mobileSuccess(filtered, {
        view,
        project_id: projectId || null,
        count: filtered.length,
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to fetch tasks', error),
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const raw = await request.json()
    const payload = normalizeTaskInput(raw)

    if (!payload.name || typeof payload.name !== 'string') {
      return NextResponse.json(
        mobileFailure('validation_error', 'Task name is required'),
        { status: 400 },
      )
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const now = new Date().toISOString()

    const newTask = await adapter.createTask({
      ...payload,
      created_at: payload.created_at || now,
      updated_at: now,
      completed: payload.completed ?? false,
      priority: payload.priority ?? 4,
    })

    return NextResponse.json(mobileSuccess(newTask), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create task', error),
      { status: 500 },
    )
  }
}
