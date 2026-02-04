import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { requireOrgAdmin } from '@/lib/api/authz'

type Row = Record<string, any>

const normalizeName = (value: string) => value.trim().toLowerCase()

const taskKey = (task: Row) => {
  const name = normalizeName(task.name || '')
  const dueDate = task.due_date || null
  return `${name}::${dueDate ?? ''}`
}

const buildNameMap = <T extends Row>(items: T[]) => {
  const map = new Map<string, T>()
  items.forEach(item => {
    map.set(normalizeName(item.name || ''), item)
  })
  return map
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId, supabase) => {
    try {
      const { sourceOrganizationId, targetOrganizationId } = await req.json()

      if (!sourceOrganizationId || !targetOrganizationId) {
        return createErrorResponse('Source and target organization IDs are required', 400)
      }

      if (sourceOrganizationId === targetOrganizationId) {
        return createErrorResponse('Source and target organizations must be different', 400)
      }

      const sourceAuthz = await requireOrgAdmin(supabase, userId, sourceOrganizationId)
      const targetAuthz = await requireOrgAdmin(supabase, userId, targetOrganizationId)

      if (!sourceAuthz.authorized || !targetAuthz.authorized) {
        return createErrorResponse('Forbidden', 403)
      }

      const { data: sourceOrg, error: sourceOrgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', sourceOrganizationId)
        .single()

      if (sourceOrgError || !sourceOrg) {
        return createErrorResponse('Source organization not found', 404)
      }

      const { data: targetOrg, error: targetOrgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', targetOrganizationId)
        .single()

      if (targetOrgError || !targetOrg) {
        return createErrorResponse('Target organization not found', 404)
      }

      const payload = {
        version: 1,
        sourceOrganizationId,
        targetOrganizationId,
        updates: [] as Array<{ table: string; id: string; before: Row; after: Row }>,
        deletes: [] as Array<{ table: string; row: Row }>,
        inserts: [] as Array<{ table: string; row: Row }>
      }

      const { data: sourceProjects, error: sourceProjectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', sourceOrganizationId)

      if (sourceProjectsError) {
        return createErrorResponse(sourceProjectsError.message, 500)
      }

      const { data: targetProjects, error: targetProjectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('organization_id', targetOrganizationId)

      if (targetProjectsError) {
        return createErrorResponse(targetProjectsError.message, 500)
      }

      const targetProjectMap = buildNameMap(targetProjects || [])

      const mergeTaskDuplicates = async (sourceTask: Row, targetTask: Row) => {
        const { data: sourceTags } = await supabase
          .from('task_tags')
          .select('*')
          .eq('task_id', sourceTask.id)

        const { data: targetTags } = await supabase
          .from('task_tags')
          .select('*')
          .eq('task_id', targetTask.id)

        const targetTagIds = new Set((targetTags || []).map(tag => tag.tag_id))

        for (const tag of sourceTags || []) {
          if (!targetTagIds.has(tag.tag_id)) {
            const insertRow = { task_id: targetTask.id, tag_id: tag.tag_id }
            const { error } = await supabase
              .from('task_tags')
              .insert(insertRow)
            if (!error) {
              payload.inserts.push({ table: 'task_tags', row: insertRow })
            }
          }
        }

        ;(sourceTags || []).forEach(tag => {
          payload.deletes.push({ table: 'task_tags', row: tag })
        })

        payload.deletes.push({ table: 'tasks', row: sourceTask })
        await supabase.from('tasks').delete().eq('id', sourceTask.id)
      }

      const moveTask = async (task: Row, targetProjectId: string, targetSectionId: string | null) => {
        const before = { ...task }
        const updates: Row = {
          project_id: targetProjectId,
          section_id: targetSectionId
        }

        await supabase
          .from('tasks')
          .update(updates)
          .eq('id', task.id)

        payload.updates.push({
          table: 'tasks',
          id: task.id,
          before,
          after: { ...before, ...updates }
        })
      }

      for (const sourceProject of sourceProjects || []) {
        const targetProject = targetProjectMap.get(normalizeName(sourceProject.name || ''))

        if (!targetProject) {
          const before = { ...sourceProject }
          const updates = { organization_id: targetOrganizationId }
          await supabase
            .from('projects')
            .update(updates)
            .eq('id', sourceProject.id)
          payload.updates.push({
            table: 'projects',
            id: sourceProject.id,
            before,
            after: { ...before, ...updates }
          })
          continue
        }

        const { data: sourceSections } = await supabase
          .from('sections')
          .select('*')
          .eq('project_id', sourceProject.id)

        const { data: targetSections } = await supabase
          .from('sections')
          .select('*')
          .eq('project_id', targetProject.id)

        const targetSectionMap = buildNameMap(targetSections || [])

        for (const sourceSection of sourceSections || []) {
          const targetSection = targetSectionMap.get(normalizeName(sourceSection.name || ''))

          if (!targetSection) {
            const before = { ...sourceSection }
            const updates = { project_id: targetProject.id }
            await supabase
              .from('sections')
              .update(updates)
              .eq('id', sourceSection.id)
            payload.updates.push({
              table: 'sections',
              id: sourceSection.id,
              before,
              after: { ...before, ...updates }
            })
            continue
          }

          const { data: sourceTasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('section_id', sourceSection.id)

          const { data: targetTasks } = await supabase
            .from('tasks')
            .select('*')
            .eq('section_id', targetSection.id)

          const targetTaskMap = new Map<string, Row>()
          ;(targetTasks || []).forEach(task => targetTaskMap.set(taskKey(task), task))

          for (const sourceTask of sourceTasks || []) {
            const dup = targetTaskMap.get(taskKey(sourceTask))
            if (dup) {
              await mergeTaskDuplicates(sourceTask, dup)
            } else {
              await moveTask(sourceTask, targetProject.id, targetSection.id)
            }
          }

          payload.deletes.push({ table: 'sections', row: sourceSection })
          await supabase.from('sections').delete().eq('id', sourceSection.id)
        }

        const { data: sourceProjectTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('project_id', sourceProject.id)
          .is('section_id', null)

        const { data: targetProjectTasks } = await supabase
          .from('tasks')
          .select('*')
          .eq('project_id', targetProject.id)
          .is('section_id', null)

        const targetProjectTaskMap = new Map<string, Row>()
        ;(targetProjectTasks || []).forEach(task => targetProjectTaskMap.set(taskKey(task), task))

        for (const sourceTask of sourceProjectTasks || []) {
          const dup = targetProjectTaskMap.get(taskKey(sourceTask))
          if (dup) {
            await mergeTaskDuplicates(sourceTask, dup)
          } else {
            await moveTask(sourceTask, targetProject.id, null)
          }
        }

        payload.deletes.push({ table: 'projects', row: sourceProject })
        await supabase.from('projects').delete().eq('id', sourceProject.id)
      }

      const { data: sourceMembers } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', sourceOrganizationId)

      const { data: targetMembers } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', targetOrganizationId)

      const targetMemberIds = new Set((targetMembers || []).map(row => row.user_id))

      for (const member of sourceMembers || []) {
        payload.deletes.push({ table: 'user_organizations', row: member })
        if (!targetMemberIds.has(member.user_id)) {
          const insertRow = {
            user_id: member.user_id,
            organization_id: targetOrganizationId,
            is_owner: false
          }
          const { error } = await supabase
            .from('user_organizations')
            .insert(insertRow)
          if (!error) {
            payload.inserts.push({ table: 'user_organizations', row: insertRow })
          }
        }
      }

      payload.deletes.push({ table: 'organizations', row: sourceOrg })
      await supabase.from('organizations').delete().eq('id', sourceOrganizationId)

      const { data: mergeEvent, error: mergeEventError } = await supabase
        .from('merge_events')
        .insert({
          created_by: userId,
          source_organization_id: sourceOrganizationId,
          target_organization_id: targetOrganizationId,
          status: 'completed',
          payload
        })
        .select()
        .single()

      if (mergeEventError) {
        return createErrorResponse(mergeEventError.message, 500)
      }

      return createApiResponse({
        success: true,
        mergeEventId: mergeEvent.id
      })
    } catch (error: any) {
      return createErrorResponse(error?.message || 'Failed to merge organization', 500)
    }
  })
}
