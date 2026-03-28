export const FOCUS_TIME_OPENAPI_SLUG = "focus-time-openapi";

export const FOCUS_TIME_OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Focus: Time API
  version: 1.0.0
  summary: Time-tracking contract for Focus: Time clients
  description: |
    Public contract for the Focus: Forge time-tracking API consumed by the separate
    Focus: Time iOS and macOS app.
servers:
  - url: https://focusforge.theportlandcompany.com
    description: Production
security:
  - sessionAuth: []
  - nativeSessionAuth: []
  - bearerAuth: []
tags:
  - name: time
  - name: docs
paths:
  /api/v1/time/prompt:
    get:
      tags: [docs]
      summary: Get the public implementation prompt
      security: []
      responses:
        '200':
          description: Prompt document
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PromptResponse'
              examples:
                default:
                  value:
                    title: Focus: Time Implementation Prompt
                    contentType: text/markdown
                    url: https://focusforge.theportlandcompany.com/docs/focus-time-agent
                    content: "# Focus: Time Implementation Prompt\\n..."
  /api/v1/time/bootstrap:
    get:
      tags: [time]
      summary: Load bootstrap entities for the authenticated user
      description: |
        Session cookies and Personal Access Tokens are supported.
        Organization-scoped time tokens are rejected for this endpoint.
      responses:
        '200':
          description: Bootstrap snapshot
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TimeTrackingBootstrap'
        '403':
          $ref: '#/components/responses/Forbidden'
  /api/v1/time/current:
    get:
      tags: [time]
      summary: Get the current running timer
      parameters:
        - in: query
          name: userId
          required: false
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Current running entry or null
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    anyOf:
                      - $ref: '#/components/schemas/TimeTrackingEntry'
                      - type: 'null'
              examples:
                running:
                  value:
                    data:
                      id: entry_123
                      organizationId: org_123
                      userId: user_123
                      projectId: proj_123
                      sectionId: sec_123
                      title: Homepage mockups
                      description: Working on header variations
                      timezone: America/Los_Angeles
                      startedAt: 2026-03-28T18:30:00.000Z
                      endedAt: null
                      createdAt: 2026-03-28T18:30:00.000Z
                      updatedAt: 2026-03-28T18:30:00.000Z
                      taskIds: [task_123, task_456]
                      source: focus_forge
                      sourceMetadata: {}
                      user:
                        id: user_123
                        name: Spencer Hill
                        email: user@example.com
                        role: admin
                      project:
                        id: proj_123
                        name: Website Redesign
                        organizationId: org_123
                      section:
                        id: sec_123
                        name: Design
                        projectId: proj_123
                      organization:
                        id: org_123
                        name: Acme
                      tasks:
                        - id: task_123
                          name: Homepage mockups
                          projectId: proj_123
                          sectionId: sec_123
                empty:
                  value:
                    data: null
  /api/v1/time/entries:
    get:
      tags: [time]
      summary: List time entries
      parameters:
        - $ref: '#/components/parameters/organizationId'
        - $ref: '#/components/parameters/projectId'
        - $ref: '#/components/parameters/sectionId'
        - $ref: '#/components/parameters/taskIds'
        - $ref: '#/components/parameters/userIds'
        - $ref: '#/components/parameters/roles'
        - $ref: '#/components/parameters/startedAfter'
        - $ref: '#/components/parameters/endedBefore'
        - $ref: '#/components/parameters/query'
      responses:
        '200':
          description: Matching time entries
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/TimeTrackingEntry'
    post:
      tags: [time]
      summary: Create a time entry
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTimeEntryRequest'
            examples:
              runningTimer:
                value:
                  organizationId: org_123
                  userId: user_123
                  projectId: proj_123
                  sectionId: sec_123
                  taskIds: [task_123, task_456]
                  title: Homepage mockups
                  description: Working on header variations
                  timezone: America/Los_Angeles
                  startedAt: 2026-03-28T18:30:00.000Z
                  endedAt: null
                  source: focus_forge
                  sourceMetadata:
                    client: ios
      responses:
        '201':
          description: Created entry
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TimeTrackingEntry'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '403':
          $ref: '#/components/responses/Forbidden'
  /api/v1/time/entries/{id}:
    get:
      tags: [time]
      summary: Fetch a time entry
      parameters:
        - $ref: '#/components/parameters/entryId'
      responses:
        '200':
          description: Requested entry
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TimeTrackingEntry'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
    patch:
      tags: [time]
      summary: Update a time entry
      parameters:
        - $ref: '#/components/parameters/entryId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateTimeEntryRequest'
            examples:
              stopTimer:
                value:
                  endedAt: 2026-03-28T19:15:00.000Z
                  sourceMetadata:
                    client: macos
      responses:
        '200':
          description: Updated entry
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TimeTrackingEntry'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
    delete:
      tags: [time]
      summary: Delete a time entry
      parameters:
        - $ref: '#/components/parameters/entryId'
      responses:
        '200':
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                required: [success]
                properties:
                  success:
                    type: boolean
              examples:
                deleted:
                  value:
                    success: true
