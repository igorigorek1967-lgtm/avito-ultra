-- =============================================================================
-- database/migrations/001_subscriptions_and_chat_logs.sql
-- OmniHub — Epic 4: Unit Economics, Billing & Super-Admin
--
-- Run this in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → paste → Run
-- =============================================================================

-- =============================================================================
-- ENUM: subscription plan names
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE subscription_plan AS ENUM ('free', 'start', 'pro', 'business', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- TABLE: subscriptions
-- One row per user. Tracks their current plan, dialog limit, and usage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID          NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Plan metadata
  plan_name        TEXT          NOT NULL DEFAULT 'free',   -- human-readable: 'Free', 'Профи', etc.
  plan_id          subscription_plan NOT NULL DEFAULT 'free',

  -- Dialog limits
  dialog_limit     INTEGER       NOT NULL DEFAULT 1500,     -- max dialogs per billing period
  dialogs_used     INTEGER       NOT NULL DEFAULT 0,        -- consumed dialogs this period

  -- Token tracking (for cost calculation)
  total_tokens_used BIGINT       NOT NULL DEFAULT 0,        -- cumulative tokens across all time

  -- Billing period
  period_start     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  period_end       TIMESTAMPTZ,                             -- NULL = no expiry (lifetime / manual)

  -- Payment reference (optional, for future Stripe/YooKassa integration)
  external_subscription_id TEXT,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS
  'One row per user. Tracks plan, dialog limits, usage, and token costs.';

-- ── Trigger: keep updated_at current ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Trigger: auto-create a Free subscription on new user sign-up ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_name, plan_id, dialog_limit)
  VALUES (NEW.id, 'Free', 'free', 1500)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_profile_created_subscription ON public.profiles;
CREATE TRIGGER trg_on_profile_created_subscription
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_subscription();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: owner can read"   ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions: owner can update" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions: admin can read all" ON public.subscriptions;

-- Users can read their own subscription
CREATE POLICY "subscriptions: owner can read"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own usage counters (dialogs_used, total_tokens_used)
CREATE POLICY "subscriptions: owner can update"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Super-admin (spartnerom@gmail.com) can read all subscriptions
-- We use a helper function to avoid hardcoding email in policy
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND email = 'spartnerom@gmail.com'
  );
$$;

CREATE POLICY "subscriptions: admin can read all"
  ON public.subscriptions FOR SELECT
  USING (public.is_super_admin());

-- =============================================================================
-- TABLE: chat_logs
-- Every AI request is logged here with token counts and cost.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.chat_logs (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_id         UUID          REFERENCES public.agents(id)   ON DELETE SET NULL,

  -- Message content (optional — can be omitted for privacy)
  user_message     TEXT,
  bot_response     TEXT,

  -- Token accounting (from OpenRouter usage object)
  prompt_tokens    INTEGER       NOT NULL DEFAULT 0,
  completion_tokens INTEGER      NOT NULL DEFAULT 0,
  total_tokens     INTEGER       NOT NULL DEFAULT 0,

  -- Cost in RUB (calculated server-side)
  -- GPT-4o-mini: $0.15/1M input + $0.60/1M output → avg ~$0.375/1M
  -- At 90 RUB/USD: cost_rub = total_tokens * 0.375 * 90 / 1_000_000
  cost_rub         NUMERIC(10,6) NOT NULL DEFAULT 0,

  -- Source: 'polygon' | 'guide' | 'avito' | 'api'
  source           TEXT          NOT NULL DEFAULT 'polygon',

  -- HTTP status returned to client
  status_code      SMALLINT      NOT NULL DEFAULT 200,

  -- Model used (for future multi-model support)
  model            TEXT          NOT NULL DEFAULT 'openai/gpt-4o-mini',

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chat_logs IS
  'Every AI request: tokens used, cost in RUB, source, and optional message content.';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id    ON public.chat_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_agent_id   ON public.chat_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON public.chat_logs (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_logs: owner can read"     ON public.chat_logs;
DROP POLICY IF EXISTS "chat_logs: owner can insert"   ON public.chat_logs;
DROP POLICY IF EXISTS "chat_logs: admin can read all" ON public.chat_logs;

CREATE POLICY "chat_logs: owner can read"
  ON public.chat_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_logs: owner can insert"
  ON public.chat_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_logs: admin can read all"
  ON public.chat_logs FOR SELECT
  USING (public.is_super_admin());

-- =============================================================================
-- TABLE: knowledge_files
-- Files uploaded to Supabase Storage, linked to an agent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id         UUID          NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id          UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,

  file_name        TEXT          NOT NULL,
  file_path        TEXT          NOT NULL,   -- path inside the 'knowledge_base' bucket
  file_url         TEXT,                     -- public URL (if bucket is public)
  file_size        BIGINT,                   -- bytes
  mime_type        TEXT,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.knowledge_files IS
  'Files uploaded to the knowledge_base Storage bucket, linked to a specific agent.';

CREATE INDEX IF NOT EXISTS idx_knowledge_files_agent_id ON public.knowledge_files (agent_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_files: owner can read"   ON public.knowledge_files;
DROP POLICY IF EXISTS "knowledge_files: owner can insert" ON public.knowledge_files;
DROP POLICY IF EXISTS "knowledge_files: owner can delete" ON public.knowledge_files;

CREATE POLICY "knowledge_files: owner can read"
  ON public.knowledge_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "knowledge_files: owner can insert"
  ON public.knowledge_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "knowledge_files: owner can delete"
  ON public.knowledge_files FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- HELPER VIEW: admin_client_stats
-- Used by the Super-Admin panel to show all clients with costs.
-- Only accessible via is_super_admin() check.
-- =============================================================================

CREATE OR REPLACE VIEW public.admin_client_stats AS
SELECT
  s.id,
  s.user_id,
  p.email,
  s.plan_name,
  s.plan_id,
  s.dialog_limit,
  s.dialogs_used,
  s.total_tokens_used,
  -- Cost in RUB: GPT-4o-mini avg $0.375/1M tokens × 90 RUB/USD
  ROUND((s.total_tokens_used::NUMERIC * 0.375 * 90 / 1000000), 2) AS cost_rub,
  s.period_start,
  s.period_end,
  s.is_active,
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.profiles p ON p.id = s.user_id
ORDER BY s.created_at DESC;

COMMENT ON VIEW public.admin_client_stats IS
  'Aggregated client stats for the Super-Admin panel. Access controlled via RLS on subscriptions.';

-- =============================================================================
-- STORAGE BUCKET: knowledge_base
-- Run this separately in Supabase Dashboard → Storage → New bucket
-- OR via the management API. SQL below is for reference only.
-- =============================================================================

-- NOTE: Supabase Storage buckets cannot be created via SQL.
-- Create the bucket manually:
--   1. Go to Supabase Dashboard → Storage
--   2. Click "New bucket"
--   3. Name: knowledge_base
--   4. Public: YES (so file_url works without signed URLs)
--   5. File size limit: 52428800 (50 MB)
--   6. Allowed MIME types: application/pdf, application/msword,
--      application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--      application/vnd.ms-excel,
--      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
--      text/plain, image/jpeg, image/png

-- =============================================================================
-- GRANT PERMISSIONS (if using service role for admin operations)
-- =============================================================================

GRANT SELECT ON public.admin_client_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT ON public.chat_logs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.knowledge_files TO authenticated;
