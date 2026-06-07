-- App-level AI memory: event log, embedded precedents, versioned playbooks,
-- and decision traces. See web-app/docs (AI memory plan) / zany-herding-map.
-- Source of truth is these tables — NOT a filesystem rules.md and NOT model weights.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. ai_memory_events — event-sourced decision history (source of truth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('task','email','rule','project','manual','ai_decision')),
  source_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ai_suggested_task_category','user_approved_task_category','user_corrected_task_category',
    'user_moved_task_project','user_changed_priority','user_changed_estimate','user_changed_due_date',
    'user_changed_category','email_taskified','email_classified','email_rule_created','email_rule_approved',
    'memory_created','memory_edited','memory_deleted','memory_archived','playbook_generated','playbook_edited'
  )),
  before_json JSONB,
  after_json JSONB,
  reason TEXT CHECK (reason IN ('ai_suggested','user_approved','user_corrected','manual','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_events_user ON public.ai_memory_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_events_source ON public.ai_memory_events (source_type, source_id);

-- ---------------------------------------------------------------------------
-- 2. ai_memories — learned precedents (embedded for semantic retrieval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'task_categorization','email_categorization','priority_judgment','estimate_judgment',
    'project_routing','due_date_judgment','urgency_judgment','rule_precedent','general_preference'
  )),
  input_text TEXT NOT NULL,
  normalized_summary TEXT NOT NULL,
  outcome_json JSONB NOT NULL,
  source_event_id UUID REFERENCES public.ai_memory_events(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('user_corrected','user_approved','manual_memory','repeated_pattern','ai_suggested','imported')),
  weight NUMERIC NOT NULL DEFAULT 1,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  source_count INTEGER NOT NULL DEFAULT 1,
  embedding vector(1536),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_memories_scope ON public.ai_memories (user_id, memory_type, status);
CREATE INDEX IF NOT EXISTS idx_ai_memories_created ON public.ai_memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memories_source_event ON public.ai_memories (source_event_id);
-- Cosine ANN index (ivfflat). Safe at small scale; falls back to exact scan.
CREATE INDEX IF NOT EXISTS idx_ai_memories_embedding ON public.ai_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- 3. ai_playbooks — generalized, versioned, human-readable guidance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  playbook_type TEXT NOT NULL CHECK (playbook_type IN (
    'task_categorization','email_categorization','project_routing','priority_estimation','global'
  )),
  version INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  source_memory_ids UUID[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  created_by TEXT NOT NULL CHECK (created_by IN ('ai','user','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_playbooks_latest ON public.ai_playbooks (user_id, playbook_type, status, version DESC);

-- ---------------------------------------------------------------------------
-- 4. ai_decision_traces — explainability for every AI decision
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_decision_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('task','email','planning','rule')),
  source_id UUID,
  ai_call_type TEXT NOT NULL CHECK (ai_call_type IN (
    'email_classification','email_to_task','task_categorization','project_routing',
    'priority_estimation','estimate_generation','due_date_estimation','planning'
  )),
  input_text TEXT NOT NULL,
  selected_memory_ids UUID[],
  selected_playbook_id UUID REFERENCES public.ai_playbooks(id) ON DELETE SET NULL,
  matched_rule_ids UUID[],
  prompt_context_summary TEXT,
  ai_output_json JSONB,
  final_output_json JSONB,
  overridden_by_rule BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  model_provider TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_user ON public.ai_decision_traces (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_traces_source ON public.ai_decision_traces (source_type, source_id);

-- ---------------------------------------------------------------------------
-- 5. Similarity search RPC (supabase-js can't ORDER BY the <=> operator)
--    Ranks by cosine similarity blended with weight & confidence.
--    Never returns archived/deleted memories.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_ai_memories(
  p_user_id UUID,
  p_query_embedding vector(1536),
  p_memory_types TEXT[] DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  input_text TEXT,
  normalized_summary TEXT,
  outcome_json JSONB,
  source_type TEXT,
  weight NUMERIC,
  confidence NUMERIC,
  source_count INTEGER,
  similarity REAL,
  score REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.memory_type, m.input_text, m.normalized_summary, m.outcome_json,
    m.source_type, m.weight, m.confidence, m.source_count,
    (1 - (m.embedding <=> p_query_embedding))::real AS similarity,
    ((1 - (m.embedding <=> p_query_embedding)) * (0.6 + 0.25 * LEAST(m.weight, 3) / 3.0 + 0.15 * m.confidence))::real AS score
  FROM public.ai_memories m
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
    AND m.embedding IS NOT NULL
    AND (p_memory_types IS NULL OR m.memory_type = ANY (p_memory_types))
    AND (p_organization_id IS NULL OR m.organization_id IS NULL OR m.organization_id = p_organization_id)
  ORDER BY score DESC
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.match_ai_memories(UUID, vector, TEXT[], UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS — own rows + org-scoped, mirroring entity_events policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_memory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decision_traces ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_memory_events','ai_memories','ai_playbooks','ai_decision_traces']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "owner_select_%1$s" ON public.%1$s;', t);
    EXECUTE format($f$
      CREATE POLICY "owner_select_%1$s" ON public.%1$s FOR SELECT
      USING (user_id = auth.uid()
             OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
             OR public.is_super_admin());
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS "owner_all_%1$s" ON public.%1$s;', t);
    EXECUTE format($f$
      CREATE POLICY "owner_all_%1$s" ON public.%1$s FOR ALL
      USING (user_id = auth.uid() OR public.is_super_admin())
      WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
    $f$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.ai_memory_events, public.ai_memories, public.ai_playbooks, public.ai_decision_traces
  TO authenticated;
