## Autonomy — Standing Authorization (THIS PROJECT ONLY)

**Scope:** overrides the global `AGENTS.md` deploy gating for this repository only. It does not change autonomy in any other project.

Ship without asking. No "punch it" required, no approval question before merging or deploying:

- Commit, push, open a PR, and **enable auto-merge** (`gh pr merge --auto --squash`).
- Let it merge and deploy to production once CI is green.
- **Additive migrations** (`add column if not exists`, new tables, new indexes, additive grants/revokes) — apply and ship them.

**This authorization is conditional on the CI gates staying in place.** They are what replaced the human check: `.github/workflows/ci.yml` (tests + typecheck + build + gitleaks + Supabase Advisor + migration replay), branch protection requiring those checks, and auto-rollback on a failed post-deploy smoke. If a gate is disabled, broken, or bypassed, autonomy reverts to asking first. Never `--no-verify`, never bypass a required check.

**Still ask first — these are outside the grant:**

- **Destructive migrations**: `drop table/column`, `alter column type`, data backfills that rewrite existing rows, anything not reversible by rolling forward.
- **Secrets, auth middleware, or RLS policy changes** that widen access.
- **Anything that emails, texts, or posts to a third party** on real users' behalf.
- Deleting or overwriting production data.

**Always report after the fact**: what shipped, what the gates said, and anything reverted. Autonomy is not silence.

## Focus Forge Task Tracking (Forge)
- Mirror tasks for this project into Focus Forge under org **The Portland Company**, project **Focus: Forge Web** (Project ID `f0010ce0-cd95-45e7-9db7-ed9443b6634b`).
- AI export / reference: https://focusforge.theportlandcompany.com/projects/f0010ce0-cd95-45e7-9db7-ed9443b6634b/ai-export

## Professional Roles
- You are a web application developer.

## Project Context
- You are building a project manager tool.
- The initial version of the tool will be very similar to ToDoIst.

## Technical Specifications
- The application will be built with Next.js
- The application defaults to dark mode.
- The application is mobile-first.
- You will use a next.js frontend design kit that is optimal for admin apps.
- You will rely on file based database for now. We will later transition to Supabase with PostGres.
- The application port is 3244.
- Project 8823 references should be eliminated.

## Development Principles
- Never use temporary solutions.

## Deployment Responsibilities
- **Playbook:** [docs/DEPLOY-PLAYBOOK.md](../docs/DEPLOY-PLAYBOOK.md) (canonical). Follow it for every production ship.
- **Batch work.** One production push per work slice / end of session — not after every small UI tweak. Local commits mid-slice are fine.
- **Gates.** Prefer targeted tests for touched areas. Do not full `next build` after every edit unless necessary. Full `npm run check:precommit` (tests + full build + gitleaks) is a **release gate**, not a per-keystroke hook. Every commit: gitleaks (if available), RLS hook on `*.sql`, cheap lint/typecheck as needed.
- **After push:** watch **one** GitHub Actions deploy run. Concurrency cancels in-progress deploys; do not stack watchers or thrash redeploys.
- **On failure:** read health + deploy/container logs first. Classify before another push:
  - PGRST002 / schema cache / DB timeout → fix Supabase/PostgREST, do **not** push app commits
  - Build/type error → fix code, **one** push
  - Middleware/public route wrong while health is green → check health `build.git_commit` vs expected SHA before cache-bust commits
  - Max one automatic/redeploy attempt after a real fix
- **Smoke once** after green: `/api/health` 200 + critical public paths.
- **Security:** never `--no-verify` to skip secrets/RLS; keep auth middleware; allowlist public routes carefully.
- Never say something is "fully functional" or "ready to use" — always say **"Please test."**
- Never change user passwords without permission.
- Do not rely on me for testing your solutions.
- Always store .md files in the docs folder, except `CLAUDE.md` / `claude.md`.

## Roadmap

### Project Overview
A Todoist-like project management application built with Next.js, currently migrating from file-based storage to Supabase with authentication and multi-organization support.

### Completed Features ✅

