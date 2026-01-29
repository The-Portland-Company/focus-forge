# Command Center - Future Features Summary

## Overview
This document summarizes the planned Vision Boards, Aspirations, and Goals features for Command Center, along with the data migration and debugging requirements.

## 1. Vision Boards Feature
**Purpose**: Interactive drag-and-drop canvas for visualizing life paths, decisions, and their connections to Aspirations and Goals.

### Key Requirements
- **Dual Canvas Modes**: Both freeform and structured templates
- **Visual Elements**: Text cards, images, shapes, sticky notes, drawing tools
- **Life Path Visualizations**: Combination of decision trees, parallel comparisons, and timeline views
- **Pros/Cons Analysis**: Weighted scoring system for decision making
- **Integration**: Links to Aspirations and Goals

### Technical Highlights
- Canvas rendering with Konva.js or Fabric.js
- Drag-and-drop with React DnD or Framer Motion
- JSONB storage for flexible element data
- Zoom controls (10% - 500%)

**Full Plan**: `/docs/vision-boards-implementation-plan.md`

## 2. Aspirations & Goals Feature
**Purpose**: Hierarchical life planning system with interactive timeline visualization and progress tracking.

### Key Requirements
- **Hierarchy**: Aspirations → Goals → Projects → Tasks
- **Timeline System**: 
  - 12-month default view centered on today
  - Zoom levels from Day to Lifetime
  - Play button animation (past → present → future)
- **Progress Tracking**: Automatic calculation, manual override, and weighted system
- **Relationships**: 
  - Many-to-many: Goals ↔ Aspirations
  - One-to-many: Projects → Goals

### Sample Aspirations to Preload
1. **"Have a Homestead"**
   - Goals: "Own land", "Be debt free", "Complete the Greenhouse"
   - Projects: "Complete Don's website" (links to debt free goal)
   - Tasks: "Setup the automatic waterer" (greenhouse)

2. **"Have a Delightful Marriage"**
   - Goals: "Weekly date nights", "Communication improvement"

3. **"Be a Present Father"**
   - Goals: "Daily quality time", "Educational support"

### Technical Highlights
- Timeline visualization with D3.js or Vis.js
- Animation system with Framer Motion
- Progress history tracking for animations
- Virtual scrolling for performance

**Full Plan**: `/docs/aspirations-goals-implementation-plan.md`

## 3. Current Issue: Data Not Displaying

### Problem
User data that should be imported into Supabase is not appearing on the application pages.

### Debugging Steps Needed
1. Verify data exists in Supabase tables
2. Check authentication and user context
3. Verify API endpoints are returning data
4. Check frontend data fetching logic
5. Verify RLS policies in Supabase
6. Check for any console errors

### Potential Causes
- Authentication issues (user not properly logged in)
- RLS (Row Level Security) policies blocking data access
- Incorrect user ID associations in the data
- API endpoints not properly fetching data
- Frontend not properly displaying received data
- Environment variable issues (USE_SUPABASE flag)

## Next Steps
1. Debug and fix the data display issue
2. Ensure all existing tasks and projects are visible
3. Begin implementing the Aspirations & Goals feature
4. Integrate with existing Projects and Tasks
5. Implement Vision Boards feature
6. Create linking between all features

## Notes
- The app name has been updated to "Command Center" in the .env file
- All "Command Center" references should eventually be replaced with "Command Center"
- Future integration with Finance app API for credit card variables