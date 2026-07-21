-- Supabase Advisor remediation (security + performance).
--
-- 1. All 25 SECURITY DEFINER functions in `public` were invocable by
--    unauthenticated callers over /rest/v1/rpc, running with owner privileges:
--    authorization helpers (is_org_admin, user_belongs_to_org), time-tracking
--    CRUD, and email-access checks.
--
--    The exposure comes from Postgres' default EXECUTE grant to PUBLIC, which
--    `anon` inherits — revoking `anon` alone leaves it in place (the ACL shows
--    `=X/postgres`). So this revokes PUBLIC as well.
--
--    Verified safe before applying: every one of the 25 also carries an
--    explicit `authenticated=X` grant, so RLS policies and the app keep
--    working; `service_role` is likewise untouched. handle_new_user is a
--    trigger, which does not consult the caller's EXECUTE grant at all.
--
--    Signatures come from pg_get_function_identity_arguments rather than being
--    hand-written, so overloads and `timestamp with time zone` params resolve.
--
-- 2. Two tables carried byte-identical duplicate indexes; the short-named
--    duplicate is dropped in each case.
revoke execute on function public.can_manage_org_api_key(p_user_id uuid, p_org_id uuid) from public, anon;
revoke execute on function public.can_manage_personal_access_token(p_user_id uuid, p_token_id uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.is_org_admin(p_user_id uuid, p_org_id uuid) from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.log_entity_event() from public, anon;
revoke execute on function public.match_ai_memories(p_user_id uuid, p_query_embedding vector, p_memory_types text[], p_organization_id uuid, p_limit integer) from public, anon;
revoke execute on function public.match_spam_signatures(p_user_id uuid, p_query_embedding vector, p_organization_id uuid, p_mailbox_id uuid, p_limit integer) from public, anon;
revoke execute on function public.purge_email_action_log() from public, anon;
revoke execute on function public.time_create_entry(p_organization_id uuid, p_user_id uuid, p_project_id uuid, p_section_id uuid, p_task_ids uuid[], p_title text, p_description text, p_timezone text, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_source text, p_source_metadata jsonb) from public, anon;
revoke execute on function public.time_delete_entry(p_entry_id uuid) from public, anon;
revoke execute on function public.time_get_current_entry(p_org_id uuid, p_user_id uuid) from public, anon;
revoke execute on function public.time_get_entry(p_entry_id uuid) from public, anon;
revoke execute on function public.time_get_org_token(p_hashed_key text) from public, anon;
revoke execute on function public.time_list_api_tokens(p_org_ids uuid[]) from public, anon;
revoke execute on function public.time_list_entries(p_organization_id uuid, p_user_ids uuid[], p_project_id uuid, p_section_id uuid, p_started_after timestamp with time zone, p_ended_before timestamp with time zone) from public, anon;
revoke execute on function public.time_list_groups(p_org_ids uuid[]) from public, anon;
revoke execute on function public.time_touch_org_token(p_token_id uuid) from public, anon;
revoke execute on function public.time_update_entry(p_entry_id uuid, p_organization_id uuid, p_user_id uuid, p_project_id uuid, p_section_id uuid, p_task_ids uuid[], p_title text, p_description text, p_timezone text, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_source_metadata jsonb) from public, anon;
revoke execute on function public.user_belongs_to_org(org_id uuid) from public, anon;
revoke execute on function public.user_can_access_email_thread(p_thread_id uuid, p_user_id uuid) from public, anon;
revoke execute on function public.user_can_access_mailbox(p_mailbox_id uuid, p_user_id uuid) from public, anon;
revoke execute on function public.user_can_manage_mailbox(p_mailbox_id uuid, p_user_id uuid) from public, anon;
revoke execute on function public.user_has_organization_access(org_id uuid) from public, anon;
revoke execute on function public.user_has_project_membership(p_project_id uuid) from public, anon;

-- Duplicate indexes: keep the table-prefixed name, drop the short alias.
drop index if exists public.idx_sync_history_user_id;
drop index if exists public.idx_sync_state_user_id;
