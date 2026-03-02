import { NextRequest, NextResponse } from 'next/server'
import {
  filterTasksByView,
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get('authorization'),
    )

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const adapter = await getMobileAdapterForUser(auth.user.id)
    const visibleUserIds = await getVisibleMobileUserIds(auth.user.id)

    const [user, organizations, projects, taskGroups] = await Promise.all([
      adapter.getUser(auth.user.id),
      adapter.getOrganizations(),
      adapter.getProjects(),
      Promise.all(
        visibleUserIds.map(async (userId) => {
          const userAdapter = await getMobileAdapterForUser(userId)
          return userAdapter.getTasks()
        }),
      ),
    ])

    const mergedById = new Map<string, any>()
    taskGroups.flat().forEach((task: any) => {
      mergedById.set(task.id, task)
    })
    const tasks = Array.from(mergedById.values())
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
          source_user_count: visibleUserIds.length,
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
