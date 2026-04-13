alter table public.user_preferences
  add column if not exists default_email_html_render_mode text not null default 'preserve';

alter table public.user_preferences
  drop constraint if exists user_preferences_default_email_html_render_mode_check;

alter table public.user_preferences
  add constraint user_preferences_default_email_html_render_mode_check
  check (default_email_html_render_mode in ('preserve', 'simplified'));
