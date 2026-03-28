-- AI Project Planner persistence tables

CREATE TABLE IF NOT EXISTS public.ai_planner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft_ready', 'approved', 'archived')),
  model text NOT NULL DEFAULT 'gpt-4.1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_planner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_planner_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content_text text,
  content_json jsonb,
  token_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_planner_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_planner_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('plan', 'task_blueprint')),
  payload_json jsonb NOT NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_planner_sessions_user_project
  ON public.ai_planner_sessions(user_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_planner_messages_session
  ON public.ai_planner_messages(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_planner_artifacts_session
  ON public.ai_planner_artifacts(session_id, created_at DESC);

ALTER TABLE public.ai_planner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_planner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_planner_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view planner sessions" ON public.ai_planner_sessions;
DROP POLICY IF EXISTS "Users can create planner sessions" ON public.ai_planner_sessions;
DROP POLICY IF EXISTS "Users can update planner sessions" ON public.ai_planner_sessions;
DROP POLICY IF EXISTS "Users can delete planner sessions" ON public.ai_planner_sessions;

DROP POLICY IF EXISTS "Users can view planner messages" ON public.ai_planner_messages;
DROP POLICY IF EXISTS "Users can create planner messages" ON public.ai_planner_messages;
DROP POLICY IF EXISTS "Users can update planner messages" ON public.ai_planner_messages;
DROP POLICY IF EXISTS "Users can delete planner messages" ON public.ai_planner_messages;

DROP POLICY IF EXISTS "Users can view planner artifacts" ON public.ai_planner_artifacts;
DROP POLICY IF EXISTS "Users can create planner artifacts" ON public.ai_planner_artifacts;
DROP POLICY IF EXISTS "Users can update planner artifacts" ON public.ai_planner_artifacts;
DROP POLICY IF EXISTS "Users can delete planner artifacts" ON public.ai_planner_artifacts;

CREATE POLICY "Users can view planner sessions"
ON public.ai_planner_sessions
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create planner sessions"
ON public.ai_planner_sessions
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update planner sessions"
ON public.ai_planner_sessions
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete planner sessions"
ON public.ai_planner_sessions
FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can view planner messages"
ON public.ai_planner_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_messages.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create planner messages"
ON public.ai_planner_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_messages.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update planner messages"
ON public.ai_planner_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_messages.session_id
      AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_messages.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete planner messages"
ON public.ai_planner_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_messages.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view planner artifacts"
ON public.ai_planner_artifacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_artifacts.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create planner artifacts"
ON public.ai_planner_artifacts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_artifacts.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update planner artifacts"
ON public.ai_planner_artifacts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_artifacts.session_id
      AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_artifacts.session_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete planner artifacts"
ON public.ai_planner_artifacts
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_planner_sessions s
    WHERE s.id = ai_planner_artifacts.session_id
      AND s.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_ai_planner_sessions_updated_at ON public.ai_planner_sessions;
CREATE TRIGGER update_ai_planner_sessions_updated_at
BEFORE UPDATE ON public.ai_planner_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_planner_artifacts_updated_at ON public.ai_planner_artifacts;
CREATE TRIGGER update_ai_planner_artifacts_updated_at
BEFORE UPDATE ON public.ai_planner_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
