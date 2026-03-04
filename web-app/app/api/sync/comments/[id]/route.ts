import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  verifyMobileAccessTokenOrPat,
} from '@/lib/mobile/api'
import { createApiResponse, createErrorResponse } from '@/lib/api/auth'

type CommentRow = {
  id: string
  user_id: string | null
  [key: string]: any
}

const enrichCommentWithAuthor = async (comment: CommentRow) => {
  if (!comment?.user_id) {
    return {
      ...comment,
      author_name: null,
      author_memoji: null,
      author_email: null,
    }
  }

  const admin = getAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, profile_memoji')
    .eq('id', comment.user_id)
    .maybeSingle()

  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()

  return {
    ...comment,
    author_name: name || profile?.email || null,
    author_memoji: profile?.profile_memoji || null,
    author_email: profile?.email || null,
  }
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

const canAccessComment = async (comment: any, userId: string) => {
  const { visibleUserIds, visibleProjectIds } = await getAccessScope(userId)

  if (comment.user_id && visibleUserIds.includes(String(comment.user_id))) return true
  if (comment.project_id && visibleProjectIds.has(String(comment.project_id))) return true

  if (comment.task_id) {
    const admin = getAdminClient()
    const { data: task } = await admin
      .from('tasks')
      .select('id, project_id, assigned_to')
      .eq('id', comment.task_id)
      .maybeSingle()

    if (!task) return false
    if (task.project_id && visibleProjectIds.has(String(task.project_id))) return true
    if (task.assigned_to && visibleUserIds.includes(String(task.assigned_to))) return true
  }

  return false
}

const getCommentById = async (id: string) => {
  const admin = getAdminClient()
  const { data: comment, error } = await admin
    .from('comments')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle()

  if (error) throw error
  return comment
}

// GET /api/sync/comments/[id] - Get single comment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get('authorization'),
    ['read', 'write', 'admin'],
  )
  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const { id } = await params
  const comment = await getCommentById(id)
  if (!comment) {
    return createErrorResponse('Comment not found', 404)
  }

  if (!(await canAccessComment(comment, auth.user.id))) {
    return createErrorResponse('Forbidden', 403)
  }

  const enrichedComment = await enrichCommentWithAuthor(comment as CommentRow)
  return createApiResponse(enrichedComment)
}

// PUT /api/sync/comments/[id] - Update comment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get('authorization'),
    ['write', 'admin'],
  )
  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const { id } = await params
  const userId = auth.user.id
  const admin = getAdminClient()

  try {
    const body = await request.json()
    const content = String(body?.content || '').trim()
    if (!content) {
      return createErrorResponse('Content is required', 400)
    }

    const comment = await getCommentById(id)
    if (!comment) {
      return createErrorResponse('Comment not found or unauthorized', 404)
    }
    if (String(comment.user_id || '') !== userId) {
      return createErrorResponse('Comment not found or unauthorized', 404)
    }

    const { data: updated, error } = await admin
      .from('comments')
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error || !updated) {
      return createErrorResponse(error?.message || 'Comment not found or unauthorized', 404)
    }

    const enrichedComment = await enrichCommentWithAuthor(updated as CommentRow)
    return createApiResponse(enrichedComment)
  } catch (error) {
    return createErrorResponse('Invalid request body', 400)
  }
}

// DELETE /api/sync/comments/[id] - Soft delete comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get('authorization'),
    ['write', 'admin'],
  )
  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status })
  }

  const { id } = await params
  const userId = auth.user.id
  const admin = getAdminClient()

  const comment = await getCommentById(id)
  if (!comment || String(comment.user_id || '') !== userId) {
    return createErrorResponse('Comment not found or unauthorized', 404)
  }

  const { data: updated, error } = await admin
    .from('comments')
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !updated) {
    return createErrorResponse(error?.message || 'Comment not found or unauthorized', 404)
  }

  return createApiResponse({ success: true }, 200)
}
