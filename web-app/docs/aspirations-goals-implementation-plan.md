# Aspirations & Goals Implementation Plan

## Overview
Hierarchical life planning system with interactive timeline visualization, progress tracking, and deep integration with Projects and Tasks.

## Core Features

### 1. Hierarchy Structure
- **Aspirations** → **Goals** → **Projects** → **Tasks**
- Many-to-many relationships (Goals ↔ Aspirations)
- One-to-many relationships (Projects → Goals, Tasks → Projects)
- Cross-linking support for complex dependencies

### 2. Timeline System
- **Default View**: 12-month centered on today
- **Zoom Levels**: Day, Week, Month, Quarter, Year, 5-Year, Lifetime
- **Scrolling**: Infinite past and future navigation
- **Play Animation**: Automated progression through time
- **Time Markers**: Past (completed), Present (active), Future (planned)

### 3. Progress Tracking
- **Automatic Calculation**: Based on child completion percentages
- **Manual Override**: Direct progress input
- **Weighted System**: Assign importance to different goals/projects
- **Visual Indicators**: Progress bars, percentage displays, color coding

### 4. Timeline Features
- **Dot Visualization**: Milestones on timeline with size indicating importance
- **Path Lines**: Connect related items across time
- **Play Button**: Animate progress from past → present → future
- **Speed Controls**: Adjust animation playback speed
- **Filters**: Show/hide specific aspirations and their children

## Technical Architecture

### Database Schema
```sql
-- Aspirations (Can be set in past, present, or future)
CREATE TABLE aspirations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE, -- Can be in the past
  target_date DATE,
  completed_date DATE,
  status TEXT CHECK (status IN ('planned', 'active', 'completed', 'paused', 'abandoned')),
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  progress_override BOOLEAN DEFAULT FALSE, -- If true, use manual progress
  manual_progress DECIMAL(5,2),
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals
CREATE TABLE goals (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  target_date DATE,
  completed_date DATE,
  status TEXT CHECK (status IN ('planned', 'active', 'completed', 'paused', 'abandoned')),
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  progress_override BOOLEAN DEFAULT FALSE,
  manual_progress DECIMAL(5,2),
  priority INTEGER DEFAULT 3,
  color TEXT DEFAULT '#10B981',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-Many: Goals can support multiple Aspirations
CREATE TABLE aspiration_goals (
  aspiration_id UUID REFERENCES aspirations(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  weight DECIMAL(5,2) DEFAULT 1.0, -- How much this goal contributes
  PRIMARY KEY (aspiration_id, goal_id)
);

-- Projects linked to Goals (One-to-Many: Project belongs to one Goal)
CREATE TABLE goal_projects (
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  weight DECIMAL(5,2) DEFAULT 1.0,
  PRIMARY KEY (goal_id, project_id)
);

-- Timeline Events for animations
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY,
  entity_type TEXT CHECK (entity_type IN ('aspiration', 'goal', 'project', 'task')),
  entity_id UUID NOT NULL,
  event_type TEXT CHECK (event_type IN ('created', 'started', 'milestone', 'completed', 'paused', 'resumed')),
  event_date DATE NOT NULL,
  description TEXT,
  metadata JSONB
);

-- Milestones within Goals
CREATE TABLE goal_milestones (
  id UUID PRIMARY KEY,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_date DATE,
  completed_date DATE,
  is_completed BOOLEAN DEFAULT FALSE,
  order_index INTEGER
);

-- Progress History for animations
CREATE TABLE progress_history (
  id UUID PRIMARY KEY,
  entity_type TEXT CHECK (entity_type IN ('aspiration', 'goal')),
  entity_id UUID NOT NULL,
  progress_percentage DECIMAL(5,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Frontend Components

#### Core Components
1. **TimelineView**: Main timeline visualization with zoom/pan
2. **AspirationCard**: Display aspiration with progress and goals
3. **GoalCard**: Show goal details with projects and progress
4. **TimelineControls**: Zoom, filter, play controls
5. **ProgressBar**: Animated progress with manual override option
6. **HierarchyTree**: Visual representation of relationships

#### Timeline Specific
1. **TimelineCanvas**: Scrollable, zoomable timeline
2. **TimelineDot**: Milestone/event markers
3. **TimelinePath**: Connecting lines between related items
4. **TimelinePlayer**: Animation controller
5. **TimelineFilter**: Show/hide aspirations and their children

#### Libraries & Technologies
- **D3.js** or **Vis.js**: Timeline visualization
- **Framer Motion**: Smooth animations
- **React Spring**: Physics-based animations for play button
- **Date-fns**: Date manipulation and formatting

### API Endpoints
```typescript
// Aspirations CRUD
GET    /api/aspirations
POST   /api/aspirations
PUT    /api/aspirations/:id
DELETE /api/aspirations/:id

