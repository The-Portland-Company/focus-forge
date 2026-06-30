-- Per-user Email Inbox intro banner dismissal.
--   email_inbox_intro_dismissed: when true, the green intro alert on the
--     default Email Inbox view ("Email threads are pre-processed and rendered
--     as work items.") is hidden. Defaults to false so the banner shows until
--     the user dismisses it. Re-enable via the email settings toggle.

alter table public.profiles
add column if not exists email_inbox_intro_dismissed boolean not null default false;

update public.profiles
set email_inbox_intro_dismissed = false
where email_inbox_intro_dismissed is null;
