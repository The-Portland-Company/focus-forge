-- Fix: authenticated `INSERT ... RETURNING` into personal_access_tokens failed
-- with "new row violates row-level security policy".
--
-- Root cause: the SELECT policy used can_manage_personal_access_token(), a
-- STABLE SECURITY DEFINER function that re-queries personal_access_tokens for
-- the row. During INSERT ... RETURNING the function runs under the statement
-- snapshot taken *before* the row was inserted, so it cannot see the new row
-- and returns false -> the RETURNING SELECT re-check fails. (A plain SELECT in
-- a later statement works, which is why existing tokens were readable and only
-- the create path broke.) The web app avoided this by inserting through the
-- service-role client, but any normal authenticated client INSERT...RETURNING
-- (e.g. desktop/mobile PAT registration) failed.
--
-- Fix: compare the row's own created_by column directly instead of re-querying
-- the table. This is snapshot-safe, simpler, and faster. Same effective rule.

DROP POLICY IF EXISTS "Users can view own personal access tokens"
  ON public.personal_access_tokens;

CREATE POLICY "Users can view own personal access tokens"
ON public.personal_access_tokens
FOR SELECT
USING (
  created_by = auth.uid()
  OR public.is_super_admin()
);

-- Keep UPDATE/DELETE consistent and free of the same self-referential pattern.
DROP POLICY IF EXISTS "Users can update own personal access tokens"
  ON public.personal_access_tokens;

CREATE POLICY "Users can update own personal access tokens"
ON public.personal_access_tokens
FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_super_admin()
)
WITH CHECK (
  created_by = auth.uid()
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Users can delete own personal access tokens"
  ON public.personal_access_tokens;

CREATE POLICY "Users can delete own personal access tokens"
ON public.personal_access_tokens
FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_super_admin()
);
