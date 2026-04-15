alter table public.email_threads
  add column if not exists origin text not null default 'inbound';

alter table public.email_threads
  drop constraint if exists email_threads_origin_check;

alter table public.email_threads
  add constraint email_threads_origin_check
  check (origin = any (array['inbound'::text, 'outbound'::text, 'mixed'::text]));

update public.email_threads
set origin = case
  when coalesce(latest_outbound_at, latest_message_at) is not null
    and latest_inbound_at is null then 'outbound'
  when latest_inbound_at is not null and latest_outbound_at is not null then 'mixed'
  else 'inbound'
end
where origin is null
   or origin not in ('inbound', 'outbound', 'mixed');

create table if not exists public.email_outbound_drafts (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
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
  subject text not null default '',
  content_text text,
  content_html text,
  signature_text text,
  to_json jsonb not null default '[]'::jsonb,
  cc_json jsonb not null default '[]'::jsonb,
  bcc_json jsonb not null default '[]'::jsonb,
  attachments_json jsonb not null default '[]'::jsonb,
  scheduled_for timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_email_outbound_drafts_status
  on public.email_outbound_drafts(status);
create index if not exists idx_email_outbound_drafts_scheduled_for
  on public.email_outbound_drafts(scheduled_for);
create index if not exists idx_email_outbound_drafts_mailbox_id
  on public.email_outbound_drafts(mailbox_id);
create index if not exists idx_email_outbound_drafts_project_id
  on public.email_outbound_drafts(project_id);
create index if not exists idx_email_outbound_drafts_created_by_user_id
  on public.email_outbound_drafts(created_by_user_id);

alter table public.email_outbound_drafts enable row level security;

drop policy if exists "Users can view email outbound drafts"
  on public.email_outbound_drafts;
create policy "Users can view email outbound drafts"
  on public.email_outbound_drafts
  for select
  using (public.user_can_access_mailbox(mailbox_id, auth.uid()));

drop policy if exists "Users can manage email outbound drafts"
  on public.email_outbound_drafts;
create policy "Users can manage email outbound drafts"
  on public.email_outbound_drafts
  using (public.user_can_access_mailbox(mailbox_id, auth.uid()))
  with check (public.user_can_access_mailbox(mailbox_id, auth.uid()));

drop trigger if exists update_email_outbound_drafts_updated_at
  on public.email_outbound_drafts;
create trigger update_email_outbound_drafts_updated_at
before update on public.email_outbound_drafts
for each row execute function public.update_updated_at_column();
