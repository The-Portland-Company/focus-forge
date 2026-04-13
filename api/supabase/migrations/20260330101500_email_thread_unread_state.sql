ALTER TABLE public.email_threads
ADD COLUMN IF NOT EXISTS is_unread boolean NOT NULL DEFAULT false;
