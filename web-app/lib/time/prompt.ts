export const FOCUS_TIME_PROMPT_SLUG = "focus-time-agent";

export const FOCUS_TIME_PROMPT_MARKDOWN = `# Focus: Time Implementation Prompt

You are building **Focus: Time**, a distinct native Apple app in a separate repository. It is not an extension of the existing Focus: Forge native codebase.

## Product
- Build a native **iOS app** and **macOS app** using SwiftUI.
- The app tracks time against:
  - Organization (required)
  - Project (optional)
  - Task List / Section (optional)
  - One or more Tasks (optional)
- Users must be able to:
  - start a running timer
  - stop a running timer
  - create manual entries with explicit start/end date-time
  - view and filter historical time entries

## Backend Contract
- Consume the Focus: Forge time-tracking API.
- Treat the API as the source of truth.
- The API base URL must be configurable because the backend will later move into a standalone Focus: Time service.
- Initial API family:
  - \`GET /api/v1/time/prompt\`
  - \`GET /api/v1/time/bootstrap\`
  - \`GET /api/v1/time/current\`
  - \`GET /api/v1/time/entries\`
  - \`POST /api/v1/time/entries\`
  - \`PATCH /api/v1/time/entries/{id}\`
  - \`DELETE /api/v1/time/entries/{id}\`
  - \`POST /api/v1/time/organizations/{organizationId}/tokens\`
  - \`GET /api/v1/time/organizations/{organizationId}/tokens\`
  - \`DELETE /api/v1/time/organizations/{organizationId}/tokens/{tokenId}\`
  - \`GET /api/v1/time/organizations/{organizationId}/groups\`
  - \`POST /api/v1/time/organizations/{organizationId}/groups\`
- Session authentication and bearer-token authentication are both supported.

## Auth and Token Model
- Users can create **Personal Access Tokens** in Focus: Forge settings.
- A PAT with **admin** scope can be used by AI or external tooling to create organization-level Focus: Time API tokens.
- Organization-level time API tokens:
  - belong to both an organization and the creating user
  - require organization owner/admin/super-admin privileges to create
  - support scopes: \`read\`, \`write\`, \`admin\`
  - support visibility:
    - private
    - shared to whole organization
    - shared to selected users
    - shared to selected groups

## Time Semantics
- Store timestamps in UTC.
- Preserve the user-selected IANA timezone with each time entry.
- Display dates and times in the user’s chosen timezone.
- Running timers are represented by entries with \`endedAt = null\`.
- Only one running timer is allowed per user at a time.

## Data Model Expectations
- Time entry fields:
  - id
  - organizationId
  - userId
  - projectId nullable
  - taskListId / sectionId nullable
  - taskIds array
  - title
  - description
  - timezone
  - startedAt UTC
  - endedAt UTC nullable
  - source metadata
- Filtering must support:
  - organization
  - project
  - task list
  - multiple tasks
  - date range
  - users
  - roles
  - free-text search

## UX Requirements
- Main timer surface:
  - prominent running timer
  - start/stop controls
  - current org/project/task list/task selection
  - fast editing without leaving the screen
- Reporting surface:
  - searchable list/table
  - grouped summaries
  - filters for all supported dimensions
  - easy jump from current timer to historical view
- Token onboarding:
  - clear instructions for PAT entry
  - create org token flow when the user has sufficient permissions
  - readable error states for insufficient scope, expired token, or missing organization membership

## Engineering Constraints
- Separate repository from Focus: Forge.
- Native SwiftUI application for both platforms.
- Shared domain models and API client should be reusable across iOS and macOS targets.
- Do not import or reuse the current Focus: Forge native project.
- Keep the API client boundary isolated so the backend base URL and auth provider can move later.

## Testing
- Add unit tests for:
  - API client request/response mapping
  - timezone conversion logic
  - timer state transitions
  - report filter composition
- Add UI tests for:
  - sign-in with token
  - start timer
  - stop timer
  - create manual entry
  - filter report by org/project/task list/task/users/date range
- Validate edge cases:
  - expired token
  - insufficient scope
  - multiple tasks on one entry
  - midnight / timezone-crossing entries
  - attempting to start a second running timer

## Migration Expectation
- Assume the current backend lives inside Focus: Forge today.
- Do not couple the app to Forge-specific UI or app structure.
- Treat the API as a portable contract that may later move to a dedicated Focus: Time backend and database without changing the app’s domain behavior.
`;

export function getFocusTimePromptUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/docs/${FOCUS_TIME_PROMPT_SLUG}`;
}
