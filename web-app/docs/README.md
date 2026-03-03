# Focus: Forge - Inbox and Task Manager

A modern, Todoist-inspired task management application built with Next.js, featuring a clean dark mode interface and powerful organizational tools.

## Features

- 📋 **Task Management**: Create, edit, and organize tasks with due dates, priorities, and deadlines
- 🏢 **Organization & Project Hierarchy**: Structure your work with organizations and projects
- 🎯 **Smart Views**: Today view shows all due and overdue tasks at a glance
- 🌓 **Dark Mode**: Beautiful dark theme optimized for extended use
- 📱 **Mobile-First Design**: Responsive interface that works great on all devices
- 🔄 **Drag & Drop**: Easily reorganize projects between organizations
- 📥 **Todoist Import**: Import your existing data from Todoist CSV backups
- 💾 **Local Storage**: JSON file-based database for simple, reliable data persistence
- 🗂️ **Archive & Delete**: Archive projects or delete organizations with full confirmation

## Tech Stack

- **Framework**: Next.js 15.1.6 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: JSON file storage
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone git@github.com:The-Portland-Company/focus-forge.git
cd focus-forge
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3244](http://localhost:3244) in your browser

## Importing Todoist Data

Place your Todoist CSV backup files in the `documents/todoist-backup/` directory and run:

```bash
npm run migrate:todoist
```

This will import all your projects, tasks, and organizations into the application.

## Project Structure

```
├── app/                # Next.js app directory
│   ├── api/           # API routes
│   └── [view]/        # Dynamic view pages
├── components/        # React components
├── lib/              # Utility functions and types
├── data/             # JSON database storage
├── documents/        # Import data directory
├── mobile/          # Capacitor (iOS/Electron) setup
└── scripts/          # Migration and utility scripts
```

## Mobile (Capacitor)

Use the shared web UI in native shells:

```bash
# iOS
npm run mobile:dev
npm run mobile:staging
npm run mobile:prod

# Electron
npm run electron:dev
npm run electron:staging
npm run electron:prod
```

Env switching:
- `CAPACITOR_SERVER=local|staging|production`
- `CAPACITOR_LOCAL_URL` (defaults to `http://localhost:3244`)
- `CAPACITOR_SERVER_URL` (overrides target)

## Key Features

### Task Management
- Create tasks with titles, descriptions, due dates, and priorities
- Set deadlines separate from due dates
- Mark tasks as completed
- Edit tasks inline or via modal
- Bulk reschedule overdue tasks

### Organization
- Create organizations to group related projects
- Drag and drop projects between organizations
- Archive projects to declutter your workspace
- Delete organizations with full cascade deletion

### Views
- **Today**: See all tasks due today or overdue
- **Upcoming**: View future tasks (coming soon)
- **Search**: Find tasks quickly (coming soon)
- **Favorites**: Quick access to starred projects

## Related Packages

### Feedback Widget (In Development)
A lightweight NPM package that can be installed on any web app to collect visual user feedback. Users can place annotated dots on any page with notes, which are then viewable in Focus: Forge.

**Status**: Requirements gathering
**Documentation**: See `docs/feedback-widget-package.md`

## Contributing

This project is actively maintained by The Portland Company. For questions or support, please open an issue on GitHub.

## License

Proprietary - All rights reserved by The Portland Company
