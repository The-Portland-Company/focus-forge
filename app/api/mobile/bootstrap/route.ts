import { NextRequest, NextResponse } from 'next/server'
import {
  filterTasksByView,
  getMobileAdapterForUser,
  mobileFailure,
  mobileSuccess,
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

    const [user, organizations, projects, tasks] = await Promise.all([
      adapter.getUser(auth.user.id),
      adapter.getOrganizations(),
      adapter.getProjects(),
      adapter.getTasks(),
    ])

    const todayTasks = filterTasksByView(tasks, 'today')

    return NextResponse.json(
      mobileSuccess(
        {
          user,
          organizations,
          projects,
          tasks: todayTasks,
        },
        {
          total_tasks: tasks.length,
          today_tasks: todayTasks.length,
        },
      ),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to load bootstrap data', error),
      { status: 500 },
    )
  }
}
