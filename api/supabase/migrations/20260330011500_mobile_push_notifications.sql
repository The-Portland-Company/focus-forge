CREATE TABLE IF NOT EXISTS public.mobile_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios')),
  device_id text NOT NULL,
  push_token text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  bundle_id text NOT NULL,
  device_name text,
  app_version text,
  build_number text,
  locale text,
  time_zone text,
  is_active boolean NOT NULL DEFAULT true,
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, device_id)
);

ALTER TABLE public.mobile_push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mobile push devices" ON public.mobile_push_devices;
CREATE POLICY "Users can view own mobile push devices"
ON public.mobile_push_devices
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own mobile push devices" ON public.mobile_push_devices;
CREATE POLICY "Users can create own mobile push devices"
ON public.mobile_push_devices
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own mobile push devices" ON public.mobile_push_devices;
CREATE POLICY "Users can update own mobile push devices"
ON public.mobile_push_devices
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own mobile push devices" ON public.mobile_push_devices;
CREATE POLICY "Users can delete own mobile push devices"
ON public.mobile_push_devices
FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_mobile_push_devices_user_id
ON public.mobile_push_devices (user_id);

CREATE INDEX IF NOT EXISTS idx_mobile_push_devices_last_registered_at
ON public.mobile_push_devices (last_registered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_push_devices_active_push_token
ON public.mobile_push_devices (platform, push_token)
WHERE is_active;

DROP TRIGGER IF EXISTS update_mobile_push_devices_updated_at ON public.mobile_push_devices;
CREATE TRIGGER update_mobile_push_devices_updated_at
BEFORE UPDATE ON public.mobile_push_devices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
