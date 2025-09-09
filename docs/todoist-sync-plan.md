# Todoist Sync Integration Plan

## Overview
This document outlines the plan to integrate Todoist task synchronization into the Command Center application, ensuring proper handling of recurring tasks and preventing duplicates.

## Architecture Overview

### Sync Strategy
We'll implement a **bidirectional sync** with the following approach:
1. **Initial Import**: One-time full import of all Todoist data
2. **Incremental Sync**: Use Todoist's sync tokens for efficient updates
3. **Conflict Resolution**: Last-write-wins with user confirmation for conflicts
4. **Duplicate Prevention**: Use Todoist IDs as unique identifiers

### Data Flow
```
Todoist API <-> Sync Service <-> Supabase Database <-> Command Center UI
```

## Implementation Plan

### Phase 1: Database Schema Updates
Create new tables/columns to support Todoist integration:

```sql
-- Add to existing tasks table
ALTER TABLE tasks ADD COLUMN todoist_id TEXT UNIQUE;
ALTER TABLE tasks ADD COLUMN todoist_sync_token TEXT;
ALTER TABLE tasks ADD COLUMN is_recurring BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN recurrence_pattern TEXT;
ALTER TABLE tasks ADD COLUMN last_todoist_sync TIMESTAMP;

-- Add to existing projects table  
ALTER TABLE projects ADD COLUMN todoist_id TEXT UNIQUE;
ALTER TABLE projects ADD COLUMN todoist_sync_token TEXT;

-- New sync metadata table
CREATE TABLE todoist_sync_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  sync_token TEXT,
  last_sync_at TIMESTAMP,
  sync_status TEXT, -- 'syncing', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sync history for audit trail
CREATE TABLE todoist_sync_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  sync_type TEXT, -- 'full', 'incremental'
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 2: Sync Service Implementation

#### Core Components

1. **TodoistSyncService** (`/lib/services/todoist-sync.ts`)
   - Handles all Todoist API interactions
   - Manages sync tokens and state
   - Implements retry logic with exponential backoff

2. **SyncMapper** (`/lib/services/todoist-mapper.ts`)
   - Maps Todoist objects to Command Center models
   - Handles data transformations
   - Preserves Todoist-specific metadata

3. **ConflictResolver** (`/lib/services/sync-conflict-resolver.ts`)
   - Detects and resolves sync conflicts
   - Implements merge strategies
   - Logs conflict resolutions

### Phase 3: Recurring Task Handling

#### Strategy for Recurring Tasks
1. **Storage**: Store the recurrence pattern in `recurrence_pattern` field
2. **Completion**: When a recurring task is completed:
   - Mark current instance as complete
   - Let Todoist generate the next occurrence
   - Sync will pull the new occurrence automatically
3. **Display**: Show recurrence icon/badge in UI
4. **Editing**: Warn users that editing recurring tasks affects all future occurrences

#### Recurrence Pattern Examples
- `every day` - Daily task
- `every Monday` - Weekly on specific day
- `every 3 months` - Periodic interval
- `every weekday` - Monday through Friday
- `every 15th` - Monthly on specific date

### Phase 4: Duplicate Prevention

#### Strategies
1. **Unique Constraint**: Use `todoist_id` as unique identifier
2. **Upsert Operations**: Use `ON CONFLICT` clauses for inserts
3. **Checksum Validation**: Compare task content hashes before updates
4. **Idempotency Keys**: Use Todoist's UUID system for commands

#### Duplicate Detection Algorithm
```typescript
async function isDuplicate(task: TodoistTask): Promise<boolean> {
  // Check by Todoist ID
  if (task.todoist_id) {
    const existing = await findByTodoistId(task.todoist_id);
    if (existing) return true;
  }
  
  // Check by content similarity (for manual duplicates)
  const similar = await findSimilarTasks({
    content: task.content,
    project_id: task.project_id,
    due_date: task.due_date,
    threshold: 0.95 // 95% similarity
  });
  
  return similar.length > 0;
}
```

### Phase 5: API Endpoints

#### New API Routes
- `POST /api/todoist/sync` - Trigger manual sync
- `GET /api/todoist/sync/status` - Get sync status
- `POST /api/todoist/import` - Initial import
- `POST /api/todoist/disconnect` - Remove Todoist integration
- `GET /api/todoist/conflicts` - View sync conflicts

### Phase 6: UI Integration

#### Settings Page
- Todoist connection status
- Sync frequency settings
- Manual sync button
- Conflict resolution preferences
- Import history

#### Task Views
- Todoist sync indicator
- Recurrence badge for recurring tasks
- Last synced timestamp
- Sync error notifications

## Sync Workflow

### Initial Import Flow
1. User enters Todoist API token in settings
2. Validate token with Todoist API
3. Fetch all projects, labels, and filters
4. Fetch all active tasks
5. Map and store in Command Center database
6. Store sync token for incremental updates

### Incremental Sync Flow
1. Retrieve last sync token from database
2. Call Todoist Sync API with token
3. Process changes (creates, updates, deletes)
4. Handle conflicts if any
5. Update local database
6. Store new sync token
7. Log sync results

### Conflict Resolution Flow
1. Detect conflict (same task modified in both systems)
2. Compare timestamps
3. Apply resolution strategy:
   - **Auto-resolve**: Last-write-wins for minor changes
   - **User prompt**: For significant changes
4. Log resolution for audit

## Error Handling

### Retry Strategy
- API rate limits: Exponential backoff with jitter
- Network errors: 3 retries with increasing delays
- Invalid tokens: Prompt user to re-authenticate
- Data conflicts: Queue for manual review

### Error Recovery
- Store failed sync operations in queue
- Retry failed operations on next sync
- Alert user for persistent failures
- Provide manual conflict resolution UI

## Performance Considerations

### Optimization Strategies
1. **Batch Operations**: Process changes in batches
2. **Pagination**: Handle large datasets with cursors
3. **Caching**: Cache frequently accessed data
4. **Debouncing**: Prevent rapid successive syncs
5. **Background Jobs**: Run syncs in background workers

### Sync Frequency
- **Auto-sync**: Every 5 minutes (configurable)
- **Manual sync**: On-demand via UI
- **Real-time**: WebSocket for immediate updates (future)

## Security Considerations

1. **Token Storage**: Encrypt API tokens in database
2. **Secure Transmission**: HTTPS only
3. **Audit Logging**: Track all sync operations
4. **Rate Limiting**: Prevent API abuse
5. **Data Privacy**: Respect user data boundaries

## Testing Strategy

### Unit Tests
- Mapper functions
- Conflict resolution logic
- Duplicate detection
- Recurrence pattern parsing

### Integration Tests
- Full sync workflow
- Error handling
- Conflict scenarios
- Large dataset handling

### E2E Tests
- Complete import flow
- Incremental sync updates
- UI sync indicators
- Error recovery

## Monitoring & Analytics

### Metrics to Track
- Sync success/failure rates
- Average sync duration
- Number of conflicts
- API rate limit hits
- Data volume synced

### Alerts
- Sync failures > threshold
- API token expiration
- Rate limit warnings
- Conflict queue buildup

## Migration Plan

### Rollout Strategy
1. **Beta Testing**: Limited users with manual activation
2. **Gradual Rollout**: Percentage-based activation
3. **Full Launch**: All users with opt-in
4. **Documentation**: User guides and FAQs

## Future Enhancements

1. **Two-way Sync**: Full bidirectional synchronization
2. **Selective Sync**: Choose specific projects/labels
3. **Real-time Updates**: WebSocket integration
4. **Bulk Operations**: Mass import/export
5. **Advanced Mapping**: Custom field mappings
6. **Team Sync**: Workspace-level synchronization

## Clarifying Questions

Before proceeding with implementation, please provide answers to the following:

### 1. Sync Direction & Scope
- **Q**: Should this be one-way (Todoist → Command Center) or two-way sync?
- **Q**: Should we sync ALL Todoist data or allow users to select specific projects/labels?
- **Q**: Should completed tasks be synced, and if so, for how long back?

### 2. Conflict Resolution
- **Q**: How should we handle conflicts when the same task is modified in both systems?
  - Option A: Always prefer Todoist (Todoist as source of truth)
  - Option B: Always prefer Command Center (local as source of truth)
  - Option C: Last-write-wins based on timestamp
  - Option D: Prompt user to choose

### 3. Recurring Tasks
- **Q**: How should recurring tasks behave in Command Center?
  - Option A: Show only current instance (like Todoist)
  - Option B: Show future occurrences in calendar view
  - Option C: Allow local editing of recurrence patterns
- **Q**: Should completing a recurring task in Command Center trigger Todoist's recurrence logic?

### 4. Data Mapping
- **Q**: How should we map Todoist-specific features that don't exist in Command Center?
  - Todoist Karma points
  - Todoist comments/activity feed
  - Todoist file attachments
  - Todoist reminders/notifications

### 5. User Experience
- **Q**: Should sync happen automatically in the background or require manual trigger?
- **Q**: What's the preferred sync frequency? (real-time, every 5 min, hourly, daily?)
- **Q**: Should we show sync status/progress in the UI?

### 6. Initial Import
- **Q**: Should the initial import replace existing Command Center data or merge with it?
- **Q**: How should we handle existing Command Center tasks that might match Todoist tasks?

### 7. Authentication
- **Q**: Should each user provide their own Todoist token, or will there be a shared integration?
- **Q**: Should we implement OAuth flow or stick with personal API tokens?

### 8. Performance
- **Q**: What's the expected volume of tasks per user? (affects batching strategy)
- **Q**: Should sync run on the server (Railway) or client-side?

### 9. Error Handling
- **Q**: How should we handle Todoist API downtime or rate limits?
- **Q**: Should failed syncs retry automatically or require user intervention?

### 10. Feature Priority
Please rank these features by importance (1 = highest priority):
- [ ] Basic task sync (title, due date, project)
- [ ] Recurring task support
- [ ] Label/tag sync
- [ ] Subtask hierarchy
- [ ] Comments/notes sync
- [ ] File attachments
- [ ] Reminder sync
- [ ] Collaborative features (assigned tasks)
- [ ] Activity history
- [ ] Two-way sync

### 11. Business Logic
- **Q**: Should deleting a task in Command Center delete it in Todoist?
- **Q**: Should archiving/completing tasks sync both ways?
- **Q**: How should we handle Todoist premium features if the user doesn't have premium?

### 12. Migration & Rollback
- **Q**: Do we need a way to disconnect Todoist and remove all synced data?
- **Q**: Should we keep a backup before initial import for rollback?

## Next Steps

Once the clarifying questions are answered, we'll proceed with:
1. Database migration scripts
2. Sync service implementation
3. API endpoint development
4. UI components
5. Testing and deployment

## Estimated Timeline

- **Phase 1-2**: 2-3 days (Database & Core Sync Service)
- **Phase 3-4**: 2-3 days (Recurring Tasks & Duplicate Prevention)
- **Phase 5-6**: 2-3 days (API & UI Integration)
- **Testing**: 2-3 days
- **Total**: ~10-12 days for full implementation

## Dependencies

- Todoist API token (provided: ✅)
- Todoist API documentation (downloaded: ✅)
- Supabase database access (available: ✅)
- Next.js application (existing: ✅)