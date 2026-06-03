-- Allow 'transactional' as an email_threads.classification value (spam-review categorize feature).
alter table public.email_threads drop constraint if exists email_threads_classification_check;
alter table public.email_threads
  add constraint email_threads_classification_check
  check (classification = any (array['unknown','actionable','newsletter','spam','waiting','reference','transactional']));
