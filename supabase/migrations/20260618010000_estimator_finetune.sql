-- Phase 2 of the fine-tuned-estimator plan: opt-in consent for contributing
-- examples to the pooled platform training set, plus a job-tracking table for
-- fine-tune runs (dataset export -> LoRA train -> adapter upload). Idempotent.

-- Consent: only opted-in users' examples enter the shared training pool. The
-- per-user task_estimate_examples data stays private regardless; this flag only
-- governs inclusion in the cross-user platform model dataset.
alter table public.profiles
  add column if not exists contributes_training_data boolean not null default false;

-- Fine-tune job tracking. Operator/admin-scoped for the shared platform model
-- now; per-user adapters (Phase 4) reuse this via created_by.
create table if not exists public.fine_tune_jobs (
  id uuid primary key default gen_random_uuid(),
  -- 'platform' (pooled) or 'user' (per-user adapter, Phase 4).
  scope text not null default 'platform' check (scope in ('platform', 'user')),
  created_by uuid references auth.users(id) on delete set null,
  base_model text not null default '@cf/google/gemma-2b-it-lora',
  -- Where the exported JSONL dataset lives (e.g. an R2 key) + row count.
  dataset_ref text,
  example_count integer,
  -- The resulting Workers AI LoRA adapter name once trained + uploaded.
  adapter_ref text,
  status text not null default 'pending'
    check (status in ('pending', 'exporting', 'training', 'uploading', 'ready', 'failed', 'canceled')),
  error text,
  -- Free-form metrics (held-out MAE, epochs, etc.).
  metrics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fine_tune_jobs_created_by_idx
  on public.fine_tune_jobs (created_by, created_at desc);

alter table public.fine_tune_jobs enable row level security;

-- Owners can see their own jobs (per-user adapters). Platform jobs have no
-- created_by and are managed via the service role (admin), which bypasses RLS.
drop policy if exists "fine_tune_jobs_own_select" on public.fine_tune_jobs;
create policy "fine_tune_jobs_own_select"
  on public.fine_tune_jobs for select
  using (auth.uid() = created_by);

drop trigger if exists update_fine_tune_jobs_updated_at on public.fine_tune_jobs;
create trigger update_fine_tune_jobs_updated_at
  before update on public.fine_tune_jobs
  for each row execute function public.update_updated_at_column();
