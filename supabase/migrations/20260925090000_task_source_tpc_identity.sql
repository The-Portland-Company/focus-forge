-- Additive: map TPC Auth identities to Forge profiles, and record where a
-- task came from (client app + optional external URL).
--
-- Background: Swarm Tester (and other TPC Auth clients) authenticate to
-- Forge's mobile API with an OAuth access token whose `sub` is a TPC person
-- id, NOT a Forge auth.users/profiles id. Using it directly as `created_by`
-- violates the FK. `profiles.tpc_sub` lets us resolve the real Forge profile
-- once (by tpc_sub, falling back to email) and remember the mapping.

alter table public.profiles
  add column if not exists tpc_sub text;

create unique index if not exists profiles_tpc_sub_key
  on public.profiles (tpc_sub)
  where tpc_sub is not null;

alter table public.tasks
  add column if not exists source text;

alter table public.tasks
  add column if not exists source_url text;
