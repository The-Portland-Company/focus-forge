type RecordShape = Record<string, any>

function pickDefined<T extends RecordShape>(input: T) {
  const output: RecordShape = {}
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      output[key] = value
    }
  })
  return output
}

export function mapOrganizationFromDb(row: RecordShape) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description ?? null,
    archived: row.archived ?? null,
    order: row.order_index ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  }
}

export function mapOrganizationToDb(input: RecordShape) {
  return pickDefined({
    name: input.name,
    color: input.color,
    description: input.description,
    archived: input.archived,
    order_index: input.order,
    created_at: input.createdAt,
    updated_at: input.updatedAt
  })
}

export function mapProjectFromDb(row: RecordShape) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description ?? null,
    archived: row.archived ?? null,
    budget: row.budget ?? null,
    deadline: row.deadline ?? null,
    isFavorite: row.is_favorite ?? null,
    organizationId: row.organization_id ?? null,
    order: row.order_index ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    todoistId: row.todoist_id ?? null,
    todoistParentId: row.todoist_parent_id ?? null,
    todoistChildOrder: row.todoist_child_order ?? null,
    todoistShared: row.todoist_shared ?? null,
    todoistViewStyle: row.todoist_view_style ?? null,
    todoistIsFavorite: row.todoist_is_favorite ?? null,
    todoistIsArchived: row.todoist_is_archived ?? null,
    todoistIsDeleted: row.todoist_is_deleted ?? null,
    todoistSyncId: row.todoist_sync_id ?? null,
    todoistSyncToken: row.todoist_sync_token ?? null,
    todoistCollapsed: row.todoist_collapsed ?? null,
    lastTodoistSync: row.last_todoist_sync ?? null
  }
}

export function mapProjectToDb(input: RecordShape) {
  return pickDefined({
    name: input.name,
    color: input.color,
    description: input.description,
    archived: input.archived,
    budget: input.budget,
    deadline: input.deadline,
    is_favorite: input.isFavorite,
    organization_id: input.organizationId,
    order_index: input.order,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    todoist_id: input.todoistId,
    todoist_parent_id: input.todoistParentId,
    todoist_child_order: input.todoistChildOrder,
    todoist_shared: input.todoistShared,
    todoist_view_style: input.todoistViewStyle,
    todoist_is_favorite: input.todoistIsFavorite,
    todoist_is_archived: input.todoistIsArchived,
    todoist_is_deleted: input.todoistIsDeleted,
    todoist_sync_id: input.todoistSyncId,
    todoist_sync_token: input.todoistSyncToken,
    todoist_collapsed: input.todoistCollapsed,
    last_todoist_sync: input.lastTodoistSync
  })
}

export function mapTaskFromDb(row: RecordShape) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    dueDate: row.due_date ?? null,
    dueTime: row.due_time ?? null,
    priority: row.priority ?? null,
    completed: row.completed ?? null,
    completedAt: row.completed_at ?? null,
    deadline: row.deadline ?? null,
    projectId: row.project_id ?? null,
    sectionId: row.section_id ?? null,
    parentId: row.parent_id ?? null,
    assignedTo: row.assigned_to ?? null,
    indent: row.indent ?? null,
    recurringPattern: row.recurring_pattern ?? null,
    isRecurring: row.is_recurring ?? null,
    todoistId: row.todoist_id ?? null,
    todoistOrder: row.todoist_order ?? null,
    todoistChildOrder: row.todoist_child_order ?? null,
    todoistLabels: row.todoist_labels ?? null,
    todoistUrl: row.todoist_url ?? null,
    todoistCommentCount: row.todoist_comment_count ?? null,
    todoistAssigneeId: row.todoist_assignee_id ?? null,
    todoistAssignerId: row.todoist_assigner_id ?? null,
    todoistDurationAmount: row.todoist_duration_amount ?? null,
    todoistDurationUnit: row.todoist_duration_unit ?? null,
    todoistCollapsed: row.todoist_collapsed ?? null,
    todoistSyncToken: row.todoist_sync_token ?? null,
    lastTodoistSync: row.last_todoist_sync ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    tags: Array.isArray(row.task_tags) ? row.task_tags.map((tag: RecordShape) => tag.tag_id) : []
  }
}

