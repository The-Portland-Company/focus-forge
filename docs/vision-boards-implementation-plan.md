# Vision Boards Implementation Plan

## Overview
Interactive drag-and-drop canvas system for visualizing life paths, decisions, and their connections to Aspirations and Goals.

## Core Features

### 1. Canvas Types
- **Freeform Mode**: Open canvas with drag-and-drop placement anywhere
- **Structured Templates**: Pre-defined layouts (quadrants, grids, hierarchies)
- **Template Library**: Common templates for life planning, decision making, goal mapping

### 2. Visual Elements
- **Text Cards**: Resizable, styled text boxes with rich formatting
- **Images**: Upload from device or paste URLs, with resize/crop capabilities
- **Shapes & Connectors**: Arrows, lines, circles, rectangles for relationships
- **Sticky Notes**: Color-coded notes for quick thoughts
- **Drawing Tools**: Freehand drawing with pen/highlighter

### 3. Life Path Visualizations
- **Decision Trees**: Branching paths showing choices and outcomes
- **Parallel Comparisons**: Side-by-side path comparisons with pros/cons
- **Timeline Paths**: Chronological progression with milestones
- **Hybrid Views**: Combine multiple visualization types on one board

### 4. Pros & Cons Features
- **Pro/Con Lists**: Attached to any path or decision point
- **Weighted Scoring**: Optional importance ratings
- **Visual Indicators**: Color coding (green/red) for quick assessment
- **Comparison Matrix**: Tabular view for multiple options

## Technical Architecture

### Database Schema
```sql
-- Vision Boards
CREATE TABLE vision_boards (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('freeform', 'structured')),
  template_id UUID REFERENCES vision_board_templates(id),
  thumbnail TEXT, -- Canvas snapshot
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canvas Elements
CREATE TABLE vision_board_elements (
  id UUID PRIMARY KEY,
  board_id UUID REFERENCES vision_boards(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('text', 'image', 'shape', 'sticky', 'drawing', 'path')),
  content JSONB, -- Stores element-specific data
  position JSONB, -- {x, y, width, height, rotation}
  style JSONB, -- Colors, fonts, borders, etc.
  z_index INTEGER,
  connections JSONB, -- Links to other elements
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Life Paths
CREATE TABLE life_paths (
  id UUID PRIMARY KEY,
  board_id UUID REFERENCES vision_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  path_type TEXT CHECK (path_type IN ('decision_tree', 'timeline', 'comparison')),
  pros JSONB, -- Array of pros with optional weights
  cons JSONB, -- Array of cons with optional weights
  milestones JSONB, -- Key points along the path
  metadata JSONB -- Additional path-specific data
);

-- Board-Aspiration Links
CREATE TABLE vision_board_aspirations (
  board_id UUID REFERENCES vision_boards(id) ON DELETE CASCADE,
  aspiration_id UUID REFERENCES aspirations(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id, aspiration_id)
);

-- Board-Goal Links  
CREATE TABLE vision_board_goals (
  board_id UUID REFERENCES vision_boards(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id, goal_id)
);
```

### Frontend Components

#### Core Components
1. **VisionBoardCanvas**: Main canvas component with drag-and-drop
2. **CanvasToolbar**: Tools for adding elements, shapes, text
3. **ElementInspector**: Properties panel for selected elements
4. **PathBuilder**: Specialized UI for creating life paths
5. **ProConEditor**: Interface for adding/editing pros and cons

#### Libraries & Technologies
- **React DnD** or **Framer Motion**: Drag and drop functionality
- **Konva.js** or **Fabric.js**: Canvas rendering and manipulation
- **TipTap** or **Slate**: Rich text editing in cards
- **React Flow**: For decision tree visualizations

### API Endpoints
```typescript
// Vision Board CRUD
GET    /api/vision-boards
POST   /api/vision-boards
PUT    /api/vision-boards/:id
DELETE /api/vision-boards/:id

// Canvas Elements
GET    /api/vision-boards/:id/elements
POST   /api/vision-boards/:id/elements
PUT    /api/vision-boards/:id/elements/:elementId
DELETE /api/vision-boards/:id/elements/:elementId

// Life Paths
GET    /api/vision-boards/:id/paths
POST   /api/vision-boards/:id/paths
PUT    /api/vision-boards/:id/paths/:pathId
DELETE /api/vision-boards/:id/paths/:pathId

// Linking to Aspirations/Goals
POST   /api/vision-boards/:id/link-aspiration
POST   /api/vision-boards/:id/link-goal
DELETE /api/vision-boards/:id/unlink-aspiration/:aspirationId
DELETE /api/vision-boards/:id/unlink-goal/:goalId
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Set up database tables
- Create basic canvas component with drag-and-drop
- Implement text cards and basic shapes
- Build save/load functionality

### Phase 2: Visual Elements (Week 2-3)
- Add image upload/URL support
- Implement drawing tools
- Create sticky notes feature
- Add element styling options

### Phase 3: Life Paths (Week 3-4)
- Build decision tree visualization
- Create timeline path component
- Implement pros/cons editor
- Add comparison views

### Phase 4: Integration (Week 4-5)
- Link boards to Aspirations/Goals
- Create navigation between features
- Add board templates
- Implement sharing/collaboration

### Phase 5: Polish (Week 5-6)
- Optimize performance
- Add animations/transitions
- Create onboarding tutorial
- Mobile responsiveness

## UI/UX Considerations

### Desktop View
- Full canvas with sidebar toolbar
- Collapsible properties panel
- Minimap for navigation
- Zoom controls (10% - 500%)

### Mobile View  
- Pan and zoom with touch gestures
- Floating action button for tools
- Simplified element addition
- Read-only mode option

### Accessibility
- Keyboard navigation for all elements
- Screen reader support for canvas items
- High contrast mode
- Alternative text for visual elements

## Performance Optimizations
- Virtual scrolling for large canvases
- Lazy loading of board elements
- Image optimization and caching
- Debounced auto-save
- WebGL rendering for complex boards

## Future Enhancements
- Collaborative editing
- AI-powered suggestions
- Export to PDF/Image
- Version history
- Public board sharing
- Mobile app with offline support