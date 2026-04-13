alter table public.user_preferences
  add column if not exists email_reply_settings jsonb not null default jsonb_build_object(
    'conciseness', 'brief',
    'tone', 'friendly',
    'personality', 'professional'
  );
