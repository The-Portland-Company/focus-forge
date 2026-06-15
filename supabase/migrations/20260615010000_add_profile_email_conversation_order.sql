-- Per-user Email Inbox Conversation View ordering preference (Desktop + modal).
--   email_conversation_order: order of messages in the thread Conversation list.
--     'oldest_first' (default, classic top-to-bottom) or 'newest_first'.

alter table public.profiles
add column if not exists email_conversation_order text not null default 'oldest_first';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_conversation_order_check'
  ) then
    alter table public.profiles
    add constraint profiles_email_conversation_order_check
    check (email_conversation_order in ('oldest_first', 'newest_first'));
  end if;
end
$$;

update public.profiles
set email_conversation_order = 'oldest_first'
where email_conversation_order is null;
