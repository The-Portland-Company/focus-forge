-- Supabase Security Advisor: SECURITY DEFINER functions should have an immutable search_path.
-- Some of these are Supabase-managed helpers. On many projects, the `postgres` role is not
-- the owner, so ALTER FUNCTION will fail. We catch and log instead of failing the migration.

DO $do$
BEGIN
  BEGIN
    ALTER FUNCTION graphql.get_schema_version() SET search_path = '';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER FUNCTION graphql.get_schema_version(): insufficient privilege';
  END;

  BEGIN
    ALTER FUNCTION graphql.increment_schema_version() SET search_path = '';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER FUNCTION graphql.increment_schema_version(): insufficient privilege';
  END;

  BEGIN
    ALTER FUNCTION storage.delete_leaf_prefixes(text[], text[]) SET search_path = '';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER FUNCTION storage.delete_leaf_prefixes(text[], text[]): insufficient privilege';
  END;
END
$do$;
