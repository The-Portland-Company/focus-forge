# Command Center Sync API

A comprehensive REST API for syncing project management data (Organizations, Projects, Tasks, Comments, etc.) with external applications.

## Features

- 🔐 **JWT Authentication** - Secure API access using Supabase Auth tokens
- 📊 **Complete CRUD Operations** - Full Create, Read, Update, Delete support for all entities
- 🚀 **Bulk Operations** - Efficient batch processing for multiple operations
- 🔄 **Real-time Sync Ready** - Designed for seamless synchronization with other apps
- 📝 **RESTful Design** - Standard HTTP methods and status codes

## Quick Start

1. **Get Authentication Token**
   ```javascript
   const { data: { session } } = await supabase.auth.getSession()
   const token = session?.access_token
   ```

2. **Make API Request**
   ```javascript
   const response = await fetch('/api/sync/tasks', {
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     }
   })
   ```

## Available Endpoints

### Core Entities
- **Organizations** - `/api/sync/organizations`
- **Projects** - `/api/sync/projects`
- **Tasks** - `/api/sync/tasks`
- **Comments** - `/api/sync/comments`
- **Sections** - `/api/sync/sections`
- **Tags** - `/api/sync/tags`

### Special Operations
- **Bulk Sync** - `/api/sync/bulk` - Process multiple operations in a single request
- **Task Completion** - `/api/sync/tasks/{id}/complete` - Mark tasks as complete

## Testing

Run the test script to verify all endpoints:
```bash
node scripts/test-api.mjs
```

## Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete endpoint documentation including:
- Request/response formats
- Query parameters
- Error handling
- Example usage

## Integration Example

```javascript
// Example: Sync tasks from external app
async function syncTasks(externalTasks) {
  const operations = externalTasks.map(task => ({
    type: 'task',
    action: 'create',
    data: {
      name: task.title,
      projectId: task.projectId,
      dueDate: task.dueDate,
      priority: task.priority
    }
  }))
  
  const response = await fetch('/api/sync/bulk', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ operations })
  })
  
  return response.json()
}
```

## Security

- All endpoints require valid JWT authentication
- Users can only modify their own data
- Row Level Security (RLS) policies enforced at database level
- Soft delete for comments preserves audit trail

## Rate Limiting

API uses Supabase's built-in rate limiting. Check your Supabase plan for specific limits.