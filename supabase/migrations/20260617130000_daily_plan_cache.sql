-- ---------------------------------------------------------------------------
-- daily_plan_cache — server-side per-user/day cache of the generated Daily Plan.
--
-- The Daily Plan was previously cached only in the browser's localStorage (per
-- day), so a user on multiple devices re-ran the AI planner on each device.
-- This table is the cross-device source of truth: when a plan for
-- (user_id, plan_date) already exists, the API returns it instead of calling
-- the AI again. An explicit Replan bypasses the cache and overwrites the row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_plan_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_date)
);

ALTER TABLE public.daily_plan_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_plan_cache_own_select" ON public.daily_plan_cache;
CREATE POLICY "daily_plan_cache_own_select"
  ON public.daily_plan_cache FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_plan_cache_own_insert" ON public.daily_plan_cache;
CREATE POLICY "daily_plan_cache_own_insert"
  ON public.daily_plan_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_plan_cache_own_update" ON public.daily_plan_cache;
CREATE POLICY "daily_plan_cache_own_update"
  ON public.daily_plan_cache FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_plan_cache_own_delete" ON public.daily_plan_cache;
CREATE POLICY "daily_plan_cache_own_delete"
  ON public.daily_plan_cache FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse the shared updated_at maintenance trigger.
DROP TRIGGER IF EXISTS update_daily_plan_cache_updated_at ON public.daily_plan_cache;
CREATE TRIGGER update_daily_plan_cache_updated_at BEFORE UPDATE ON public.daily_plan_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