components:
  securitySchemes:
    sessionAuth:
      type: apiKey
      in: cookie
      name: sb-<project>-auth-token
      description: Existing authenticated Focus: Forge web session
    nativeSessionAuth:
      type: apiKey
      in: header
      name: Authorization
      description: Native app session header using the format \`Session <supabase-access-token>\`
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: opaque-token
      description: |
        Supports Personal Access Tokens and organization-scoped time tokens.
  parameters:
    entryId:
      in: path
      name: id
      required: true
      schema:
        type: string
        format: uuid
    organizationId:
      in: query
      name: organizationId
      schema:
        type: string
        format: uuid
    projectId:
      in: query
      name: projectId
      schema:
        type: string
        format: uuid
    sectionId:
      in: query
      name: sectionId
      schema:
        type: string
        format: uuid
    taskIds:
      in: query
      name: taskIds
      description: Comma-separated task IDs
      schema:
        type: string
        example: task_123,task_456
    userIds:
      in: query
      name: userIds
      description: Comma-separated user IDs
      schema:
        type: string
    roles:
      in: query
      name: roles
      description: Comma-separated roles
      schema:
        type: string
        example: admin,team_member
    startedAfter:
      in: query
      name: startedAfter
      schema:
        type: string
        format: date-time
    endedBefore:
      in: query
      name: endedBefore
      schema:
        type: string
        format: date-time
    query:
      in: query
      name: query
      schema:
        type: string
  responses:
    Unauthorized:
      description: Missing or invalid authentication
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorEnvelope'
          examples:
            default:
              value:
                error:
                  code: unauthorized
                  message: Unauthorized
    Forbidden:
      description: Authenticated but not allowed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorEnvelope'
          examples:
            default:
              value:
                error:
                  code: forbidden
                  message: Forbidden.
    InvalidRequest:
      description: Bad request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorEnvelope'
          examples:
            default:
              value:
                error:
                  code: invalid_request
                  message: organizationId is required.
    NotFound:
      description: Missing resource
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorEnvelope'
          examples:
            default:
              value:
                error:
                  code: not_found
                  message: Time entry not found.
  schemas:
    ErrorEnvelope:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              enum: [unauthorized, forbidden, invalid_request, not_found, internal_error]
            message:
              type: string
    PromptResponse:
      type: object
      required: [title, contentType, url, content]
      properties:
        title:
          type: string
        contentType:
          type: string
        url:
          type: string
          format: uri
        content:
          type: string
    TimeTrackingOrganizationOption:
      type: object
      required: [id, name]
      properties:
        id:
          type: string
        name:
          type: string
    TimeTrackingProjectOption:
      type: object
      required: [id, name, organizationId]
      properties:
        id:
          type: string
        name:
          type: string
        organizationId:
          type: string
    TimeTrackingSectionOption:
      type: object
      required: [id, name, projectId]
      properties:
        id:
          type: string
        name:
          type: string
        projectId:
          type: string
    TimeTrackingTaskOption:
      type: object
      required: [id, name, projectId, sectionId]
      properties:
        id:
          type: string
        name:
          type: string
        projectId:
          anyOf:
            - type: string
            - type: 'null'
        sectionId:
          anyOf:
            - type: string
            - type: 'null'
    TimeTrackingUserOption:
      type: object
      required: [id, name, email, role]
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
        role:
          anyOf:
            - type: string
              enum: [team_member, admin, super_admin]
            - type: 'null'
    TimeTrackingGroup:
      type: object
      required: [id, organizationId, name, createdBy, createdAt, updatedAt, memberIds]
      properties:
        id:
          type: string
        organizationId:
          type: string
        name:
          type: string
        description:
          anyOf:
            - type: string
            - type: 'null'
        createdBy:
          type: string
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        memberIds:
          type: array
          items:
            type: string
    TimeTrackingToken:
      type: object
      required: [id, organizationId, name, prefix, maskedKey, scopes, expiresAt, lastUsedAt, isActive, createdAt, createdBy, shareMode, sharedUserIds, sharedGroupIds]
      properties:
        id:
          type: string
        organizationId:
          type: string
        name:
          type: string
        description:
          anyOf:
            - type: string
            - type: 'null'
        prefix:
          type: string
        maskedKey:
          type: string
        scopes:
          type: array
          items:
            type: string
            enum: [read, write, admin]
        expiresAt:
          type: string
          format: date-time
        lastUsedAt:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        isActive:
          type: boolean
        createdAt:
          type: string
          format: date-time
        createdBy:
          type: string
        shareMode:
          type: string
          enum: [private, organization, selected]
        sharedUserIds:
          type: array
          items:
            type: string
        sharedGroupIds:
          type: array
          items:
            type: string
    TimeTrackingEntry:
      type: object
      required: [id, organizationId, userId, projectId, sectionId, title, description, timezone, startedAt, endedAt, createdAt, updatedAt, taskIds, source, sourceMetadata]
      properties:
        id:
          type: string
        organizationId:
          type: string
        userId:
          type: string
        projectId:
          anyOf:
            - type: string
            - type: 'null'
        sectionId:
          anyOf:
            - type: string
            - type: 'null'
        title:
          type: string
        description:
          anyOf:
            - type: string
            - type: 'null'
        timezone:
          type: string
        startedAt:
          type: string
          format: date-time
        endedAt:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        taskIds:
          type: array
          items:
            type: string
        source:
          type: string
        sourceMetadata:
          type: object
          additionalProperties: true
        user:
          anyOf:
            - $ref: '#/components/schemas/TimeTrackingUserOption'
            - type: 'null'
        project:
          anyOf:
            - $ref: '#/components/schemas/TimeTrackingProjectOption'
            - type: 'null'
        section:
          anyOf:
            - $ref: '#/components/schemas/TimeTrackingSectionOption'
            - type: 'null'
        organization:
          anyOf:
            - $ref: '#/components/schemas/TimeTrackingOrganizationOption'
            - type: 'null'
        tasks:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingTaskOption'
    TimeTrackingBootstrap:
      type: object
      required: [organizations, projects, sections, tasks, users, groups, timeTokens]
      properties:
        organizations:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingOrganizationOption'
        projects:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingProjectOption'
        sections:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingSectionOption'
        tasks:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingTaskOption'
        users:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingUserOption'
        groups:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingGroup'
        timeTokens:
          type: array
          items:
            $ref: '#/components/schemas/TimeTrackingToken'
    CreateTimeEntryRequest:
      type: object
      required: [organizationId]
      properties:
        organizationId:
          type: string
        userId:
          type: string
        projectId:
          anyOf:
            - type: string
            - type: 'null'
        sectionId:
          anyOf:
            - type: string
            - type: 'null'
        taskIds:
          type: array
          items:
            type: string
        title:
          type: string
        description:
          anyOf:
            - type: string
            - type: 'null'
        timezone:
          type: string
        startedAt:
          type: string
          format: date-time
        endedAt:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        source:
          type: string
        sourceMetadata:
          type: object
          additionalProperties: true
    UpdateTimeEntryRequest:
      type: object
      properties:
        organizationId:
          type: string
        userId:
          type: string
        projectId:
          anyOf:
            - type: string
            - type: 'null'
        sectionId:
          anyOf:
            - type: string
            - type: 'null'
        taskIds:
          type: array
          items:
            type: string
        title:
          type: string
        description:
          anyOf:
            - type: string
            - type: 'null'
        timezone:
          type: string
        startedAt:
          type: string
          format: date-time
        endedAt:
          anyOf:
            - type: string
              format: date-time
            - type: 'null'
        sourceMetadata:
          type: object
          additionalProperties: true
`;

export function getFocusTimeOpenApiUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/docs/${FOCUS_TIME_OPENAPI_SLUG}`;
}
