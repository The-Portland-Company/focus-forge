-- Private, trainable spam detection: a growing set of user-labeled (and seeded)
-- spam/ham examples embedded for k-NN cosine retrieval. Mirrors the ai_memory
-- template (20260607000000_ai_memory.sql): same RLS/grant/index idiom and the
-- match_* RPC pattern (supabase-js cannot ORDER BY the <=> operator).
-- Embeddings are 768-d (@cf/baai/bge-base-en-v1.5) — NOT the 1536-d OpenAI
-- vectors used by ai_memories. See web-app/lib/spam/server.ts.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- spam_signatures — labeled examples (embedded) that back the k-NN classifier
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spam_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  mailbox_id UUID REFERENCES public.mailboxes(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (label IN ('spam','not_spam')),
  input_text TEXT NOT NULL,
  note TEXT,
  weight NUMERIC NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'user_labeled' CHECK (source IN ('user_labeled','ai_seed','imported')),
  source_count INTEGER NOT NULL DEFAULT 1,
  embedding vector(768),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spam_signatures_scope ON public.spam_signatures (user_id, label, status);
CREATE INDEX IF NOT EXISTS idx_spam_signatures_created ON public.spam_signatures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spam_signatures_thread ON public.spam_signatures (thread_id);
-- Cosine ANN index (ivfflat). Safe at small scale; falls back to exact scan.
CREATE INDEX IF NOT EXISTS idx_spam_signatures_embedding ON public.spam_signatures
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- match_spam_signatures — near-verbatim of match_ai_memories, k-NN cosine over
-- a user's active signatures. Never returns archived/deleted rows. Score blends
-- cosine similarity with weight so reinforced examples dominate the vote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_spam_signatures(
  p_user_id UUID,
  p_query_embedding vector(768),
  p_organization_id UUID DEFAULT NULL,
  p_mailbox_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  label TEXT,
  input_text TEXT,
  source TEXT,
  weight NUMERIC,
  similarity REAL,
  score REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.label, s.input_text, s.source, s.weight,
    (1 - (s.embedding <=> p_query_embedding))::real AS similarity,
    ((1 - (s.embedding <=> p_query_embedding)) * (0.7 + 0.3 * LEAST(s.weight, 3) / 3.0))::real AS score
  FROM public.spam_signatures s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND s.embedding IS NOT NULL
    AND (p_organization_id IS NULL OR s.organization_id IS NULL OR s.organization_id = p_organization_id)
    AND (p_mailbox_id IS NULL OR s.mailbox_id IS NULL OR s.mailbox_id = p_mailbox_id)
  ORDER BY score DESC
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.match_spam_signatures(UUID, vector, UUID, UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS — own rows + org-scoped, mirroring ai_memories policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.spam_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_spam_signatures" ON public.spam_signatures;
CREATE POLICY "owner_select_spam_signatures" ON public.spam_signatures FOR SELECT
  USING (user_id = auth.uid()
         OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
         OR public.is_super_admin());

DROP POLICY IF EXISTS "owner_all_spam_signatures" ON public.spam_signatures;
CREATE POLICY "owner_all_spam_signatures" ON public.spam_signatures FOR ALL
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spam_signatures TO authenticated;