#### Core Task Management
- ~~Create, edit, and delete tasks~~
- ~~Task properties: name, description, due date, due time, priority (1-4)~~
- ~~Task completion tracking with timestamps~~
- ~~Subtasks with parent-child relationships and indentation~~
- ~~Task tags with color coding~~
- ~~Task reminders (preset and custom)~~
- ~~Task attachments support~~
- ~~Recurring task patterns~~
- ~~Task assignment to users~~

#### Project & Organization Management
- ~~Multiple organizations support~~
- ~~Projects within organizations~~
- ~~Project properties: name, description, color, budget, deadline~~
- ~~Project favoriting~~
- ~~Project archiving~~
- ~~Drag-and-drop reordering for projects and organizations~~
- ~~Organization settings modal with project associations~~
- ~~Organization descriptions~~

#### User Interface
- ~~Dark mode by default~~
- ~~Mobile-first responsive design~~
- ~~Sidebar navigation with collapsible organizations~~
- ~~Today view~~
- ~~Upcoming view~~
- ~~Favorites view~~
- ~~Search functionality~~
- ~~Unified task modal for creating and editing~~
- ~~Modern time picker component~~
- ~~Theme system with solid colors and gradients~~
- ~~User profile color customization~~
- ~~Animation toggle setting~~
- ~~Kanban view (component created but not fully integrated)~~

#### UI/UX Improvements
- ~~Reduced font sizes in task modals~~
- ~~Changed subtask icon to indented line (CornerDownRight)~~
- ~~Replaced text buttons with circular + icons for Reminders, Tags, Subtasks~~
- ~~Tag autocomplete with bounce animation for duplicates~~
- ~~Automatic reminder saving on date selection~~
- ~~Reorganized task form layout~~
- ~~Collapse/expand all organizations toggle with persistent state~~
- ~~Settings page with sections: Your Profile, Your Organization, Organizations~~

#### Data Management
- ~~File-based database with JSON storage~~
- ~~Database adapters pattern for future migration~~
- ~~Todoist migration support~~
- ~~Import/export functionality~~

#### API Routes
- ~~/api/database - Main database operations~~
- ~~/api/tasks/[id] - Individual task operations~~
- ~~/api/tasks/batch-update - Bulk task updates~~
- ~~/api/projects/[id] - Project CRUD~~
- ~~/api/projects/reorder - Project ordering~~
- ~~/api/organizations/[id] - Organization CRUD~~
- ~~/api/organizations/reorder - Organization ordering~~
- ~~/api/users/[id] - User profile updates~~
- ~~/api/tags - Tag management~~

### In Progress 🚧

#### Supabase Migration - Phase 1 ✅
- ~~Install Supabase dependencies~~
- ~~Create Supabase client configuration~~
- ~~Create server-side Supabase client~~
- ~~Create auth context provider~~
- ~~Create authentication middleware~~
- ~~Create login page UI~~
- ~~Create database schema SQL file~~
- ~~Set up environment variables~~

#### Supabase Migration - Phase 2 (Next)
- [ ] Run schema creation in Supabase
- [ ] Create initial users (super admin & demo)
- [ ] Implement user signup flow (restricted)
- [ ] Create data migration script
- [ ] Update all API routes to use Supabase

### Upcoming Features 📋

#### Authentication & Authorization
- [ ] Email/password authentication via Supabase Auth
- [ ] Role-based access control (Super Admin, Admin, Team Member)
- [ ] Multi-organization user support
- [ ] Organization-scoped user creation
- [ ] Password reset functionality
- [ ] First-time login password change requirement
- [ ] Session management
- [ ] Logout functionality

#### User Management
- [ ] User invitation system (admin only)
- [ ] User profile management
- [ ] User role assignment within organizations
- [ ] User removal from organizations
- [ ] User activity tracking

#### Data Migration
- [ ] Migrate existing organizations to Supabase
- [ ] Migrate existing projects with proper associations
- [ ] Migrate existing tasks with all relationships
- [ ] Preserve all timestamps and metadata
- [ ] Create demo organization with sample data

