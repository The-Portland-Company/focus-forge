-- Fluid Inbox: email-first inbox domain for Focus: Forge

CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text,
  email_address text NOT NULL,
  provider text NOT NULL DEFAULT 'imap_smtp' CHECK (provider IN ('imap_smtp', 'gmail', 'microsoft')),
  is_shared boolean NOT NULL DEFAULT false,
  login_username text NOT NULL,
  credentials_encrypted text NOT NULL,
  imap_host text NOT NULL,
  imap_port integer NOT NULL DEFAULT 993,
  imap_secure boolean NOT NULL DEFAULT true,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_secure boolean NOT NULL DEFAULT true,
  sync_folder text NOT NULL DEFAULT 'INBOX',
  quarantine_folder text,
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  sync_frequency_minutes integer NOT NULL DEFAULT 5,
  summary_profile_id uuid,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_address)
);

CREATE TABLE IF NOT EXISTS public.mailbox_members (
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'triage', 'reply', 'manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mailbox_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_ai_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  summary_style text NOT NULL DEFAULT 'action_first',
  instruction_text text NOT NULL DEFAULT '',
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailboxes
  DROP CONSTRAINT IF EXISTS mailboxes_summary_profile_id_fkey;

ALTER TABLE public.mailboxes
  ADD CONSTRAINT mailboxes_summary_profile_id_fkey
  FOREIGN KEY (summary_profile_id)
  REFERENCES public.email_ai_profiles(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  summary_profile_id uuid REFERENCES public.email_ai_profiles(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider_thread_id text,
  thread_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantine', 'needs_project', 'archived', 'spam', 'deleted', 'resolved')),
  classification text NOT NULL DEFAULT 'unknown' CHECK (classification IN ('unknown', 'actionable', 'newsletter', 'spam', 'waiting', 'reference')),
  resolution_state text NOT NULL DEFAULT 'open' CHECK (resolution_state IN ('open', 'taskified', 'resolved')),
  action_title text NOT NULL,
  subject text NOT NULL,
  normalized_subject text,
  summary_text text,
  preview_text text,
  action_confidence numeric(5,4) NOT NULL DEFAULT 0,
  action_reason text,
  analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_suggestions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_due_date date,
  work_due_time time,
  needs_project boolean NOT NULL DEFAULT false,
  always_delete boolean NOT NULL DEFAULT false,
  latest_message_at timestamptz,
  latest_inbound_at timestamptz,
  latest_outbound_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, thread_key)
);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  provider_message_id text,
  internet_message_id text,
  in_reply_to_message_id text,
  subject text,
  body_text text,
  body_html text,
  sent_at timestamptz,
  received_at timestamptz,
  raw_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, provider_message_id)
);

