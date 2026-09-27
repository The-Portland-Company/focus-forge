export const FOCUS_EMAIL_OPENAPI_SLUG = "focus-email-openapi";

export const FOCUS_EMAIL_OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Focus: Email API
  version: 1.0.0
  summary: Email inbox, drafting, rules and contacts contract for Focus: Forge clients
  description: |
    Public contract for the Focus: Forge email API. Covers the web session-authenticated
    routes under /api/email/** and the Bearer-token mobile mirror routes under
    /api/mobile/email/**.
servers:
  - url: https://focusforge.theportlandcompany.com
    description: Production
security:
  - sessionAuth: []
  - bearerAuth: []
tags:
  - name: email-inbox
  - name: email-threads
  - name: email-drafts
  - name: email-mailboxes
  - name: email-rules
  - name: email-contacts
  - name: email-spam
  - name: email-ai
  - name: email-tasks
  - name: email-mobile
paths:
  /api/email/action-log:
    post:
      tags: [email-inbox]
      summary: Record an inbox action-log entry
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Logged
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/ai-profiles:
    get:
      tags: [email-ai]
      summary: List AI reply profiles
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: AI profiles
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
    post:
      tags: [email-ai]
      summary: Create an AI reply profile
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/ai-profiles/{id}:
    put:
      tags: [email-ai]
      summary: Update an AI reply profile
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/contacts:
    get:
      tags: [email-contacts]
      summary: List/search contacts
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: q
          schema: { type: string }
        - in: query
          name: scope
          schema: { type: string, enum: [all, personal, org] }
        - in: query
          name: limit
          schema: { type: integer }
        - in: query
          name: offset
          schema: { type: integer }
      responses:
        '200':
          description: Contacts
          content:
            application/json:
              schema:
                type: object
                properties:
                  contacts:
                    $ref: '#/components/schemas/GenericArray'
                  total:
                    type: integer
        '500':
          $ref: '#/components/responses/ServerError'
    post:
      tags: [email-contacts]
      summary: Create a contact
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
                  format: email
              additionalProperties: true
      responses:
        '201':
          description: Created contact
          content:
            application/json:
              schema:
                type: object
                properties:
                  contact:
                    $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/contacts/{id}:
    patch:
      tags: [email-contacts]
      summary: Update a contact
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated contact
          content:
            application/json:
              schema:
                type: object
                properties:
                  contact:
                    $ref: '#/components/schemas/GenericObject'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
    delete:
      tags: [email-contacts]
      summary: Delete a contact
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/contacts/google/callback:
    get:
      tags: [email-contacts]
      summary: Google OAuth callback for contacts import
      security: []
      parameters:
        - in: query
          name: code
          schema: { type: string }
        - in: query
          name: state
          schema: { type: string }
        - in: query
          name: error
          schema: { type: string }
      responses:
        '200':
          description: Redirect/result of the OAuth exchange
        '302':
          description: Redirect back into the app
  /api/email/contacts/google/connect:
    get:
      tags: [email-contacts]
      summary: Start Google contacts OAuth connect flow
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Authorization URL
          content:
            application/json:
              schema:
                type: object
                properties:
                  url:
                    type: string
                  configured:
                    type: boolean
        '501':
          description: Google contacts import not configured
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /api/email/contacts/google/import:
    post:
      tags: [email-contacts]
      summary: Import contacts from connected Google account
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Import result
          content:
            application/json:
              schema:
                type: object
                properties:
                  result:
                    $ref: '#/components/schemas/GenericObject'
        '501':
          description: Google contacts import not configured
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/contacts/import:
    post:
      tags: [email-contacts]
      summary: Import contacts from an uploaded vCard/CSV file
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
      responses:
        '200':
          description: Import result
          content:
            application/json:
              schema:
                type: object
                properties:
                  result:
                    $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/contacts/suggest:
    get:
      tags: [email-contacts]
      summary: Suggest contacts by prefix query
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: q
          schema: { type: string }
        - in: query
          name: limit
          schema: { type: integer }
      responses:
        '200':
          description: Suggestions
          content:
            application/json:
              schema:
                type: object
                properties:
                  suggestions:
                    $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/drafts/count:
    get:
      tags: [email-drafts]
      summary: Get combined draft counts
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Draft count
          content:
            application/json:
              schema:
                type: object
                properties:
                  count:
                    type: integer
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/folders:
    get:
      tags: [email-mailboxes]
      summary: List IMAP folders per mailbox
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: mailboxId
          schema: { type: string }
      responses:
        '200':
          description: Mailboxes with folders
          content:
            application/json:
              schema:
                type: object
                properties:
                  mailboxes:
                    $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/inbox-tabs:
    get:
      tags: [email-inbox]
      summary: List custom inbox tabs
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Tabs
          content:
            application/json:
              schema:
                type: object
                properties:
                  tabs:
                    $ref: '#/components/schemas/GenericArray'
    post:
      tags: [email-inbox]
      summary: Create a custom inbox tab
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name:
                  type: string
              additionalProperties: true
      responses:
        '200':
          description: Created tab
          content:
            application/json:
              schema:
                type: object
                properties:
                  tab:
                    $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/inbox-tabs/{id}:
    put:
      tags: [email-inbox]
      summary: Update a custom inbox tab
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated tab
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
    delete:
      tags: [email-inbox]
      summary: Delete a custom inbox tab
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/inbox-tabs/ai-evaluate:
    post:
      tags: [email-inbox]
      summary: AI-evaluate threads against custom inbox tab rules
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Verdicts per thread
          content:
            application/json:
              schema:
                type: object
                properties:
                  verdicts:
                    $ref: '#/components/schemas/GenericObject'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/inbox:
    get:
      tags: [email-inbox]
      summary: List inbox threads
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: status
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
        - in: query
          name: search
          schema: { type: string }
      responses:
        '200':
          description: Inbox items
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/mailboxes:
    get:
      tags: [email-mailboxes]
      summary: List connected mailboxes
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Mailboxes
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
    post:
      tags: [email-mailboxes]
      summary: Connect a mailbox
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Connected mailbox
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/mailboxes/{id}:
    patch:
      tags: [email-mailboxes]
      summary: Update a mailbox
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated mailbox
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
    delete:
      tags: [email-mailboxes]
      summary: Disconnect a mailbox
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/mailboxes/{id}/sync:
    post:
      tags: [email-mailboxes]
      summary: Sync a single mailbox
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Sync result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/mailboxes/sync-due:
    post:
      tags: [email-mailboxes]
      summary: Sync all mailboxes that are due
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Sync result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/messages/{messageId}/attachments/{attachmentIndex}:
    get:
      tags: [email-threads]
      summary: Download a message attachment
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/messageId'
        - $ref: '#/components/parameters/attachmentIndex'
      responses:
        '200':
          description: Attachment binary
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary
        '404':
          $ref: '#/components/responses/NotFound'
  /api/email/messages/{messageId}/attachments/{attachmentIndex}/public-link:
    post:
      tags: [email-threads]
      summary: Create a public share link for an attachment
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/messageId'
        - $ref: '#/components/parameters/attachmentIndex'
      responses:
        '200':
          description: Public link
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '404':
          $ref: '#/components/responses/NotFound'
    get:
      tags: [email-threads]
      summary: Check whether a public link exists for an attachment
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/messageId'
        - $ref: '#/components/parameters/attachmentIndex'
      responses:
        '200':
          description: Link status
          content:
            application/json:
              schema:
                type: object
                properties:
                  hasLink:
                    type: boolean
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '404':
          $ref: '#/components/responses/NotFound'
    delete:
      tags: [email-threads]
      summary: Revoke a public attachment link
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/messageId'
        - $ref: '#/components/parameters/attachmentIndex'
      responses:
        '200':
          description: Revoked
          content:
            application/json:
              schema:
                type: object
                properties:
                  revoked:
                    type: boolean
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '404':
          $ref: '#/components/responses/NotFound'
  /api/email/outbound-drafts:
    get:
      tags: [email-drafts]
      summary: List outbound (new) drafts
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: status
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
      responses:
        '200':
          description: Drafts
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
    post:
      tags: [email-drafts]
      summary: Create an outbound draft
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/outbound-drafts/{id}:
    patch:
      tags: [email-drafts]
      summary: Update an outbound draft
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '200':
          description: Updated draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
    delete:
      tags: [email-drafts]
      summary: Delete an outbound draft
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/outbound-drafts/{id}/schedule:
    post:
      tags: [email-drafts]
      summary: Schedule an outbound draft to send later
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Scheduled draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/outbound-drafts/{id}/send:
    post:
      tags: [email-drafts]
      summary: Send an outbound draft now
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Sent draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/outbound-drafts/process-scheduled:
    post:
      tags: [email-drafts]
      summary: Process due scheduled outbound drafts
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/reply-drafts:
    get:
      tags: [email-drafts]
      summary: List reply drafts
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: status
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
        - in: query
          name: source
          schema: { type: string }
      responses:
        '200':
          description: Reply drafts
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/reply-drafts/{id}:
    patch:
      tags: [email-drafts]
      summary: Update a reply draft
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '200':
          description: Updated draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
    delete:
      tags: [email-drafts]
      summary: Delete a reply draft
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/reply-drafts/{id}/schedule:
    post:
      tags: [email-drafts]
      summary: Schedule a reply draft to send later
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Scheduled draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/reply-drafts/{id}/send:
    post:
      tags: [email-drafts]
      summary: Send a reply draft now
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Sent draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/reply-drafts/process-scheduled:
    post:
      tags: [email-drafts]
      summary: Process due scheduled reply drafts
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/report-bug:
    post:
      tags: [email-inbox]
      summary: Report a bug from the email client
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Reported
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '502':
          description: Upstream bug-report delivery failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /api/email/rules:
    get:
      tags: [email-rules]
      summary: List email rules
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Rules
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
    post:
      tags: [email-rules]
      summary: Create an email rule
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/rules/{id}:
    put:
      tags: [email-rules]
      summary: Update an email rule
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/rules/assistant:
    post:
      tags: [email-rules]
      summary: Generate a rule draft from a natural-language prompt
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Draft rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/senders/history:
    get:
      tags: [email-threads]
      summary: Get thread history for a sender email address
      security: [{ sessionAuth: [] }]
      parameters:
        - in: query
          name: email
          schema: { type: string }
      responses:
        '200':
          description: Threads from this sender
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/spam-exceptions:
    post:
      tags: [email-spam]
      summary: Create a spam exception for a thread
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [threadId]
              properties:
                threadId:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created exception
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/spam-exceptions/{ruleId}/revert:
    post:
      tags: [email-spam]
      summary: Revert a spam exception rule
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/ruleId'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/storage:
    get:
      tags: [email-mailboxes]
      summary: Get storage usage stats per mailbox
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Storage stats
          content:
            application/json:
              schema:
                type: object
                properties:
                  mailboxes:
                    $ref: '#/components/schemas/GenericArray'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/task-links:
    get:
      tags: [email-tasks]
      summary: List task-to-email links for the current user
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Links
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/ServerError'
    patch:
      tags: [email-tasks]
      summary: Update visibility of an email-linked task
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated link
          content:
            application/json:
              schema:
                type: object
                properties:
                  taskId:
                    type: string
                  public:
                    type: boolean
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/threads/{id}:
    get:
      tags: [email-threads]
      summary: Get a thread with its messages
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Thread detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '404':
          $ref: '#/components/responses/NotFound'
  /api/email/threads/{id}/actions:
    post:
      tags: [email-threads]
      summary: Apply an inbox action to a thread (archive, mark-read, move, etc.)
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result or updated thread detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/ai-rationale:
    get:
      tags: [email-ai]
      summary: Get the AI rationale for a thread's classification
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Rationale
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/threads/{id}/exclude-from-tasks:
    post:
      tags: [email-tasks]
      summary: Exclude a thread from automatic task generation
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/threads/{id}/inbox-tab:
    put:
      tags: [email-inbox]
      summary: Assign a thread to a custom inbox tab
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/priority:
    put:
      tags: [email-threads]
      summary: Set thread priority
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/project:
    put:
      tags: [email-threads]
      summary: Assign a project to a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated thread
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/projects:
    post:
      tags: [email-threads]
      summary: Add a project association to a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated thread
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
    delete:
      tags: [email-threads]
      summary: Remove a project association from a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated thread
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/reply:
    post:
      tags: [email-threads]
      summary: Send a reply directly on a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/reply-drafts:
    post:
      tags: [email-drafts]
      summary: Save a reply draft for a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/reply/generate:
    post:
      tags: [email-ai]
      summary: Generate an AI reply draft for a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Generated draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/spam-assessment:
    get:
      tags: [email-spam]
      summary: Get the cached spam assessment for a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Assessment
          content:
            application/json:
              schema:
                type: object
                properties:
                  assessment:
                    $ref: '#/components/schemas/GenericObject'
        '404':
          $ref: '#/components/responses/NotFound'
    post:
      tags: [email-spam]
      summary: Compute a fresh spam assessment for a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Assessment
          content:
            application/json:
              schema:
                type: object
                properties:
                  assessment:
                    $ref: '#/components/schemas/GenericObject'
        '404':
          $ref: '#/components/responses/NotFound'
        '502':
          description: Upstream classifier call failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/threads/{id}/spam-assessment/train:
    post:
      tags: [email-spam]
      summary: Train the spam classifier from a corrected assessment
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Training result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
        '404':
          $ref: '#/components/responses/NotFound'
        '502':
          description: Upstream classifier call failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          $ref: '#/components/responses/ServerError'
  /api/email/threads/{id}/star:
    post:
      tags: [email-threads]
      summary: Star or unstar a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/tasks:
    get:
      tags: [email-tasks]
      summary: List tasks linked to a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Linked tasks
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '404':
          $ref: '#/components/responses/NotFound'
    post:
      tags: [email-tasks]
      summary: Generate tasks from a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created tasks
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericArray'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/threads/{id}/unsubscribe:
    post:
      tags: [email-threads]
      summary: Unsubscribe from the sender of a thread
      security: [{ sessionAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/trash/empty:
    post:
      tags: [email-inbox]
      summary: Empty trash for one or all mailboxes
      security: [{ sessionAuth: [] }]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenericObject'
        '400':
          $ref: '#/components/responses/InvalidRequest'
  /api/email/unread-count:
    get:
      tags: [email-inbox]
      summary: Get the unread thread count
      security: [{ sessionAuth: [] }]
      responses:
        '200':
          description: Count
          content:
            application/json:
              schema:
                type: object
                properties:
                  count:
                    type: integer
        '500':
          $ref: '#/components/responses/ServerError'
  /api/mobile/email/ai-profiles:
    get:
      tags: [email-mobile]
      summary: List AI reply profiles (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      responses:
        '200':
          description: AI profiles
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Create an AI reply profile (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/ai-profiles/{id}:
    put:
      tags: [email-mobile]
      summary: Update an AI reply profile (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated profile
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/attachments/public-link:
    post:
      tags: [email-mobile]
      summary: Create a public attachment share link (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Public link
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Validation or lookup failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/contacts:
    get:
      tags: [email-mobile]
      summary: List/search contacts (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: q
          schema: { type: string }
        - in: query
          name: scope
          schema: { type: string, enum: [all, personal, org] }
        - in: query
          name: limit
          schema: { type: integer }
        - in: query
          name: offset
          schema: { type: integer }
      responses:
        '200':
          description: Contacts
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Create a contact (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
                  format: email
              additionalProperties: true
      responses:
        '201':
          description: Created contact
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/inbox:
    get:
      tags: [email-mobile]
      summary: List inbox threads (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: folder
          schema: { type: string }
        - in: query
          name: status
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
        - in: query
          name: classification
          schema: { type: string }
        - in: query
          name: search
          schema: { type: string }
        - in: query
          name: sort
          schema: { type: string }
      responses:
        '200':
          description: Inbox items
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/live:
    get:
      tags: [email-mobile]
      summary: Live-fetch recent messages directly from the mail server (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: folder
          schema: { type: string }
        - in: query
          name: limit
          schema: { type: integer }
        - in: query
          name: search
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
      responses:
        '200':
          description: Live messages
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Live fetch failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/mailboxes:
    get:
      tags: [email-mobile]
      summary: List connected mailboxes (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      responses:
        '200':
          description: Mailboxes
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Connect a mailbox (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Connected mailbox
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/mailboxes/{id}:
    patch:
      tags: [email-mobile]
      summary: Update a mailbox (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated mailbox
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/outbound-drafts:
    get:
      tags: [email-mobile]
      summary: List outbound drafts (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
      responses:
        '200':
          description: Drafts
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Create an outbound draft (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/reply-drafts:
    get:
      tags: [email-mobile]
      summary: List reply drafts (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: status
          schema: { type: string }
        - in: query
          name: mailboxId
          schema: { type: string }
        - in: query
          name: projectId
          schema: { type: string }
        - in: query
          name: source
          schema: { type: string }
      responses:
        '200':
          description: Reply drafts
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/reply-drafts/{id}:
    patch:
      tags: [email-mobile]
      summary: Update a reply draft (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '200':
          description: Updated draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/reply-drafts/{id}/schedule:
    post:
      tags: [email-mobile]
      summary: Schedule a reply draft (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Scheduled draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/reply-drafts/{id}/send:
    post:
      tags: [email-mobile]
      summary: Send a reply draft now (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Sent draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/rules:
    get:
      tags: [email-mobile]
      summary: List email rules (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      responses:
        '200':
          description: Rules
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Create an email rule (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/rules/{id}:
    put:
      tags: [email-mobile]
      summary: Update an email rule (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/rules/assistant:
    post:
      tags: [email-mobile]
      summary: Generate a rule draft from a natural-language prompt (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Draft rule
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Validation failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/senders/history:
    get:
      tags: [email-mobile]
      summary: Get thread history for a sender (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - in: query
          name: email
          schema: { type: string }
      responses:
        '200':
          description: Threads from this sender
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/spam-exceptions:
    post:
      tags: [email-mobile]
      summary: Create a spam exception for a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [threadId]
              properties:
                threadId:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created exception
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Validation failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/spam-exceptions/{ruleId}/revert:
    post:
      tags: [email-mobile]
      summary: Revert a spam exception rule (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/ruleId'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/sync:
    post:
      tags: [email-mobile]
      summary: Sync one or all due mailboxes (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Sync result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Sync failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/task-links:
    get:
      tags: [email-mobile]
      summary: List task-to-email links (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      responses:
        '200':
          description: Links
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    patch:
      tags: [email-mobile]
      summary: Update visibility of an email-linked task (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Updated link
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '403':
          description: Not the owner of this email link
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}:
    get:
      tags: [email-mobile]
      summary: Get a thread with its messages (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Thread detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '404':
          description: Not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}/actions:
    post:
      tags: [email-mobile]
      summary: Apply an inbox action to a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result or updated thread detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Unsupported action or failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}/project:
    put:
      tags: [email-mobile]
      summary: Assign a project to a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [projectId]
              properties:
                projectId:
                  type: string
      responses:
        '200':
          description: Updated thread
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Validation or failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Assign a project to a thread (mobile, alias of PUT)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [projectId]
              properties:
                projectId:
                  type: string
      responses:
        '200':
          description: Updated thread
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '400':
          description: Validation or failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}/reply-drafts:
    post:
      tags: [email-mobile]
      summary: Save a reply draft for a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
              additionalProperties: true
      responses:
        '201':
          description: Created draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}/reply/generate:
    post:
      tags: [email-mobile]
      summary: Generate an AI reply draft for a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Generated draft
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/threads/{id}/tasks:
    get:
      tags: [email-mobile]
      summary: List tasks linked to a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      parameters:
        - $ref: '#/components/parameters/id'
      responses:
        '200':
          description: Linked tasks
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
        '404':
          description: Not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
    post:
      tags: [email-mobile]
      summary: Generate tasks from a thread (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      parameters:
        - $ref: '#/components/parameters/id'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '201':
          description: Created tasks
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/trash/empty:
    post:
      tags: [email-mobile]
      summary: Empty trash (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: write
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenericObject'
      responses:
        '200':
          description: Result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
  /api/mobile/email/unread-count:
    get:
      tags: [email-mobile]
      summary: Get the unread thread count (mobile)
      security: [{ bearerAuth: [] }]
      x-required-scope: read
      responses:
        '200':
          description: Count
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MobileEnvelope'
components:
  securitySchemes:
    sessionAuth:
      type: apiKey
      in: cookie
      name: sb-<project>-auth-token
      description: Existing authenticated Focus: Forge web session. Used by all app/api/email/** routes via requireAuth().
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: opaque-token
      description: |
        Used by all app/api/mobile/email/** routes via verifyMobileAccessTokenOrPat().
        Accepts either a Supabase user access token (mobile-app native session) or a
        Focus: Forge Personal Access Token (PAT). Most write operations require the
        token to carry the "write" or "admin" scope; read operations accept "read",
        "write", or "admin" — see each operation's x-required-scope extension.
  parameters:
    id:
      in: path
      name: id
      required: true
      schema:
        type: string
    ruleId:
      in: path
      name: ruleId
      required: true
      schema:
        type: string
    messageId:
      in: path
      name: messageId
      required: true
      schema:
        type: string
    attachmentIndex:
      in: path
      name: attachmentIndex
      required: true
      schema:
        type: string
  responses:
    Unauthorized:
      description: Missing or invalid session/token
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            default:
              value:
                error: Unauthorized
    Forbidden:
      description: Authenticated but not allowed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
    InvalidRequest:
      description: Bad request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
    NotFound:
      description: Missing resource
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
    ServerError:
      description: Unexpected server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
  schemas:
    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: string
      description: |
        The plain error envelope used by app/api/email/** routes, e.g. { "error": "Unauthorized" }.
    MobileEnvelope:
      type: object
      required: [data, error]
      properties:
        data:
          anyOf:
            - $ref: '#/components/schemas/GenericObject'
            - $ref: '#/components/schemas/GenericArray'
            - type: 'null'
        meta:
          type: object
          additionalProperties: true
        error:
          anyOf:
            - type: object
              required: [code, message]
              properties:
                code:
                  type: string
                message:
                  type: string
                details: {}
            - type: 'null'
      description: |
        Envelope returned by all app/api/mobile/email/** routes via mobileSuccess()/mobileFailure().
    GenericObject:
      type: object
      additionalProperties: true
      description: Loosely-typed object; the handler's exact shape is not restated field-by-field here.
    GenericArray:
      type: array
      items:
        $ref: '#/components/schemas/GenericObject'
`;

export function getFocusEmailOpenApiUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/docs/${FOCUS_EMAIL_OPENAPI_SLUG}`;
}