// Goals CRUD
GET    /api/goals
POST   /api/goals
PUT    /api/goals/:id
DELETE /api/goals/:id

// Relationships
POST   /api/aspirations/:id/add-goal
DELETE /api/aspirations/:id/remove-goal/:goalId
POST   /api/goals/:id/add-project
DELETE /api/goals/:id/remove-project/:projectId

// Progress
PUT    /api/aspirations/:id/progress
PUT    /api/goals/:id/progress
GET    /api/progress-history/:entityType/:entityId

// Timeline
GET    /api/timeline/events // With date range filters
GET    /api/timeline/animate // Get animation data
```

## Implementation Phases

### Phase 1: Data Model (Week 1)
- Create database tables
- Set up API endpoints
- Implement basic CRUD operations
- Establish relationships

### Phase 2: Basic UI (Week 1-2)
- Create Aspirations list view
- Build Goals list view
- Implement add/edit forms
- Set up navigation

### Phase 3: Timeline Core (Week 2-3)
- Build timeline canvas component
- Implement zoom functionality
- Add scroll navigation
- Create time markers

### Phase 4: Progress System (Week 3-4)
- Calculate automatic progress
- Add manual override capability
- Implement weighted calculations
- Create progress history tracking

### Phase 5: Timeline Animation (Week 4-5)
- Build play button functionality
- Create smooth animations
- Add speed controls
- Implement timeline filtering

### Phase 6: Integration (Week 5-6)
- Link Projects to Goals
- Connect existing Tasks
- Update progress calculations
- Add cross-navigation

## UI/UX Design

### Timeline View Layouts
1. **Horizontal Timeline** (Default)
   - 12-month view centered on today
   - Aspirations as swim lanes
   - Goals as dots on timeline
   - Vertical lines for months/quarters

2. **Gantt Chart View**
   - Aspirations and Goals as rows
   - Time periods as bars
   - Dependencies shown as arrows

3. **Calendar View**
   - Month/Year calendar
   - Milestones marked on dates
   - Color-coded by aspiration

### Interactive Elements
- **Hover**: Show details tooltip
- **Click**: Expand/collapse hierarchy
- **Drag**: Adjust dates directly on timeline
- **Double-click**: Quick edit mode
- **Right-click**: Context menu

### Mobile Considerations
- Vertical timeline for phones
- Swipe gestures for navigation
- Pinch to zoom
- Simplified milestone view

## Animation System

### Play Button Behavior
1. **Start**: Begin from earliest item or selected date
2. **Progress**: Show items appearing as time advances
3. **Updates**: Animate progress bars filling
4. **Completion**: Mark items as complete with celebration animation
5. **Future**: Show projected progress with transparency

### Animation Speed Options
- 1 day = 0.1 seconds (fast)
- 1 day = 0.5 seconds (normal)
- 1 day = 1 second (slow)
- Custom speed slider

## Sample Data Structure

### Preloaded Aspirations
```javascript
{
  aspirations: [
    {
      name: "Have a Homestead",
      description: "Build a self-sufficient homestead with sustainable living",
      start_date: "2024-01-01",
      target_date: "2028-12-31",
      goals: [
        {
          name: "Own land",
          description: "Purchase suitable property for homesteading",
          projects: ["Research properties", "Secure financing"]
        },
        {
          name: "Be debt free",
          description: "Eliminate all debts to achieve financial freedom",
          projects: ["Complete Don's website", "Pay off credit cards"]
        },
        {
          name: "Complete the Greenhouse",
          description: "Build functional greenhouse for year-round growing",
          projects: ["Greenhouse construction"],
          tasks: ["Setup the automatic waterer"]
        }
      ]
    },
    {
      name: "Have a Delightful Marriage",
      description: "Nurture and strengthen marriage relationship",
      goals: [
        {
          name: "Weekly date nights",
          description: "Consistent quality time together"
        },
        {
          name: "Communication improvement",
          description: "Develop better communication patterns"
        }
      ]
    },
    {
      name: "Be a Present Father",
      description: "Active and engaged parenting",
      goals: [
        {
          name: "Daily quality time",
          description: "Dedicated time with children each day"
        },
        {
          name: "Educational support",
          description: "Active involvement in children's learning"
        }
      ]
    }
  ]
}
```

## Performance Considerations
- Virtual scrolling for long timelines
- Lazy load historical data
- Cache timeline renders
- Debounced progress calculations
- Web Workers for complex animations

## Future Enhancements
- AI suggestions for goal setting
- Integration with external calendars
- Financial goal tracking (via Finance API)
- Social sharing of achievements
- Accountability partners
- Goal templates library
- Machine learning for progress predictions