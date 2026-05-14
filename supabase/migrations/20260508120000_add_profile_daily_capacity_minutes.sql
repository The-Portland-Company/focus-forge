alter table public.profiles
add column if not exists daily_capacity_minutes integer not null default 300;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_daily_capacity_minutes_check'
  ) then
    alter table public.profiles
    add constraint profiles_daily_capacity_minutes_check
    check (
      daily_capacity_minutes >= 30
      and daily_capacity_minutes <= 1440
    );
  end if;
end
$$;

update public.profiles
set daily_capacity_minutes = 300
where daily_capacity_minutes is null;