#### Security Enhancements
- [ ] Row Level Security (RLS) implementation
- [ ] API route authentication checks
- [ ] Input validation and sanitization
- [ ] Rate limiting
- [ ] Audit logging for sensitive operations

#### UI Enhancements
- [ ] Loading states during auth operations
- [ ] Error handling for auth failures
- [ ] Organization switcher in UI
- [ ] User profile dropdown with logout
- [ ] Permission-based UI elements
- [ ] Invite user modal

#### Mobile App
- [ ] iOS app using Capacitor (partially scaffolded)
- [ ] Android app support
- [ ] Mobile-specific optimizations
- [ ] Push notifications

#### Email Integration
- [ ] Implement Resend for transactional emails
  - [ ] Password reset emails
  - [ ] User invitation emails
  - [ ] Task reminder notifications
  - [ ] Daily/weekly digest emails
- [ ] Configure email templates
- [ ] Add email preferences to user settings

#### Additional Features
- [ ] Real-time collaboration
- [ ] Task comments
- [ ] Activity feed
- [ ] Email notifications (via Resend)
- [ ] Calendar integration
- [ ] Time tracking
- [ ] Reports and analytics
- [ ] Bulk operations UI
- [ ] Keyboard shortcuts
- [ ] Task templates
- [ ] Project templates

### Technical Debt & Improvements 🔧

- [ ] Remove screenshot files from repository
- [ ] Implement proper error boundaries
- [ ] Add comprehensive test suite
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] SEO optimization
- [ ] Documentation
- [ ] API documentation
- [ ] Deployment guides

### Development Notes 📝

#### Current State (January 2025)
- Application is functional with file-based storage
- Beginning migration to Supabase for multi-user support
- Auth system partially implemented but not yet connected
- All existing features continue to work during migration

#### Supabase Configuration
- Project created with credentials stored in `.env.local`
- Database schema designed with full RLS policies
- Using @supabase/ssr for Next.js integration
- Service role key available for admin operations

#### User Accounts Plan
1. **Super Administrator**: spencerdhill@protonmail.com (password: REDACTED)
2. **Demo Administrator**: demo@demo.com (password: Demo) - associated with Portland organization
3. Default role for new users: Team Member
4. Users can belong to multiple organizations

#### Migration Strategy
- Incremental migration maintaining current functionality
- Feature flags to switch between file and Supabase adapters
- All existing data will be preserved
- Rollback plan included if needed

#### Security Considerations
- All credentials in `.env.local` (gitignored)
- RLS policies enforce data isolation
- Supabase handles password hashing
- Session-based authentication
- Organization-based data access

#### Next Immediate Steps
1. Run the schema.sql in Supabase dashboard
2. Create the two initial user accounts
3. Begin implementing the data migration script
4. Update API routes one by one to use Supabase
5. Test authentication flow end-to-end

#### Important Files Created
- `/lib/supabase/client.ts` - Browser Supabase client
- `/lib/supabase/server.ts` - Server Supabase client
- `/lib/supabase/database.types.ts` - TypeScript types
- `/contexts/auth-context.tsx` - Auth context provider
- `/middleware.ts` - Route protection
- `/app/auth/login/page.tsx` - Login page
- `/supabase/schema.sql` - Complete database schema
- `/.env.local` - Supabase credentials (gitignored)
- `/SUPABASE_MIGRATION_PLAN.md` - Detailed migration plan

#### Git Status
- Last commit: "Add organization settings and user profile features"
- All changes committed and pushed (push may have timed out but likely succeeded)
- Working on Supabase migration Phase 1 (completed)

#### Known Issues
- npm audit shows 1 critical vulnerability (not addressed)
- Many screenshot PNG files in root (should be cleaned up)
- Some TypeScript types may need updates for Supabase

#### Architecture Decisions
- Using Next.js app router
- Tailwind CSS for styling
- Lucide React for icons
- Shadcn/ui components
- File-based DB transitioning to Supabase
- React Context for state management
- Server-side rendering where possible