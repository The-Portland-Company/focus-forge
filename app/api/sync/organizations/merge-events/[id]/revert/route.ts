import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'

type Row = Record<string, any>

const orderedTables = ['organizations', 'projects', 'sections', 'tasks', 'task_tags', 'user_organizations']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, userId) => {
    try {
      const supabase = await createClient()
      const { data: mergeEventRaw, error } = await supabase
        .from('merge_events' as any)
        .select('*')
        .eq('id', id)
        .single()

      const mergeEvent = mergeEventRaw as any

      if (error || !mergeEvent) {
        return createErrorResponse('Merge event not found', 404)
      }

      if (mergeEvent.status === 'reverted') {
        return createErrorResponse('Merge already reverted', 400)
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      const isAdmin = profile?.role && ['admin', 'super_admin'].includes(profile.role)
      if (!isAdmin && mergeEvent.created_by !== userId) {
        return createErrorResponse('Forbidden', 403)
      }

      const payload = mergeEvent.payload as {
        updates?: Array<{ table: string; id: string; before: Row; after: Row }>
        deletes?: Array<{ table: string; row: Row }>
        inserts?: Array<{ table: string; row: Row }>
      }

      const inserts = payload.inserts || []
      const deletes = payload.deletes || []
      const updates = payload.updates || []

      for (const insert of inserts) {
        if (insert.table === 'task_tags') {
          await supabase
            .from('task_tags')
            .delete()
            .eq('task_id', insert.row.task_id)
            .eq('tag_id', insert.row.tag_id)
        } else if (insert.table === 'user_organizations') {
          await supabase
            .from('user_organizations')
            .delete()
            .eq('user_id', insert.row.user_id)
            .eq('organization_id', insert.row.organization_id)
        } else {
          await supabase
            .from(insert.table as any)
            .delete()
            .eq('id', insert.row.id)
        }
      }

      for (const table of orderedTables) {
        const rows = deletes.filter(entry => entry.table === table).map(entry => entry.row)
        if (rows.length === 0) continue

        const { error: insertError } = await supabase
          .from(table as any)
          .upsert(rows, { onConflict: 'id' })

        if (insertError) {
          return createErrorResponse(insertError.message, 500)
        }
      }

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from(update.table as any)
          .update(update.before)
          .eq('id', update.id)

        if (updateError) {
          return createErrorResponse(updateError.message, 500)
        }
      }

      const { error: statusError } = await supabase
        .from('merge_events' as any)
        .update({ status: 'reverted' })
        .eq('id', mergeEvent.id)

      if (statusError) {
        return createErrorResponse(statusError.message, 500)
      }

      return createApiResponse({ success: true })
    } catch (error: any) {
      return createErrorResponse(error?.message || 'Failed to revert merge', 500)
    }
  })
}
