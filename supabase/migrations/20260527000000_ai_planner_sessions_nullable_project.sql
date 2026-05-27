-- Allow global (no-project) AI assistant sessions.
-- The assistant is now mounted app-wide, not just on project pages, so a
-- session may not belong to any project. Make project_id nullable; existing
-- project-scoped sessions are unaffected. Idempotent: DROP NOT NULL is a no-op
-- if the column is already nullable.
ALTER TABLE public.ai_planner_sessions ALTER COLUMN project_id DROP NOT NULL;
