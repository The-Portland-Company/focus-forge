# Feedback Widget NPM Package

## Project Overview
An NPM package that displays an icon on any web app, allowing users to log visual notes/feedback that are viewable in Command Center.

## Status
**In Progress** - Requirements gathering phase

---

## Requirements Discussion

### Confirmed Requirements

#### Auto-Capture Features
- Current page URL
- Page title
- App name
- Screenshot of the page

#### Visual Annotation System
- User can place a dot/marker anywhere on the page
- Dot indicates the exact location of feedback
- Developer view: navigates to that page and shows animated dot (growing/shrinking pulsing effect)
- Clicking the dot reveals notes in a chat bubble

#### Architecture
- Lightweight NPM package
- Separate app from Command Center
- Interfaces with Command Center via API
- Built with Next.js

---

## Open Questions

### Question 2 (Pending Answer)
**What fields should the note/feedback form contain?**

Options discussed:
- Just a text field for their note
- Text field + category dropdown (bug, suggestion, question, praise)
- Text field + priority/severity selector
- Text field + their name/email (for follow-up)
- Something else

*Awaiting response...*

### Future Questions to Ask
- Authentication: How should apps authenticate with Command Center API?
- User identification: Anonymous users or require some identifier?
- Storage: Where do screenshots get stored? (Supabase storage, S3, etc.)
- Developer dashboard: New section in Command Center or separate view?
- Real-time: Should developers see feedback in real-time or on refresh?
- Package name: What should the NPM package be called?
- Icon placement: Where should the feedback icon appear by default? (corner, floating, etc.)
- Icon customization: Should the icon be customizable per-app?

---

## Technical Considerations

### Package Structure (TBD)
```
feedback-widget/
├── src/
│   ├── components/
│   │   ├── FeedbackIcon.tsx
│   │   ├── FeedbackForm.tsx
│   │   ├── DotMarker.tsx
│   │   └── ChatBubble.tsx
│   ├── hooks/
│   │   └── useScreenshot.ts
│   ├── api/
│   │   └── client.ts
│   └── index.ts
├── package.json
└── README.md
```

### Command Center API Endpoints (TBD)
- `POST /api/feedback` - Submit new feedback
- `GET /api/feedback` - List feedback for an app
- `GET /api/feedback/[id]` - Get specific feedback with screenshot

---

## Session Log

### Session 1 - January 9, 2025
- Discussed initial concept
- Confirmed auto-capture features
- Confirmed visual annotation system with dot placement
- Paused at Question 2 (form fields)

---

## Next Steps
1. Complete requirements gathering (answer remaining questions)
2. Design Command Center API endpoints
3. Create database schema for feedback storage
4. Build the NPM package
5. Integrate with Command Center
6. Generate prompt for Claude to build it
