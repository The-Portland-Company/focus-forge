import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'

export type MobileApiError = {
  code: string
  message: string
  details?: unknown
}

export type MobileApiEnvelope<T> = {
  data: T | null
  meta?: Record<string, unknown>
  error: MobileApiError | null
}

export const mobileSuccess = <T>(
  data: T,
  meta?: Record<string, unknown>,
): MobileApiEnvelope<T> => ({
  data,
  ...(meta ? { meta } : {}),
  error: null,
})

export const mobileFailure = (
  code: string,
  message: string,
  details?: unknown,
): MobileApiEnvelope<null> => ({
  data: null,
  error: {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
})

export const createAnonSupabase = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

export const createServiceSupabase = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

export const getBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export const verifyMobileAccessToken = async (authHeader: string | null) => {
  const accessToken = getBearerToken(authHeader)
  if (!accessToken) {
    return { ok: false as const, status: 401 as const, error: mobileFailure('missing_bearer_token', 'Authorization header with Bearer token is required') }
  }

  const supabase = createAnonSupabase()
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data?.user) {
    return {
      ok: false as const,
      status: 401 as const,
      error: mobileFailure('invalid_access_token', error?.message || 'Access token is invalid or expired'),
    }
  }

  return {
    ok: true as const,
    accessToken,
    user: data.user,
  }
}

export const getMobileAdapterForUser = async (userId: string) => {
  const serviceSupabase = createServiceSupabase()
  return new SupabaseAdapter(serviceSupabase, userId)
}

export const normalizeTaskInput = (payload: Record<string, unknown>) => {
  const fieldMap: Record<string, string> = {
    projectId: 'project_id',
    dueDate: 'due_date',
    dueTime: 'due_time',
    parentId: 'parent_id',
    assignedTo: 'assigned_to',
    completedAt: 'completed_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    todoistId: 'todoist_id',
    recurringPattern: 'recurring_pattern',
    isRecurring: 'is_recurring',
    sectionId: 'section_id',
    lastTodoistSync: 'last_todoist_sync',
    todoistOrder: 'todoist_order',
    todoistLabels: 'todoist_labels',
    todoistAssigneeId: 'todoist_assignee_id',
    todoistAssignerId: 'todoist_assigner_id',
    todoistCommentCount: 'todoist_comment_count',
    todoistUrl: 'todoist_url',
    todoistSyncToken: 'todoist_sync_token',
    timeEstimate: 'time_estimate',
    startDate: 'start_date',
    startTime: 'start_time',
    endDate: 'end_date',
    endTime: 'end_time',
  }

  const allowedFields = new Set([
    'name',
    'description',
    'due_date',
    'due_time',
    'priority',
    'deadline',
    'project_id',
    'assigned_to',
    'completed',
    'completed_at',
    'todoist_id',
    'recurring_pattern',
    'is_recurring',
    'parent_id',
    'indent',
    'section_id',
    'todoist_assignee_id',
    'todoist_assigner_id',
    'todoist_comment_count',
    'todoist_labels',
    'todoist_order',
    'todoist_sync_token',
    'todoist_url',
    'last_todoist_sync',
    'time_estimate',
    'start_date',
    'start_time',
    'end_date',
    'end_time',
    'tags',
    'reminders',
    'attachments',
  ])

  const normalized: Record<string, unknown> = {}

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return
    const mappedKey = fieldMap[key] || key
    if (!allowedFields.has(mappedKey)) return
    normalized[mappedKey] = value
  })

  return normalized
}

const getDateOnly = (value?: string | null) => {
  if (!value) return null
  return value.includes('T') ? value.split('T')[0] : value
}

const getTodayString = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getTomorrowString = () => {
  const now = new Date()
  now.setDate(now.getDate() + 1)
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  const d = `${now.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const filterTasksByView = (tasks: any[], view?: string) => {
  if (!view || view === 'all') return tasks
  const today = getTodayString()
  const tomorrow = getTomorrowString()

  if (view === 'today') {
    return tasks.filter((task) => {
      const dueDate = getDateOnly(task.due_date || task.dueDate)
      return dueDate && dueDate <= today && !task.completed
    })
  }

  if (view === 'upcoming') {
    return tasks.filter((task) => {
      const dueDate = getDateOnly(task.due_date || task.dueDate)
      return dueDate && dueDate >= tomorrow && !task.completed
    })
  }

  return tasks
}
