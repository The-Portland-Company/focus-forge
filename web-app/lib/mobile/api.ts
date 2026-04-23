import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { getAdminClient } from '@/lib/supabase/admin'
import { hashApiKeySecret } from '@/lib/api/keys/utils'
import type { ApiKeyScope } from '@/lib/api/keys/types'

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

const hasAnyRequiredScope = (
  scopes: ApiKeyScope[],
  requiredScopes: ApiKeyScope[],
) =>
  requiredScopes.some((scope) => scopes.includes(scope)) ||
  scopes.includes('admin')

export const verifyMobileAccessTokenOrPat = async (
  authHeader: string | null,
  requiredPatScopes: ApiKeyScope[] = ['read', 'write', 'admin'],
) => {
  const jwtAuth = await verifyMobileAccessToken(authHeader)
  if (jwtAuth.ok) return jwtAuth

  const token = getBearerToken(authHeader)
  if (!token) return jwtAuth

  const hashedKey = hashApiKeySecret(token)
  const admin = getAdminClient()
  const { data: pat } = await admin
    .from('personal_access_tokens')
    .select('id, created_by, scopes, is_active, expires_at')
    .eq('hashed_key', hashedKey)
    .maybeSingle()

  if (!pat || !pat.is_active) {
    return jwtAuth
  }

  const tokenId = typeof pat.id === 'string' ? pat.id : ''
  const createdBy = typeof pat.created_by === 'string' ? pat.created_by : ''
  const expiresMs = Date.parse(String(pat.expires_at || ''))
  if (!tokenId || !createdBy || Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return {
      ok: false as const,
      status: 401 as const,
      error: mobileFailure('invalid_access_token', 'Access token is invalid or expired'),
    }
  }

  const scopes = Array.isArray(pat.scopes)
    ? (pat.scopes.filter((scope: unknown): scope is ApiKeyScope => typeof scope === 'string') as ApiKeyScope[])
    : []
  if (!hasAnyRequiredScope(scopes, requiredPatScopes)) {
    return {
      ok: false as const,
      status: 403 as const,
      error: mobileFailure('insufficient_scope', 'PAT is missing required scope'),
    }
  }

  const { data: authUserResult, error: authUserError } =
    await admin.auth.admin.getUserById(createdBy)
  if (authUserError || !authUserResult?.user) {
    return {
      ok: false as const,
      status: 401 as const,
      error: mobileFailure('invalid_access_token', 'Access token is invalid or expired'),
    }
  }

  // Best-effort audit trail update.
  void admin
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenId)

  return {
    ok: true as const,
    accessToken: token,
    user: authUserResult.user,
  }
}

export const getMobileAdapterForUser = async (userId: string) => {
  const serviceSupabase = createServiceSupabase()
  return new SupabaseAdapter(serviceSupabase, userId)
}

export const getLinkedSourceUserIds = async (targetUserId: string) => {
  const admin = getAdminClient()
  const linkedIds: string[] = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const users = data?.users || []
    if (users.length === 0) break

    users.forEach((user: any) => {
      const linkedTo = user?.app_metadata?.linked_to_user_id
      if (linkedTo === targetUserId && user?.id && user.id !== targetUserId) {
        linkedIds.push(String(user.id))
      }
    })

    if (users.length < perPage) break
    page += 1
  }

  return [...new Set(linkedIds)]
}

export const getVisibleMobileUserIds = async (targetUserId: string) => {
  const linked = await getLinkedSourceUserIds(targetUserId)
  return [targetUserId, ...linked]
}

export const normalizeTaskInput = (payload: Record<string, unknown>) => {
  const fieldMap: Record<string, string> = {
    devnotesMeta: 'devnotes_meta',
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
    'devnotes_meta',
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
