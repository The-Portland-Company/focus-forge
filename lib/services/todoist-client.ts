// Todoist API Client
// Handles all direct communication with Todoist API

import { 
  TodoistApiTask, 
  TodoistApiProject, 
  TodoistApiLabel,
  TodoistApiComment,
  TodoistApiSection,
  TodoistApiFilter,
  TodoistSyncResponse,
  TodoistCommand,
  TodoistSyncRequest
} from '../todoist-types'

export class TodoistClient {
  private apiToken: string
  private baseUrl = 'https://api.todoist.com'
  private syncUrl = `${this.baseUrl}/sync/v9/sync`
  private restUrl = `${this.baseUrl}/rest/v2`

  constructor(apiToken: string) {
    const trimmed = apiToken?.trim()
    if (!trimmed) {
      throw new Error('Todoist API token is required')
    }
    this.apiToken = trimmed
  }

  // ==================== Sync API Methods ====================

  /**
   * Perform a sync operation with Todoist
   * @param syncToken - Use '*' for full sync
   * @param resourceTypes - Optional array of resource types to sync
   * @param commands - Optional array of commands to execute
   */
  async sync(
    syncToken: string = '*',
    resourceTypes?: string[],
    commands?: TodoistCommand[]
  ): Promise<TodoistSyncResponse> {
    const body: TodoistSyncRequest = {
      sync_token: syncToken,
      ...(resourceTypes && { resource_types: resourceTypes }),
      ...(commands && { commands })
    }

    const response = await fetch(this.syncUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Todoist sync failed: ${response.status} - ${error}`)
    }

    return response.json()
  }

  /**
   * Perform initial full sync
   */
  async fullSync(): Promise<TodoistSyncResponse> {
    return this.sync('*')
  }

  /**
   * Perform incremental sync with provided token
   */
  async incrementalSync(syncToken: string): Promise<TodoistSyncResponse> {
    if (!syncToken || syncToken === '*') {
      throw new Error('Valid sync token required for incremental sync')
    }
    return this.sync(syncToken)
  }

  // ==================== REST API Methods ====================

  // Tasks
  async getTasks(filter?: { project_id?: string; label?: string; filter?: string }): Promise<TodoistApiTask[]> {
    const params = new URLSearchParams(filter as any)
    const response = await this.restRequest(`/tasks?${params}`)
    return response
  }

  async getTask(taskId: string): Promise<TodoistApiTask> {
    return this.restRequest(`/tasks/${taskId}`)
  }

  async createTask(task: Partial<TodoistApiTask>): Promise<TodoistApiTask> {
    return this.restRequest('/tasks', 'POST', task)
  }

  async updateTask(taskId: string, updates: Partial<TodoistApiTask>): Promise<TodoistApiTask> {
    return this.restRequest(`/tasks/${taskId}`, 'POST', updates)
  }

  async closeTask(taskId: string): Promise<void> {
    return this.restRequest(`/tasks/${taskId}/close`, 'POST')
  }

  async reopenTask(taskId: string): Promise<void> {
    return this.restRequest(`/tasks/${taskId}/reopen`, 'POST')
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.restRequest(`/tasks/${taskId}`, 'DELETE')
  }

  // Projects
  async getProjects(): Promise<TodoistApiProject[]> {
    return this.restRequest('/projects')
  }

  async getProject(projectId: string): Promise<TodoistApiProject> {
    return this.restRequest(`/projects/${projectId}`)
  }

  async createProject(project: Partial<TodoistApiProject>): Promise<TodoistApiProject> {
    return this.restRequest('/projects', 'POST', project)
  }

  async updateProject(projectId: string, updates: Partial<TodoistApiProject>): Promise<TodoistApiProject> {
    return this.restRequest(`/projects/${projectId}`, 'POST', updates)
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.restRequest(`/projects/${projectId}`, 'DELETE')
  }

  // Labels
  async getLabels(): Promise<TodoistApiLabel[]> {
    return this.restRequest('/labels')
  }

  async getLabel(labelId: string): Promise<TodoistApiLabel> {
    return this.restRequest(`/labels/${labelId}`)
  }

  async createLabel(label: Partial<TodoistApiLabel>): Promise<TodoistApiLabel> {
    return this.restRequest('/labels', 'POST', label)
  }

  async updateLabel(labelId: string, updates: Partial<TodoistApiLabel>): Promise<TodoistApiLabel> {
    return this.restRequest(`/labels/${labelId}`, 'POST', updates)
  }

  async deleteLabel(labelId: string): Promise<void> {
    return this.restRequest(`/labels/${labelId}`, 'DELETE')
  }

  // Comments
  async getComments(taskId?: string, projectId?: string): Promise<TodoistApiComment[]> {
    const params = new URLSearchParams()
    if (taskId) params.append('task_id', taskId)
    if (projectId) params.append('project_id', projectId)
    return this.restRequest(`/comments?${params}`)
  }

  async createComment(comment: { 
    content: string
    task_id?: string
    project_id?: string
    attachment?: any 
  }): Promise<TodoistApiComment> {
    return this.restRequest('/comments', 'POST', comment)
  }

  async updateComment(commentId: string, content: string): Promise<TodoistApiComment> {
    return this.restRequest(`/comments/${commentId}`, 'POST', { content })
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.restRequest(`/comments/${commentId}`, 'DELETE')
  }

  // Sections
  async getSections(projectId?: string): Promise<TodoistApiSection[]> {
    const params = projectId ? `?project_id=${projectId}` : ''
    return this.restRequest(`/sections${params}`)
  }

  async getSection(sectionId: string): Promise<TodoistApiSection> {
    return this.restRequest(`/sections/${sectionId}`)
  }

  async createSection(section: { 
    name: string
    project_id: string
    order?: number 
  }): Promise<TodoistApiSection> {
    return this.restRequest('/sections', 'POST', section)
  }

  async updateSection(sectionId: string, updates: Partial<TodoistApiSection>): Promise<TodoistApiSection> {
    return this.restRequest(`/sections/${sectionId}`, 'POST', updates)
  }

  async deleteSection(sectionId: string): Promise<void> {
    return this.restRequest(`/sections/${sectionId}`, 'DELETE')
  }

  // ==================== Helper Methods ====================

  private async restRequest(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      }
    }

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(`${this.restUrl}${endpoint}`, options)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Todoist API error: ${response.status} - ${error}`)
    }

    // DELETE requests return no content
    if (method === 'DELETE') {
      return
    }

    return response.json()
  }

  /**
   * Generate a unique UUID for commands
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Generate a temporary ID for new resources
   */
  generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Build a command for the Sync API
   */
  buildCommand(type: string, args: Record<string, any>, tempId?: string): TodoistCommand {
    return {
      type,
      uuid: this.generateUUID(),
      ...(tempId && { temp_id: tempId }),
      args
    }
  }

  /**
   * Check if user has premium features
   */
  async checkPremiumStatus(): Promise<boolean> {
    try {
      const syncResponse = await this.sync('*', ['user'])
      return syncResponse.user?.is_premium || false
    } catch (error) {
      console.error('Failed to check premium status:', error)
      return false
    }
  }

  /**
   * Get user information
   */
  async getUserInfo() {
    const syncResponse = await this.sync('*', ['user'])
    return syncResponse.user
  }
}