export function mapTaskToDb(input: RecordShape) {
  return pickDefined({
    name: input.name,
    description: input.description,
    due_date: input.dueDate,
    due_time: input.dueTime,
    priority: input.priority,
    completed: input.completed,
    completed_at: input.completedAt,
    deadline: input.deadline,
    project_id: input.projectId,
    section_id: input.sectionId,
    parent_id: input.parentId,
    assigned_to: input.assignedTo,
    indent: input.indent,
    recurring_pattern: input.recurringPattern,
    is_recurring: input.isRecurring,
    todoist_id: input.todoistId,
    todoist_order: input.todoistOrder,
    todoist_child_order: input.todoistChildOrder,
    todoist_labels: input.todoistLabels,
    todoist_url: input.todoistUrl,
    todoist_comment_count: input.todoistCommentCount,
    todoist_assignee_id: input.todoistAssigneeId,
    todoist_assigner_id: input.todoistAssignerId,
    todoist_duration_amount: input.todoistDurationAmount,
    todoist_duration_unit: input.todoistDurationUnit,
    todoist_collapsed: input.todoistCollapsed,
    todoist_sync_token: input.todoistSyncToken,
    last_todoist_sync: input.lastTodoistSync,
    created_at: input.createdAt,
    updated_at: input.updatedAt
  })
}

export function mapTagFromDb(row: RecordShape) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    todoistId: row.todoist_id ?? null,
    todoistOrder: row.todoist_order ?? null,
    todoistIsFavorite: row.todoist_is_favorite ?? null,
    todoistIsDeleted: row.todoist_is_deleted ?? null,
    createdAt: row.created_at ?? null
  }
}

export function mapTagToDb(input: RecordShape) {
  return pickDefined({
    name: input.name,
    color: input.color,
    todoist_id: input.todoistId,
    todoist_order: input.todoistOrder,
    todoist_is_favorite: input.todoistIsFavorite,
    todoist_is_deleted: input.todoistIsDeleted,
    created_at: input.createdAt
  })
}

export function mapSectionFromDb(row: RecordShape) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id ?? null,
    order: row.todoist_order ?? null,
    todoistId: row.todoist_id ?? null,
    todoistCollapsed: row.todoist_collapsed ?? null,
    isArchived: row.is_archived ?? null,
    isDeleted: row.is_deleted ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  }
}

export function mapSectionToDb(input: RecordShape) {
  return pickDefined({
    name: input.name,
    project_id: input.projectId,
    todoist_order: input.order,
    todoist_id: input.todoistId,
    todoist_collapsed: input.todoistCollapsed,
    is_archived: input.isArchived,
    is_deleted: input.isDeleted,
    created_at: input.createdAt,
    updated_at: input.updatedAt
  })
}

export function mapCommentFromDb(row: RecordShape) {
  return {
    id: row.id,
    content: row.content,
    taskId: row.task_id ?? null,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    isDeleted: row.is_deleted ?? null,
    todoistId: row.todoist_id ?? null,
    todoistPostedAt: row.todoist_posted_at ?? null,
    todoistAttachment: row.todoist_attachment ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  }
}

export function mapCommentToDb(input: RecordShape) {
  return pickDefined({
    content: input.content,
    task_id: input.taskId,
    project_id: input.projectId,
    user_id: input.userId,
    is_deleted: input.isDeleted,
    todoist_id: input.todoistId,
    todoist_posted_at: input.todoistPostedAt,
    todoist_attachment: input.todoistAttachment,
    created_at: input.createdAt,
    updated_at: input.updatedAt
  })
}
