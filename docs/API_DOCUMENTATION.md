# Command Center Sync API Documentation

## Authentication

All API endpoints require JWT authentication using Supabase Auth tokens.

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

## Base URL
```
http://localhost:3244/api/sync
```

## Endpoints

### Organizations

#### List Organizations
```
GET /api/sync/organizations
```
Returns all organizations for the authenticated user.

#### Get Organization
```
GET /api/sync/organizations/{id}
```
Returns a specific organization by ID.

#### Create Organization
```
POST /api/sync/organizations
```
Body:
```json
{
  "name": "string",
  "color": "string",
  "description": "string (optional)",
  "order": "number (optional)"
}
```

#### Update Organization
```
PUT /api/sync/organizations/{id}
```
Body: Any organization fields to update

#### Delete Organization
```
DELETE /api/sync/organizations/{id}
```

### Projects

#### List Projects
```
GET /api/sync/projects
```
Query Parameters:
- `organizationId` - Filter by organization
- `archived` - Filter by archived status (true/false)

#### Get Project
```
GET /api/sync/projects/{id}
```

#### Create Project
```
POST /api/sync/projects
```
Body:
```json
{
  "name": "string",
  "color": "string",
  "organizationId": "string",
  "description": "string (optional)",
  "budget": "number (optional)",
  "deadline": "string (optional)",
  "order": "number (optional)"
}
```

#### Update Project
```
PUT /api/sync/projects/{id}
```
Body: Any project fields to update

#### Delete Project
```
DELETE /api/sync/projects/{id}
```

### Tasks

#### List Tasks
```
GET /api/sync/tasks
```
Query Parameters:
- `projectId` - Filter by project
- `sectionId` - Filter by section
- `completed` - Filter by completion status (true/false)
- `assignedTo` - Filter by assigned user ID
- `dueDate` - Filter by due date

#### Get Task
```
GET /api/sync/tasks/{id}
```

#### Create Task
```
POST /api/sync/tasks
```
Body:
```json
{
  "name": "string",
  "projectId": "string",
  "description": "string (optional)",
  "dueDate": "string (optional)",
  "dueTime": "string (optional)",
  "priority": "number (1-4, optional, default: 4)",
  "tags": "string[] (optional)",
  "assignedTo": "string (optional)",
  "sectionId": "string (optional)",
  "parentId": "string (optional)",
  "dependsOn": "string[] (optional)",
  "recurringPattern": "string (optional)"
}
```

#### Create Multiple Tasks
```
PATCH /api/sync/tasks
```
Body:
```json
{
  "tasks": [
    {
      "name": "string",
      "projectId": "string",
      // ... other task fields
    }
  ]
}
```

#### Update Task
```
PUT /api/sync/tasks/{id}
```
Body: Any task fields to update

#### Complete Task
```
POST /api/sync/tasks/{id}/complete
```
Marks a task as completed.

#### Delete Task
```
DELETE /api/sync/tasks/{id}
```

### Comments

#### List Comments
```
GET /api/sync/comments
```
Query Parameters:
- `taskId` - Filter by task
- `projectId` - Filter by project

#### Get Comment
```
GET /api/sync/comments/{id}
```

#### Create Comment
```
POST /api/sync/comments
```
Body:
```json
{
  "content": "string",
  "taskId": "string (optional)",
  "projectId": "string (optional)"
}
```
Note: Either `taskId` or `projectId` is required.

#### Update Comment
```
PUT /api/sync/comments/{id}
```
Body:
```json
{
  "content": "string"
}
```
Note: Users can only edit their own comments.

#### Delete Comment
```
DELETE /api/sync/comments/{id}
```
Soft deletes a comment. Users can only delete their own comments.

### Sections

#### List Sections
```
GET /api/sync/sections
```
Query Parameters:
- `projectId` - Filter by project

#### Create Section
```
POST /api/sync/sections
```
Body:
```json
{
  "name": "string",
  "projectId": "string",
  "parentId": "string (optional)",
  "color": "string (optional)",
  "description": "string (optional)",
  "icon": "string (optional)",
  "order": "number (optional)"
}
```

### Tags

#### List Tags
```
GET /api/sync/tags
```

#### Create Tag
```
POST /api/sync/tags
```
Body:
```json
{
  "name": "string",
  "color": "string"
}
```

### Bulk Operations

#### Bulk Sync
```
POST /api/sync/bulk
```
Perform multiple operations in a single request.

Body:
```json
{
  "operations": [
    {
      "type": "organization|project|task|comment|section|tag",
      "action": "create|update|delete",
      "data": {
        // Entity data based on type and action
      }
    }
  ]
}
```

Response:
```json
{
  "organizations": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "projects": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "tasks": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "comments": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "sections": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "tags": {
    "created": [],
    "updated": [],
    "deleted": []
  },
  "errors": []
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

The API uses Supabase's built-in rate limiting. Please refer to your Supabase plan for specific limits.

## Example Usage

### Get JWT Token
First, authenticate with Supabase to get a JWT token:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
```

### Make API Request
```javascript
const response = await fetch('http://localhost:3244/api/sync/tasks', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})

const tasks = await response.json()
```

### Create Task Example
```javascript
const response = await fetch('http://localhost:3244/api/sync/tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'New Task',
    projectId: 'project-123',
    priority: 2,
    dueDate: '2025-01-15'
  })
})

const newTask = await response.json()
```