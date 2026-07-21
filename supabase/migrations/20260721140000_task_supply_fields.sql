-- Supplies: a task can be marked as a purchasable line item carrying a
-- quantity, unit price and vendor. Sections subtotal their supplies and the
-- project totals them, in the app and on public share links.
--
-- Price is numeric(12,2) rather than a float so money never accumulates
-- rounding error across a subtotal. Quantity allows fractions (e.g. 2.5 sheets)
-- but is bounded non-negative.
alter table public.tasks
  add column if not exists is_supply boolean not null default false,
  add column if not exists supply_quantity numeric(12, 3),
  add column if not exists supply_price numeric(12, 2),
  add column if not exists supply_vendor text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_supply_quantity_nonneg'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_supply_quantity_nonneg
      check (supply_quantity is null or supply_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_supply_price_nonneg'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_supply_price_nonneg
      check (supply_price is null or supply_price >= 0);
  end if;
end $$;

-- Supplies are read per-project/section; keep the common filter cheap.
create index if not exists tasks_is_supply_idx
  on public.tasks (project_id)
  where is_supply;
