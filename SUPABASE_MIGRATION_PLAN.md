# Supabase Migration and Authentication Plan

## Overview
This plan outlines the migration from file-based database to Supabase with full authentication, role-based access control (RBAC), and multi-organization support.

## Phase 1: Environment Setup and Initial Configuration

### 1.1 Environment Variables
- Add Supabase credentials to `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://qjgtmaomcnbmdhvatelf.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=***REMOVED***
  SUPABASE_SERVICE_ROLE_KEY=***REMOVED***
  SUPABASE_DB_PASSWORD=***REMOVED***
  ```

### 1.2 Install Dependencies
- `@supabase/supabase-js`
- `@supabase/auth-helpers-nextjs`
- `@supabase/auth-ui-react`
- `@supabase/auth-ui-shared`

## Phase 2: Database Schema Design

### 2.1 Database Tables

#### profiles (extends Supabase auth.users)
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'team_member' CHECK (role IN ('super_admin', 'admin', 'team_member')),
  profile_color TEXT DEFAULT '#EA580C',
  animations_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### organizations
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#EA580C',
  archived BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### user_organizations (junction table)
```sql
CREATE TABLE user_organizations (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);
```

#### projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#EA580C',
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_favorite BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  budget DECIMAL,
  deadline TIMESTAMPTZ,
  order_index INTEGER DEFAULT 0,
  todoist_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### tasks
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TIME,
  priority INTEGER DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
  deadline TIMESTAMPTZ,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  todoist_id TEXT,
  recurring_pattern TEXT,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  indent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### tags
```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#EA580C',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### task_tags (junction table)
```sql
CREATE TABLE task_tags (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
```

#### reminders
```sql
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('preset', 'custom')),
  value TEXT NOT NULL,
  unit TEXT CHECK (unit IN ('minutes', 'hours', 'days', 'weeks', 'months', 'years')),
  amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### attachments
```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Row Level Security (RLS) Policies

#### Super Admin Policies
- Full access to all tables and all rows

#### Organization-based Policies
```sql
-- Users can only see organizations they belong to
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM user_organizations WHERE organization_id = id
    ) OR 
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Users can only see projects in their organizations
CREATE POLICY "Users can view projects in their organizations" ON projects
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Similar policies for tasks, etc.
```

## Phase 3: Authentication Implementation

### 3.1 Auth Components
1. Create `/app/auth/login/page.tsx` - Login page
2. Create `/app/auth/signup/page.tsx` - Signup page (restricted)
3. Create `/lib/supabase/client.ts` - Supabase client setup
4. Create `/lib/supabase/server.ts` - Server-side Supabase client
5. Create `/middleware.ts` - Auth middleware

### 3.2 Auth Flow
1. Unauthenticated users redirected to login
2. Login with email/password
3. Store session in cookies
4. Check user's organizations on login
5. Set default organization in context

### 3.3 User Creation Flow
1. Only accessible from Organization settings
2. Admin/Super Admin can invite users
3. New users get email with temporary password
4. New users must change password on first login
5. New users automatically associated with inviting organization

## Phase 4: Migration Strategy

### 4.1 Data Migration Script
1. Create migration script to:
   - Create super admin user (spencerdhill@protonmail.com)
   - Create demo user (demo@demo.com)
   - Migrate existing organizations
   - Migrate existing projects
   - Migrate existing tasks with relationships
   - Associate demo user with Portland organization

### 4.2 Code Migration
1. Update all database operations to use Supabase
2. Replace file-based adapter with Supabase adapter
3. Add auth checks to all API routes
4. Update UI components to handle auth state

## Phase 5: Security Audit

### 5.1 Security Best Practices
1. **Environment Variables**: All sensitive data in .env.local, never committed
2. **RLS Policies**: Enforce data isolation at database level
3. **API Security**: All routes check authentication and authorization
4. **Password Security**: 
   - Supabase handles password hashing (bcrypt)
   - Enforce strong password requirements
   - Temporary passwords must be changed
5. **Session Management**: 
   - Secure cookie-based sessions
   - Session expiration
   - Logout functionality
6. **Input Validation**: Validate all user inputs
7. **SQL Injection**: Use parameterized queries (Supabase handles this)
8. **XSS Protection**: React handles this by default
9. **CORS**: Properly configured in Supabase

### 5.2 Role-based Access Control
- Super Admin: Full system access (only spencerdhill@protonmail.com)
- Admin: Full access within assigned organizations
- Team Member: View/edit within assigned organizations, no user management

### 5.3 Data Privacy
- Users can only see data from their organizations
- No cross-organization data leakage
- Audit logs for sensitive operations

## Phase 6: Implementation Order

1. **Week 1**: Environment setup, Supabase client configuration
2. **Week 1**: Create database schema and RLS policies
3. **Week 2**: Implement authentication UI and flow
4. **Week 2**: Create user management within organizations
5. **Week 3**: Migrate database operations to Supabase
6. **Week 3**: Run data migration script
7. **Week 4**: Testing and security audit
8. **Week 4**: Deploy and monitor

## Rollback Plan
1. Keep file-based system operational during migration
2. Feature flag to switch between adapters
3. Database backup before migration
4. Ability to export data back to JSON if needed

## Testing Strategy
1. Unit tests for all auth functions
2. Integration tests for RLS policies
3. E2E tests for auth flows
4. Security penetration testing
5. Performance testing with multiple organizations/users