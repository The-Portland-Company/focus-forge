import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'
import { createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { normalizeRichText } from '@/lib/rich-text-sanitize'

type CommentRow = {
  id: string
  user_id: string | null
  [key: string]: any
}

type AuthorProfile = {
  author_name: string | null
  author_memoji: string | null
  author_email: string | null
}

const enrichCommentsWithAuthors = async (comments: CommentRow[]) => {
  if (!comments.length) return comments

  const admin = getAdminClient()
  const userIds = Array.from(
    new Set(
      comments
        .map((comment) => comment.user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  if (!userIds.length) {
    return comments.map((comment) => ({
      ...comment,
      author_name: null,
      author_memoji: null,
      author_email: null,
    }))
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, profile_memoji')
    .in('id', userIds)

  const profileMap = new Map<string, AuthorProfile>(
    (profiles || []).map((profile: any) => {
      const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      return [
        String(profile.id),
        {
          author_name: name || profile.email || null,
          author_memoji: profile.profile_memoji || null,
          author_email: profile.email || null,
        },
      ]
    }),
  )

  return comments.map((comment) => {
    const profile = comment.user_id ? profileMap.get(String(comment.user_id)) : undefined
    return {
      ...comment,
      author_name: profile?.author_name || null,
      author_memoji: profile?.author_memoji || null,
      author_email: profile?.author_email || null,
    }
  })
}

const getAccessScope = async (userId: string) => {
  const visibleUserIds = await getVisibleMobileUserIds(userId)
  const projectGroups = await Promise.all(
    visibleUserIds.map(async (id) => {
      const adapter = await getMobileAdapterForUser(id)
      return adapter.getProjects()
    }),
  )

  const visibleProjectIds = new Set<string>()
  projectGroups.flat().forEach((project: any) => {
    if (project?.id) visibleProjectIds.add(String(project.id))
  })

  return { visibleUserIds, visibleProjectIds }
}

const canAccessTaskOrProject = async (
  taskId: string | null,
  projectId: string | null,
  userId: string,
) => {
  const admin = getAdminClient()
  const { visibleUserIds, visibleProjectIds } = await getAccessScope(userId)

  if (projectId && !visibleProjectIds.has(projectId)) {
    return false
  }

  if (!taskId) return true

  const { data: task } = await admin
    .from('tasks')
    .select('id, project_id, assigned_to')
    .eq('id', taskId)
    .maybeSingle()

  if (!task) return false
  if (task.project_id && visibleProjectIds.has(String(task.project_id))) return true
  if (task.assigned_to && visibleUserIds.includes(String(task.assigned_to))) return true

  return false
}

// GET /api/sync/comments - List comments
export async function GET(request: NextRequest) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get('authorization'),
    ['read', 'write', 'admin'],
  )

  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const userId = auth.user.id
  const admin = getAdminClient()
  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId')
  const projectId = url.searchParams.get('projectId')

  if (!(await canAccessTaskOrProject(taskId, projectId, userId))) {
    return createErrorResponse('Forbidden', 403)
  }

  const { visibleUserIds, visibleProjectIds } = await getAccessScope(userId)
  const visibleProjects = Array.from(visibleProjectIds)

  let query = admin
    .from('comments')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (taskId) {
    query = query.eq('task_id', taskId)
  } else if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    const filters = [`user_id.in.(${visibleUserIds.join(',')})`]
    if (visibleProjects.length > 0) {
      filters.push(`project_id.in.(${visibleProjects.join(',')})`)
    }
    query = query.or(filters.join(','))
  }

  const { data: comments, error } = await query

  if (error) {
    return createErrorResponse(error.message, 500)
  }

  const enrichedComments = await enrichCommentsWithAuthors((comments || []) as CommentRow[])
  return createApiResponse(enrichedComments)
}

// POST /api/sync/comments - Create new comment
export async function POST(request: NextRequest) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get('authorization'),
    ['write', 'admin'],
  )

  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const userId = auth.user.id
  const admin = getAdminClient()

  try {
    const body = await request.json()
    const content = normalizeRichText(body?.content)
    const taskId = typeof body?.taskId === 'string' ? body.taskId : null
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null

    if (!content || (!taskId && !projectId)) {
      return createErrorResponse('Content and either taskId or projectId are required', 400)
    }

    if (!(await canAccessTaskOrProject(taskId, projectId, userId))) {
      return createErrorResponse('Forbidden', 403)
    }

    const { data: comment, error } = await admin
      .from('comments')
      .insert({
        content,
        task_id: taskId,
        project_id: projectId,
        user_id: userId,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return createErrorResponse(error.message, 500)
    }

    const [enrichedComment] = await enrichCommentsWithAuthors([comment as CommentRow])
    return createApiResponse(enrichedComment, 201)
  } catch (error) {
    return createErrorResponse('Invalid request body', 400)
  }
}
