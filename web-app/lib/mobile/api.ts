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
    requiresHitl: 'requires_hitl',
    projectId: 'project_id',
    dueDate: 'due_date',
    dueTime: 'due_time',
    parentId: 'parent_id',
    assignedTo: 'assigned_to',
    agentName: 'agent_name',
    agentModel: 'agent_model',
    completedAt: 'completed_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    todoistId: 'todoist_id',
    recurringPattern: 'recurring_pattern',
    isRecurring: 'is_recurring',
    sectionId: 'section_id',
    goalId: 'goal_id',
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
    'requires_hitl',
    'due_date',
    'due_time',
    'priority',
    'deadline',
    'project_id',
    'assigned_to',
    'agent_name',
    'agent_model',
    'completed',
    'completed_at',
    'todoist_id',
    'recurring_pattern',
    'is_recurring',
    'parent_id',
    'indent',
    'section_id',
    'goal_id',
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

/**
 * Resolve a batch of user ids to display names using the profiles table.
 * Returns a Map keyed by user id -> display name (first+last, else email).
 * Done in a single query to avoid N+1 lookups.
 */
export const resolveUserNames = async (
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> => {
  const ids = [
    ...new Set(
      userIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ]
  const names = new Map<string, string>()
  if (ids.length === 0) return names

  const admin = getAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', ids)

  ;(data || []).forEach((profile: any) => {
    const firstName = profile?.first_name || ''
    const lastName = profile?.last_name || ''
    const name =
      `${firstName} ${lastName}`.trim() || profile?.email || null
    if (profile?.id && name) names.set(String(profile.id), name)
  })

  return names
}

/**
 * Ensure a mobile task object carries the snake_case assignment fields the
 * iOS app expects. The adapter already resolves `assignedToName` (camelCase)
 * via a joined profile, so this is a pure shape adapter with no extra queries.
 */
export const serializeMobileTask = <T extends Record<string, any>>(
  task: T,
): T & {
  assigned_to: string | null
  assigned_to_name: string | null
  created_by: string | null
  created_by_name: string | null
  agent_name: string | null
  agent_model: string | null
  goal_id: string | null
} => ({
  ...task,
  assigned_to: task?.assigned_to ?? task?.assignedTo ?? null,
  assigned_to_name: task?.assignedToName ?? null,
  created_by: task?.created_by ?? task?.createdBy ?? null,
  created_by_name: task?.createdByName ?? null,
  agent_name: task?.agent_name ?? task?.agentName ?? null,
  agent_model: task?.agent_model ?? task?.agentModel ?? null,
  goal_id: task?.goal_id ?? task?.goalId ?? null,
})

export const serializeMobileTasks = <T extends Record<string, any>>(
  tasks: T[],
) => tasks.map((task) => serializeMobileTask(task))

export type MobileGoalSummary = {
  id: string
  section_id: string | null
  project_id: string
  name: string
  description: string | null
  completed: boolean
  completed_at: string | null
  order: number | null
  task_count: number
  completed_task_count: number
}

/**
 * Compute live-task counts (total + completed) for a set of goal ids.
 * Returns a Map keyed by goal id. Tasks with deleted_at set are excluded.
 */
export const getGoalTaskCounts = async (
  serviceSupabase: ReturnType<typeof createServiceSupabase>,
  goalIds: string[],
): Promise<Map<string, { total: number; completed: number }>> => {
  const counts = new Map<string, { total: number; completed: number }>()
  const ids = [...new Set(goalIds.filter(Boolean))]
  if (ids.length === 0) return counts

  const { data: tasks } = await serviceSupabase
    .from('tasks')
    .select('goal_id,completed')
    .in('goal_id', ids)
    .is('deleted_at', null)

  ;(tasks || []).forEach((task: any) => {
    const key = task.goal_id
    if (!key) return
    const entry = counts.get(key) || { total: 0, completed: 0 }
    entry.total += 1
    if (task.completed) entry.completed += 1
    counts.set(key, entry)
  })

  return counts
}

/**
 * Fetch a single live (non-deleted) goal by id using the service client.
 * Returns null when not found or soft-deleted.
 */
export const fetchLiveGoal = async (
  serviceSupabase: ReturnType<typeof createServiceSupabase>,
  goalId: string,
): Promise<any | null> => {
  const { data } = await serviceSupabase
    .from('goals')
    .select(
      'id,section_id,project_id,name,description,completed,completed_at,order_index',
    )
    .eq('id', goalId)
    .is('deleted_at', null)
    .maybeSingle()
  return data || null
}

export type MobilePlanSummary = {
  id: string
  organization_id: string | null
  project_id: string | null
  goal_id: string | null
  section_id: string | null
  name: string
  content_markdown: string
  order: number | null
  created_at: string | null
  updated_at: string | null
}

const PLAN_COLUMNS =
  'id,organization_id,project_id,goal_id,section_id,name,content_markdown,order_index,created_at,updated_at'

export const serializeMobilePlan = (plan: any): MobilePlanSummary => ({
  id: plan.id,
  organization_id: plan.organization_id ?? null,
  project_id: plan.project_id ?? null,
  goal_id: plan.goal_id ?? null,
  section_id: plan.section_id ?? null,
  name: plan.name,
  content_markdown: plan.content_markdown ?? '',
  order: plan.order_index ?? null,
  created_at: plan.created_at ?? null,
  updated_at: plan.updated_at ?? null,
})

/**
 * Fetch a single live plan and decide whether `userId` may access it. A plan is
 * accessible when the user is a member of its owning organization — resolved
 * through whichever owner FK (org/project/goal/section) is set.
 */
export const loadAccessiblePlan = async (
  serviceSupabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
  planId: string,
): Promise<{ plan: any | null; hasAccess: boolean }> => {
  const { data: plan } = await serviceSupabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('id', planId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!plan) return { plan: null, hasAccess: false }

  const adapter = await getMobileAdapterForUser(userId)
  const projects = await adapter.getProjects()
  const projectIds = new Set(projects.map((p: any) => p.id))
  const orgIds = new Set(projects.map((p: any) => p.organizationId ?? p.organization_id))

  let hasAccess = false
  if (plan.organization_id) {
    hasAccess = orgIds.has(plan.organization_id)
  } else if (plan.project_id) {
    hasAccess = projectIds.has(plan.project_id)
  } else if (plan.goal_id) {
    const { data: goal } = await serviceSupabase
      .from('goals')
      .select('project_id')
      .eq('id', plan.goal_id)
      .maybeSingle()
    hasAccess = Boolean(goal && projectIds.has(goal.project_id))
  } else if (plan.section_id) {
    const { data: section } = await serviceSupabase
      .from('sections')
      .select('project_id')
      .eq('id', plan.section_id)
      .maybeSingle()
    hasAccess = Boolean(section && projectIds.has(section.project_id))
  }

  return { plan, hasAccess }
}

/**
 * Validate that `userId` may attach a plan to the given owner, and return the
 * snake_case owner column + id. Exactly one owner must be provided.
 */
export const resolvePlanOwner = async (
  serviceSupabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; column: string; id: string }
  | { ok: false; code: string; message: string }
> => {
  const candidates: Array<{ column: string; id: string }> = []
  const pick = (camel: string, snake: string, column: string) => {
    const raw = (body[camel] ?? body[snake]) as unknown
    if (typeof raw === 'string' && raw.trim()) {
      candidates.push({ column, id: raw.trim() })
    }
  }
  pick('organizationId', 'organization_id', 'organization_id')
  pick('projectId', 'project_id', 'project_id')
  pick('goalId', 'goal_id', 'goal_id')
  pick('sectionId', 'section_id', 'section_id')

  if (candidates.length !== 1) {
    return {
      ok: false,
      code: 'validation_error',
      message:
        'Exactly one of organization_id, project_id, goal_id, section_id is required',
    }
  }

  const owner = candidates[0]
  const adapter = await getMobileAdapterForUser(userId)
  const projects = await adapter.getProjects()
  const projectIds = new Set(projects.map((p: any) => p.id))
  const orgIds = new Set(projects.map((p: any) => p.organizationId ?? p.organization_id))

  let ok = false
  if (owner.column === 'organization_id') {
    ok = orgIds.has(owner.id)
  } else if (owner.column === 'project_id') {
    ok = projectIds.has(owner.id)
  } else if (owner.column === 'goal_id') {
    const { data: goal } = await serviceSupabase
      .from('goals')
      .select('project_id')
      .eq('id', owner.id)
      .is('deleted_at', null)
      .maybeSingle()
    ok = Boolean(goal && projectIds.has(goal.project_id))
  } else if (owner.column === 'section_id') {
    const { data: section } = await serviceSupabase
      .from('sections')
      .select('project_id')
      .eq('id', owner.id)
      .is('deleted_at', null)
      .maybeSingle()
    ok = Boolean(section && projectIds.has(section.project_id))
  }

  if (!ok) {
    return {
      ok: false,
      code: 'owner_not_found',
      message: 'Owner not found or not accessible for current user',
    }
  }

  return { ok: true, column: owner.column, id: owner.id }
}

export const serializeMobileGoal = (
  goal: any,
  count?: { total: number; completed: number },
): MobileGoalSummary => ({
  id: goal.id,
  section_id: goal.section_id ?? null,
  project_id: goal.project_id,
  name: goal.name,
  description: goal.description ?? null,
  completed: goal.completed ?? false,
  completed_at: goal.completed_at ?? null,
  order: goal.order_index ?? null,
  task_count: count?.total ?? 0,
  completed_task_count: count?.completed ?? 0,
})

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
