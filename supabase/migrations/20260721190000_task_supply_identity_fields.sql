-- Supplies gain an identity: either a make/model pair (a specific product) or a
-- free-form type (a commodity, e.g. "2x6x8 doug fir"). The two are alternatives
-- rather than a fixed enum on the row — a supply is naturally one or the other,
-- and forcing a discriminator column would mean backfilling every existing row.
-- Which set is in use is inferred from which columns are populated, so existing
-- supplies stay valid with all three null.
--
-- Additive only: new nullable columns, no rewrite of existing rows.
alter table public.tasks
  add column if not exists supply_make text,
  add column if not exists supply_model text,
  add column if not exists supply_type text;

comment on column public.tasks.supply_make is
  'Manufacturer of a specific product, paired with supply_model.';
comment on column public.tasks.supply_model is
  'Model / part number of a specific product, paired with supply_make.';
comment on column public.tasks.supply_type is
  'Free-form commodity description, used instead of make/model.';
