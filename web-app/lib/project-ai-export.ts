import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { SupabaseAdapter } from "@/lib/db/supabase-adapter"
import { richTextToPlainText } from "@/lib/rich-text"

type ExportCommentRow = {
  id: string
  content: string | null
  task_id: string | null
  project_id: string | null
  user_id: string | null
  created_at: string | null
  updated_at: string | null
  todoist_attachment?: unknown
  author_name?: string | null
  author_email?: string | null
}

type ExportSectionRow = {
  id: string
  name: string
  project_id: string
  parent_id: string | null
  color: string | null
  description: string | null
  icon: string | null
  order_index: number | null
  todoist_order: number | null
  created_at: string
  updated_at: string
}

type ExportTaskSectionRow = {
  id: string
  task_id: string
  section_id: string
  created_at: string
}

export type ProjectAiExport = ReturnType<typeof buildProjectAiExport>

export function buildProjectAiExport(input: {
  exportedAt: string
  project: any
  sections: ExportSectionRow[]
  taskSections: ExportTaskSectionRow[]
  tasks: any[]
  comments: ExportCommentRow[]
}) {
  const sectionMap = new Map(
    input.sections.map((section) => [
      section.id,
      {
        id: section.id,
        name: section.name,
        parentId: section.parent_id,
        color: section.color,
        description: section.description,
        descriptionPlainText: richTextToPlainText(section.description),
        icon: section.icon,
        order: section.order_index ?? section.todoist_order ?? 0,
        createdAt: section.created_at,
        updatedAt: section.updated_at,
      },
    ]),
  )

  const taskSectionMap = new Map<string, string[]>()
  for (const row of input.taskSections) {
    const taskSections = taskSectionMap.get(row.task_id) || []
    taskSections.push(row.section_id)
    taskSectionMap.set(row.task_id, taskSections)
  }

  const commentsByTaskId = new Map<string, ReturnType<typeof serializeComment>[]>()
  const projectComments: ReturnType<typeof serializeComment>[] = []

  for (const comment of input.comments) {
    const serialized = serializeComment(comment)
    if (comment.task_id) {
      const taskComments = commentsByTaskId.get(comment.task_id) || []
      taskComments.push(serialized)
      commentsByTaskId.set(comment.task_id, taskComments)
    } else {
      projectComments.push(serialized)
    }
  }

  const serializedTasks = [...input.tasks]
    .sort((left, right) => {
      const leftCompleted = Boolean(left.completed)
      const rightCompleted = Boolean(right.completed)
      if (leftCompleted !== rightCompleted) return Number(leftCompleted) - Number(rightCompleted)

      const leftCreated = Date.parse(left.createdAt || left.created_at || "") || 0
      const rightCreated = Date.parse(right.createdAt || right.created_at || "") || 0
      return leftCreated - rightCreated
    })
    .map((task) => {
      const sectionIds = taskSectionMap.get(task.id) || []
      const sectionRefs = sectionIds
        .map((sectionId) => sectionMap.get(sectionId))
        .filter(Boolean)

      const files = ((task.files || task.attachments || []) as any[]).map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        type: file.type,
        mimeType: file.mime_type ?? file.mimeType ?? null,
        sizeBytes: file.size_bytes ?? file.sizeBytes ?? null,
        thumbnailUrl: file.thumbnail_url ?? file.thumbnailUrl ?? null,
        storageProvider: file.storage_provider ?? file.storageProvider ?? null,
      }))

      const description = task.description || null
      const comments = commentsByTaskId.get(task.id) || []

      return {
        id: task.id,
        name: task.name,
        description,
        descriptionPlainText: richTextToPlainText(description),
        completed: Boolean(task.completed),
        priority: task.priority,
        projectId: task.projectId || task.project_id,
        dueDate: task.dueDate || task.due_date || null,
        dueTime: task.dueTime || task.due_time || null,
        deadline: task.deadline || null,
        startDate: task.startDate || task.start_date || null,
        startTime: task.startTime || task.start_time || null,
        endDate: task.endDate || task.end_date || null,
        endTime: task.endTime || task.end_time || null,
        assignedTo: task.assignedTo || task.assigned_to || null,
        assignedToName: task.assignedToName || null,
        createdBy: task.createdBy || task.created_by || null,
        parentId: task.parentId || task.parent_id || null,
        sectionIds,
        sections: sectionRefs,
        tags: Array.isArray(task.tags) ? task.tags : [],
        reminders: Array.isArray(task.reminders) ? task.reminders : [],
        recurringPattern: task.recurringPattern || task.recurring_pattern || null,
        timeEstimate: task.timeEstimate || task.time_estimate || null,
        todoistUrl: task.todoistUrl || task.todoist_url || null,
        todoistCommentCount: task.todoistCommentCount || task.todoist_comment_count || 0,
        createdAt: task.createdAt || task.created_at,
        updatedAt: task.updatedAt || task.updated_at,
        completedAt: task.completedAt || task.completed_at || null,
        files,
        fileLinks: files.map((file) => file.url).filter(Boolean),
        comments,
        commentCount: comments.length,
      }
    })

  return {
    exportedAt: input.exportedAt,
    project: {
      id: input.project.id,
      name: input.project.name,
      color: input.project.color,
      organizationId: input.project.organizationId || input.project.organization_id,
      description: input.project.description || null,
      descriptionPlainText: richTextToPlainText(input.project.description),
      archived: Boolean(input.project.archived),
      budget: input.project.budget ?? null,
      deadline: input.project.deadline ?? null,
      ownerId: input.project.ownerId || input.project.owner_id || null,
      memberIds: input.project.memberIds || [],
      createdAt: input.project.createdAt || input.project.created_at,
      updatedAt: input.project.updatedAt || input.project.updated_at,
    },
    summary: {
      sectionCount: input.sections.length,
      taskCount: serializedTasks.length,
      completedTaskCount: serializedTasks.filter((task) => task.completed).length,
      activeTaskCount: serializedTasks.filter((task) => !task.completed).length,
      taskCommentCount: serializedTasks.reduce(
        (sum, task) => sum + task.commentCount,
        0,
      ),
      projectCommentCount: projectComments.length,
      fileCount: serializedTasks.reduce((sum, task) => sum + task.files.length, 0),
    },
    sections: [...sectionMap.values()].sort((left, right) => left.order - right.order),
    projectComments,
    tasks: serializedTasks,
  }
}

