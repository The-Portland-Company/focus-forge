-- Explicit per-thread inbox-tab assignment. When set, a thread is treated as
-- "moved" into that tab: it appears ONLY under that tab (not under other
-- rule-matched category tabs, and not under "All"), overriding rule-based tab
-- membership. Null = unassigned (normal rule-based matching). Additive, nullable.
alter table public.email_threads
  add column if not exists inbox_tab_id uuid
  references public.email_inbox_tabs(id) on delete set null;

create index if not exists email_threads_inbox_tab_idx
  on public.email_threads (inbox_tab_id);
