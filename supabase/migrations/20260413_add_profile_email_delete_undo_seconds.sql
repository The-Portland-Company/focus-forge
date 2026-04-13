alter table public.profiles
add column if not exists email_delete_undo_seconds integer not null default 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_delete_undo_seconds_check'
  ) then
    alter table public.profiles
    add constraint profiles_email_delete_undo_seconds_check
    check (
      email_delete_undo_seconds >= 5
      and email_delete_undo_seconds <= 3600
    );
  end if;
end
$$;

update public.profiles
set email_delete_undo_seconds = 60
where email_delete_undo_seconds is null;
