-- Per-user Email Inbox reading pane (Conversation View) sizing on Desktop.
--   email_panel_default_width_pct: initial reading-pane width as a percent of
--     the viewport/container, used before any manual drag-resize override.
--   email_panel_width_px: the user's explicit drag-resized width in pixels.
--     NULL means "no manual override yet" so the percentage default applies.

alter table public.profiles
add column if not exists email_panel_default_width_pct integer not null default 60;

alter table public.profiles
add column if not exists email_panel_width_px integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_panel_default_width_pct_check'
  ) then
    alter table public.profiles
    add constraint profiles_email_panel_default_width_pct_check
    check (
      email_panel_default_width_pct >= 30
      and email_panel_default_width_pct <= 75
    );
  end if;
end
$$;

update public.profiles
set email_panel_default_width_pct = 60
where email_panel_default_width_pct is null;
