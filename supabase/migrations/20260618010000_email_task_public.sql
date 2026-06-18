-- Public flag on email-linked tasks.
--
-- Semantics: a "public" email-linked task is intentionally shared with the
-- wider organization, while the underlying email thread/content remains private
-- to the mailbox owner (and mailbox members). The flag lives on the LINK row
-- (public.email_thread_tasks), not on public.tasks, because publicness is a
-- property of the email<->task linkage, not of the task itself: the same task
-- shape exists for non-email tasks, and a task may be linked to an email by one
-- user while remaining a normal org task for everyone else.
--
-- Privacy / RLS reasoning:
--   * public.tasks is ALREADY org-visible: the SELECT policy
--     ("Users can view tasks in their projects") grants visibility to any user
--     with organization access to the task's project. So org members who are
--     NOT on the linked mailbox can already see the TASK row.
--   * public.email_thread_tasks (the link, incl. rationale) and
--     public.email_threads / public.email_messages are gated to mailbox access
--     via user_can_access_email_thread() / user_can_access_mailbox(). Those
--     policies are intentionally NOT touched here, so email CONTENT stays
--     private to the mailbox owner/members.
--   * Therefore NO task-RLS change is required: the task is already visible to
--     the org, and only the email content is hidden. The `public` column is the
--     explicit, client-facing signal that distinguishes an email-linked task the
--     owner has chosen to surface to the org from one they consider private.
--
-- Additive + idempotent: safe to run alongside the iOS PR.

ALTER TABLE public.email_thread_tasks
  ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_thread_tasks.public IS
  'When true, the email-linked task is intentionally shared with the org. The linked email thread/content stays private to the mailbox owner/members regardless of this flag.';

-- (No RLS changes: tasks are already org-visible; email content remains gated
--  by user_can_access_mailbox / user_can_access_email_thread.)
