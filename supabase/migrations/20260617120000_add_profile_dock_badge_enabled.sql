-- Per-user macOS Dock badge preference.
--   dock_badge_enabled: when true (default), the app keeps the unread-email
--     count on the Dock icon. When false, the badge is cleared and the
--     DockBadgeSync poller short-circuits so it stops setting the badge.

alter table public.profiles
add column if not exists dock_badge_enabled boolean not null default true;

update public.profiles
set dock_badge_enabled = true
where dock_badge_enabled is null;
