-- Run on LIVE (read-only) before and after applying 20261028*, save both outputs
-- and `diff` them. Expected diff: exactly the policies listed in
-- docs/multi-org-project-ownership.md plus 4 new policies on project_organizations.
--   psql "$DATABASE_URL" -X -At -f supabase/tests/pg_policies_snapshot.sql > before.txt
select schemaname || '.' || tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',')
       || E'\n  USING: ' || regexp_replace(coalesce(qual, '-'), E'\\s+', ' ', 'g')
       || E'\n  CHECK: ' || regexp_replace(coalesce(with_check, '-'), E'\\s+', ' ', 'g')
from pg_policies
order by schemaname, tablename, policyname;
