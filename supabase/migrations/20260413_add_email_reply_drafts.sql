create table if not exists public.email_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  source text not null default 'manual' check (source = any (array['manual'::text, 'ai'::text])),
  status text not null default 'draft' check (
    status = any (
      array[
        'draft'::text,
        'scheduled'::text,
        'sending'::text,
        'sent'::text,
        'failed'::text,
        'canceled'::text
      ]
    )
  ),
  reply_mode text not null default 'reply_all' check (
    reply_mode = any (array['reply_all'::text, 'internal_note'::text])
  ),
  subject text not null,
  content_text text,
  content_html text,
  signature_text text,
  to_json jsonb not null default '[]'::jsonb,
  cc_json jsonb not null default '[]'::jsonb,
  attachments_json jsonb not null default '[]'::jsonb,
  scheduled_for timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  context_snapshot_json jsonb not null default '{}'::jsonb,
  ai_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_email_reply_drafts_status
  on public.email_reply_drafts(status);
create index if not exists idx_email_reply_drafts_scheduled_for
  on public.email_reply_drafts(scheduled_for);
create index if not exists idx_email_reply_drafts_thread_id
  on public.email_reply_drafts(thread_id);
create index if not exists idx_email_reply_drafts_project_id
  on public.email_reply_drafts(project_id);
create index if not exists idx_email_reply_drafts_mailbox_id
  on public.email_reply_drafts(mailbox_id);

create unique index if not exists idx_email_reply_drafts_unsent_unique
  on public.email_reply_drafts(thread_id, reply_mode)
  where status = any (array['draft'::text, 'scheduled'::text, 'sending'::text, 'failed'::text]);

alter table public.email_reply_drafts enable row level security;

drop policy if exists "Users can view email reply drafts"
  on public.email_reply_drafts;
create policy "Users can view email reply drafts"
  on public.email_reply_drafts
  for select
  using (public.user_can_access_email_thread(thread_id, auth.uid()));

drop policy if exists "Users can manage email reply drafts"
  on public.email_reply_drafts;
create policy "Users can manage email reply drafts"
  on public.email_reply_drafts
  using (public.user_can_access_email_thread(thread_id, auth.uid()))
  with check (public.user_can_access_email_thread(thread_id, auth.uid()));

drop trigger if exists update_email_reply_drafts_updated_at
  on public.email_reply_drafts;
create trigger update_email_reply_drafts_updated_at
before update on public.email_reply_drafts
for each row execute function public.update_updated_at_column();
