# Todoist Sync Integration - Implementation Decisions

## Confirmed Requirements

### Sync Configuration
- **Direction**: Two-way bidirectional sync
- **Scope**: All Todoist data (no selective sync)
- **History**: Sync all completed tasks (full history)
- **Frequency**: Auto-sync every 5 minutes + manual sync button
- **Processing**: Server-side (Railway) background jobs

### Conflict Resolution
- **Strategy**: Last-write-wins based on timestamp (automatic)
- **Deletions**: Full sync (deletions in either system sync to the other)
- **Completions**: Bidirectional (complete/archive in either system syncs)

### Recurring Tasks
- **Display**: Both current instance in task list AND future occurrences in calendar
- **Completion**: Triggers Todoist's recurrence logic (creates next occurrence)

### Data Handling
- **Initial Import**: Merge with existing Command Center data
- **Duplicates**: Attempt to match and merge during import
- **Backup**: Automatic backup before first sync
- **Disconnect**: User choice to keep or delete data when disconnecting

### Feature Implementation
- **Comments**: Create new comment system in Command Center
- **Attachments**: Implement file attachment feature
- **Reminders**: Skip Todoist reminders entirely
- **Premium Features**: Notify users of limitations if not premium

### Authentication
- **Current**: Personal API Token (user setting)
- **Future**: OAuth 2.0 flow (added to roadmap)

### Error Handling
- **API Issues**: Notify immediately and retry with exponential backoff
- **Rate Limits**: Same as above
- **Data Volume**: Optimize for 100-500 active tasks per user

## Implementation Priority

Based on feature ranking:

### Phase 1 - Core Sync (Week 1)
1. Basic task sync (title, due date, project)
2. Two-way sync infrastructure
3. Database schema updates
4. Sync service foundation

### Phase 2 - Enhanced Features (Week 2)
1. Recurring task support
2. Label/tag sync
3. Subtask hierarchy
4. Conflict resolution

### Phase 3 - Advanced Features (Week 3)
1. Comments system
2. File attachments
3. Activity history
4. Filters sync

### Phase 4 - Collaboration (Week 4)
1. Collaborative features (assigned tasks)
2. Workspace sync
3. Performance optimization
4. Error recovery improvements

## Next Steps

1. Create database migrations for Todoist integration
2. Implement core sync service with Todoist API
3. Build server-side sync scheduler (5-minute intervals)
4. Create UI components for sync status and manual trigger
5. Implement merge logic for initial import
6. Add backup system before first sync
7. Build comment system architecture
8. Design file attachment storage solution

## Technical Decisions

### Database Changes
- Add `todoist_id` columns to tasks, projects, labels
- Create sync state tracking tables
- Implement comment system tables
- Add file attachment metadata tables

### API Endpoints
- `/api/todoist/sync` - Manual sync trigger
- `/api/todoist/connect` - Initial connection
- `/api/todoist/disconnect` - Disconnect with data options
- `/api/todoist/status` - Sync status and history
- `/api/todoist/conflicts` - View/resolve conflicts

### Background Jobs
- Use Railway's background worker
- Implement with Node.js cron or similar
- Queue system for failed operations
- Notification system for sync status

### Security
- Encrypt Todoist API tokens in database
- Implement rate limiting on our side
- Audit log for all sync operations
- Secure file attachment storage

## Success Metrics
- Sync completion rate > 99%
- Average sync time < 10 seconds
- Conflict rate < 1%
- User satisfaction with merge quality
- Zero data loss incidents