function serializeComment(comment: ExportCommentRow) {
  const content = comment.content || ""

  return {
    id: comment.id,
    taskId: comment.task_id,
    projectId: comment.project_id,
    userId: comment.user_id,
    authorName: comment.author_name || null,
    authorEmail: comment.author_email || null,
    content,
    contentPlainText: richTextToPlainText(content),
    todoistAttachment: comment.todoist_attachment ?? null,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  }
}

export async function getProjectAiExportForUser(projectId: string, userId: string) {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  const adapter = new SupabaseAdapter(admin as any, userId)
  const projects = await adapter.getProjects()
  const project = projects.find((candidate: { id: string }) => candidate.id === projectId)

  if (!project) {
    return null
  }

  const tasks = await adapter.getTasks(projectId)
  const taskIds = tasks.map((task: { id: string }) => task.id).filter(Boolean)

  const [{ data: sectionRows, error: sectionError }, { data: taskSectionRows, error: taskSectionError }, { data: projectCommentRows, error: projectCommentError }, { data: taskCommentRows, error: taskCommentError }] =
    await Promise.all([
      admin
        .from("sections")
        .select("*")
        .eq("project_id", projectId)
        .order("todoist_order", { ascending: true })
        .order("created_at", { ascending: true }),
      taskIds.length
        ? admin
            .from("task_sections")
            .select("*")
            .in("task_id", taskIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("comments")
        .select("id, content, task_id, project_id, user_id, created_at, updated_at, todoist_attachment")
        .eq("is_deleted", false)
        .eq("project_id", projectId)
        .is("task_id", null)
        .order("created_at", { ascending: true }),
      taskIds.length
        ? admin
            .from("comments")
            .select("id, content, task_id, project_id, user_id, created_at, updated_at, todoist_attachment")
            .eq("is_deleted", false)
            .in("task_id", taskIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ])

  if (sectionError) throw sectionError
  if (taskSectionError) throw taskSectionError
  if (projectCommentError) throw projectCommentError
  if (taskCommentError) throw taskCommentError

  const rawComments = Array.from(
    new Map(
      [
        ...((projectCommentRows || []) as ExportCommentRow[]),
        ...((taskCommentRows || []) as ExportCommentRow[]),
      ].map((comment) => [comment.id, comment]),
    ).values(),
  )
  const userIds = Array.from(
    new Set(
      rawComments
        .map((comment) => comment.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  )

  const profileMap = new Map<string, { author_name: string | null; author_email: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds)

    if (profilesError) throw profilesError

    for (const profile of profiles || []) {
      const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
      profileMap.set(String(profile.id), {
        author_name: name || profile.email || null,
        author_email: profile.email || null,
      })
    }
  }

  const comments = rawComments.map((row) => {
    const profile = row.user_id ? profileMap.get(row.user_id) : undefined
    return {
      ...row,
      author_name: profile?.author_name || null,
      author_email: profile?.author_email || null,
    }
  })

  return buildProjectAiExport({
    exportedAt: new Date().toISOString(),
    project,
    sections: (sectionRows || []) as ExportSectionRow[],
    taskSections: (taskSectionRows || []) as ExportTaskSectionRow[],
    tasks,
    comments,
  })
}
