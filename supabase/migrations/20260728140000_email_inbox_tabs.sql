-- User-defined inbox tabs at the top of the email inbox. Each tab is a saved
-- filter defined by rules (jsonb: { matchMode, conditions[] }). Ordered per
-- user; is_default marks the pre-seeded system defaults.
create table if not exists public.email_inbox_tabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  order_index integer not null default 0,
  rules_json jsonb not null default '{"matchMode":"any","conditions":[]}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_inbox_tabs_user_idx
  on public.email_inbox_tabs (user_id, order_index);

alter table public.email_inbox_tabs enable row level security;

drop policy if exists email_inbox_tabs_own on public.email_inbox_tabs;
create policy email_inbox_tabs_own on public.email_inbox_tabs
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.email_inbox_tabs to authenticated;