CREATE TABLE IF NOT EXISTS public.email_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.email_messages(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email_address text NOT NULL,
  display_name text,
  participant_role text NOT NULL CHECK (participant_role IN ('from', 'to', 'cc', 'bcc', 'reply_to')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_thread_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_by text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai', 'user', 'rule')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.email_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'system', 'ai_training')),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  match_mode text NOT NULL DEFAULT 'all' CHECK (match_mode IN ('all', 'any')),
  conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  stop_processing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.email_rules(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  matched boolean NOT NULL DEFAULT false,
  action_summary text,
  explanation text,
  confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_training_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  example_type text NOT NULL CHECK (example_type IN ('classification', 'routing', 'task_split', 'summary')),
  input_text text NOT NULL,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  correction_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_sync_state (
  mailbox_id uuid PRIMARY KEY REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  sync_cursor_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_status text NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  error_message text,
  last_synced_at timestamptz,
  last_seen_message_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_owner_user_id ON public.mailboxes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_organization_id ON public.mailboxes(organization_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_members_user_id ON public.mailbox_members(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_ai_profiles_mailbox_id ON public.email_ai_profiles(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_email_ai_profiles_user_id ON public.email_ai_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_email_ai_profiles_organization_id ON public.email_ai_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox_status ON public.email_threads(mailbox_id, status, latest_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_project_id ON public.email_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_id ON public.email_messages(thread_id, received_at DESC, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_internet_message_id ON public.email_messages(internet_message_id);
CREATE INDEX IF NOT EXISTS idx_email_participants_thread_id ON public.email_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_tasks_task_id ON public.email_thread_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_email_rules_mailbox_priority ON public.email_rules(mailbox_id, is_active, priority ASC);
CREATE INDEX IF NOT EXISTS idx_email_rules_user_priority ON public.email_rules(user_id, is_active, priority ASC);

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_ai_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_mailbox(p_mailbox_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
  mailbox_row record;
BEGIN
  IF p_mailbox_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, organization_id, owner_user_id, is_shared
  INTO mailbox_row
  FROM public.mailboxes
  WHERE id = p_mailbox_id;

  IF mailbox_row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF mailbox_row.owner_user_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mailbox_members
    WHERE mailbox_id = p_mailbox_id
      AND user_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  IF mailbox_row.is_shared
    AND mailbox_row.organization_id IS NOT NULL
    AND public.user_has_organization_access(mailbox_row.organization_id) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_manage_mailbox(p_mailbox_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
  mailbox_row record;
BEGIN
  IF p_mailbox_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, organization_id, owner_user_id, is_shared
  INTO mailbox_row
  FROM public.mailboxes
  WHERE id = p_mailbox_id;

  IF mailbox_row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF mailbox_row.owner_user_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mailbox_members
    WHERE mailbox_id = p_mailbox_id
      AND user_id = p_user_id
      AND role IN ('triage', 'manager')
  ) THEN
    RETURN TRUE;
  END IF;

  IF mailbox_row.is_shared
    AND mailbox_row.organization_id IS NOT NULL
    AND public.is_org_admin(p_user_id, mailbox_row.organization_id) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_email_thread(p_thread_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_threads et
    WHERE et.id = p_thread_id
      AND public.user_can_access_mailbox(et.mailbox_id, p_user_id)
  );
$function$;

DROP POLICY IF EXISTS "Users can view mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Users can create mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Users can update mailboxes" ON public.mailboxes;
DROP POLICY IF EXISTS "Users can delete mailboxes" ON public.mailboxes;
CREATE POLICY "Users can view mailboxes" ON public.mailboxes
FOR SELECT USING (public.user_can_access_mailbox(id, auth.uid()));
CREATE POLICY "Users can create mailboxes" ON public.mailboxes
FOR INSERT WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Users can update mailboxes" ON public.mailboxes
FOR UPDATE USING (public.user_can_manage_mailbox(id, auth.uid()))
WITH CHECK (public.user_can_manage_mailbox(id, auth.uid()));
CREATE POLICY "Users can delete mailboxes" ON public.mailboxes
FOR DELETE USING (public.user_can_manage_mailbox(id, auth.uid()));

DROP POLICY IF EXISTS "Users can view mailbox members" ON public.mailbox_members;
DROP POLICY IF EXISTS "Users can manage mailbox members" ON public.mailbox_members;
CREATE POLICY "Users can view mailbox members" ON public.mailbox_members
FOR SELECT USING (public.user_can_access_mailbox(mailbox_id, auth.uid()));
CREATE POLICY "Users can manage mailbox members" ON public.mailbox_members
FOR ALL USING (public.user_can_manage_mailbox(mailbox_id, auth.uid()))
WITH CHECK (public.user_can_manage_mailbox(mailbox_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can manage contacts" ON public.contacts;
CREATE POLICY "Users can view contacts" ON public.contacts
FOR SELECT USING (
  (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.email_participants ep
    JOIN public.email_threads et ON et.id = ep.thread_id
    WHERE ep.contact_id = contacts.id
      AND public.user_can_access_mailbox(et.mailbox_id, auth.uid())
  )
);
CREATE POLICY "Users can manage contacts" ON public.contacts
FOR ALL USING (
  (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
)
WITH CHECK (
  (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
  OR profile_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can view email AI profiles" ON public.email_ai_profiles;
DROP POLICY IF EXISTS "Users can manage email AI profiles" ON public.email_ai_profiles;
CREATE POLICY "Users can view email AI profiles" ON public.email_ai_profiles
FOR SELECT USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_access_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
);
CREATE POLICY "Users can manage email AI profiles" ON public.email_ai_profiles
FOR ALL USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
)
WITH CHECK (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "Users can view email threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can manage email threads" ON public.email_threads;
CREATE POLICY "Users can view email threads" ON public.email_threads
FOR SELECT USING (public.user_can_access_mailbox(mailbox_id, auth.uid()));
CREATE POLICY "Users can manage email threads" ON public.email_threads
FOR ALL USING (public.user_can_manage_mailbox(mailbox_id, auth.uid()))
WITH CHECK (public.user_can_manage_mailbox(mailbox_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view email messages" ON public.email_messages;
DROP POLICY IF EXISTS "Users can manage email messages" ON public.email_messages;
CREATE POLICY "Users can view email messages" ON public.email_messages
FOR SELECT USING (public.user_can_access_mailbox(mailbox_id, auth.uid()));
CREATE POLICY "Users can manage email messages" ON public.email_messages
FOR ALL USING (public.user_can_manage_mailbox(mailbox_id, auth.uid()))
WITH CHECK (public.user_can_manage_mailbox(mailbox_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view email participants" ON public.email_participants;
DROP POLICY IF EXISTS "Users can manage email participants" ON public.email_participants;
CREATE POLICY "Users can view email participants" ON public.email_participants
FOR SELECT USING (public.user_can_access_email_thread(thread_id, auth.uid()));
CREATE POLICY "Users can manage email participants" ON public.email_participants
FOR ALL USING (public.user_can_access_email_thread(thread_id, auth.uid()))
WITH CHECK (public.user_can_access_email_thread(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view email thread tasks" ON public.email_thread_tasks;
DROP POLICY IF EXISTS "Users can manage email thread tasks" ON public.email_thread_tasks;
CREATE POLICY "Users can view email thread tasks" ON public.email_thread_tasks
FOR SELECT USING (public.user_can_access_email_thread(thread_id, auth.uid()));
CREATE POLICY "Users can manage email thread tasks" ON public.email_thread_tasks
FOR ALL USING (public.user_can_access_email_thread(thread_id, auth.uid()))
WITH CHECK (public.user_can_access_email_thread(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view email rules" ON public.email_rules;
DROP POLICY IF EXISTS "Users can manage email rules" ON public.email_rules;
CREATE POLICY "Users can view email rules" ON public.email_rules
FOR SELECT USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_access_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
);
CREATE POLICY "Users can manage email rules" ON public.email_rules
FOR ALL USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
)
WITH CHECK (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "Users can view email rule runs" ON public.email_rule_runs;
DROP POLICY IF EXISTS "Users can manage email rule runs" ON public.email_rule_runs;
CREATE POLICY "Users can view email rule runs" ON public.email_rule_runs
FOR SELECT USING (public.user_can_access_email_thread(thread_id, auth.uid()));
CREATE POLICY "Users can manage email rule runs" ON public.email_rule_runs
FOR ALL USING (public.user_can_access_email_thread(thread_id, auth.uid()))
WITH CHECK (public.user_can_access_email_thread(thread_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view email training examples" ON public.email_training_examples;
DROP POLICY IF EXISTS "Users can manage email training examples" ON public.email_training_examples;
CREATE POLICY "Users can view email training examples" ON public.email_training_examples
FOR SELECT USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_access_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.user_has_organization_access(organization_id))
);
CREATE POLICY "Users can manage email training examples" ON public.email_training_examples
FOR ALL USING (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
)
WITH CHECK (
  user_id = auth.uid()
  OR (mailbox_id IS NOT NULL AND public.user_can_manage_mailbox(mailbox_id, auth.uid()))
  OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "Users can view email sync state" ON public.email_sync_state;
DROP POLICY IF EXISTS "Users can manage email sync state" ON public.email_sync_state;
CREATE POLICY "Users can view email sync state" ON public.email_sync_state
FOR SELECT USING (public.user_can_access_mailbox(mailbox_id, auth.uid()));
CREATE POLICY "Users can manage email sync state" ON public.email_sync_state
FOR ALL USING (public.user_can_manage_mailbox(mailbox_id, auth.uid()))
WITH CHECK (public.user_can_manage_mailbox(mailbox_id, auth.uid()));

DROP TRIGGER IF EXISTS update_mailboxes_updated_at ON public.mailboxes;
CREATE TRIGGER update_mailboxes_updated_at
BEFORE UPDATE ON public.mailboxes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_ai_profiles_updated_at ON public.email_ai_profiles;
CREATE TRIGGER update_email_ai_profiles_updated_at
BEFORE UPDATE ON public.email_ai_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_threads_updated_at ON public.email_threads;
CREATE TRIGGER update_email_threads_updated_at
BEFORE UPDATE ON public.email_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_messages_updated_at ON public.email_messages;
CREATE TRIGGER update_email_messages_updated_at
BEFORE UPDATE ON public.email_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_rules_updated_at ON public.email_rules;
CREATE TRIGGER update_email_rules_updated_at
BEFORE UPDATE ON public.email_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_sync_state_updated_at ON public.email_sync_state;
CREATE TRIGGER update_email_sync_state_updated_at
BEFORE UPDATE ON public.email_sync_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
