# Focus Flow Native iOS

This folder contains the native SwiftUI iOS app that talks to the backend via `/api/mobile/**`.

## Generate Project

```bash
cd ios-native
xcodegen generate
```

## Open

```bash
open FocusFlow.xcodeproj
```

## Auth Contract

- Apple Sign In token exchange: `POST /api/mobile/auth/apple`
- Refresh: `POST /api/mobile/auth/refresh`
- Logout: `POST /api/mobile/auth/logout`

## Data Contract

- Bootstrap: `GET /api/mobile/bootstrap`
- Today tasks: `GET /api/mobile/tasks?view=today`
- Create task: `POST /api/mobile/tasks`
- Update task: `PATCH /api/mobile/tasks/:id`
- Delete task: `DELETE /api/mobile/tasks/:id`
