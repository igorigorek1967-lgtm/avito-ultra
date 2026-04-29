-- =============================================================================
-- database/schema.sql
-- Avito Bots — Full Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE bot_status AS ENUM ('active', 'inactive', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- TABLE: profiles
-- Extends auth.users with application-level data.
-- A row is created automatically via trigger on every new sign-up.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  telegram_user_id TEXT       UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS
  'Extended user profile linked 1-to-1 with auth.users.';

-- ── Trigger: keep updated_at current ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Trigger: auto-create profile on auth.users insert ────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: owner can read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles: owner can update" ON public.profiles;

CREATE POLICY "profiles: owner can read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: owner can update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- TABLE: avito_projects
-- Each user can have multiple Avito ad-management projects.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.avito_projects (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                 TEXT          NOT NULL,
  avito_account_id     TEXT,
  avito_client_id      TEXT,
  -- Store the secret encrypted; decrypt in application layer or via pgcrypto
  avito_client_secret  TEXT,
  status               project_status NOT NULL DEFAULT 'active',
  settings             JSONB         NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.avito_projects IS
  'Avito ad-management projects owned by a user.';
COMMENT ON COLUMN public.avito_projects.avito_client_secret IS
  'Encrypted Avito OAuth client secret. Never return this to the browser.';

DROP TRIGGER IF EXISTS trg_avito_projects_updated_at ON public.avito_projects;
CREATE TRIGGER trg_avito_projects_updated_at
  BEFORE UPDATE ON public.avito_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.avito_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avito_projects: owner can select" ON public.avito_projects;
DROP POLICY IF EXISTS "avito_projects: owner can insert" ON public.avito_projects;
DROP POLICY IF EXISTS "avito_projects: owner can update" ON public.avito_projects;
DROP POLICY IF EXISTS "avito_projects: owner can delete" ON public.avito_projects;

CREATE POLICY "avito_projects: owner can select"
  ON public.avito_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "avito_projects: owner can insert"
  ON public.avito_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "avito_projects: owner can update"
  ON public.avito_projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "avito_projects: owner can delete"
  ON public.avito_projects FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- TABLE: managed_bots
-- Telegram bots created/managed via the Manager Bot (API 9.6).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.managed_bots (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id         UUID        REFERENCES public.avito_projects(id) ON DELETE SET NULL,
  bot_username       TEXT        NOT NULL,
  -- The Telegram Bot API token. Store encrypted in production (pgcrypto / Vault).
  managed_bot_token  TEXT        NOT NULL,
  telegram_bot_id    TEXT,
  status             bot_status  NOT NULL DEFAULT 'inactive',
  api_version        TEXT        NOT NULL DEFAULT '9.6',
  webhook_url        TEXT,
  settings           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent the same token being registered twice for the same user
  CONSTRAINT uq_managed_bots_user_token UNIQUE (user_id, managed_bot_token)
);

COMMENT ON TABLE public.managed_bots IS
  'Telegram bots registered via the Manager Bot (Telegram Bot API 9.6).';
COMMENT ON COLUMN public.managed_bots.managed_bot_token IS
  'Telegram Bot API token. Encrypt at rest using pgcrypto or Supabase Vault.';

DROP TRIGGER IF EXISTS trg_managed_bots_updated_at ON public.managed_bots;
CREATE TRIGGER trg_managed_bots_updated_at
  BEFORE UPDATE ON public.managed_bots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.managed_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managed_bots: owner can select" ON public.managed_bots;
DROP POLICY IF EXISTS "managed_bots: owner can insert" ON public.managed_bots;
DROP POLICY IF EXISTS "managed_bots: owner can update" ON public.managed_bots;
DROP POLICY IF EXISTS "managed_bots: owner can delete" ON public.managed_bots;

CREATE POLICY "managed_bots: owner can select"
  ON public.managed_bots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "managed_bots: owner can insert"
  ON public.managed_bots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "managed_bots: owner can update"
  ON public.managed_bots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "managed_bots: owner can delete"
  ON public.managed_bots FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- TABLE: bot_sessions
-- Stores per-chat conversation state for each managed bot.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bot_sessions (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id           UUID        NOT NULL REFERENCES public.managed_bots(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  telegram_chat_id TEXT        NOT NULL,
  session_data     JSONB       NOT NULL DEFAULT '{}',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_bot_sessions_bot_chat UNIQUE (bot_id, telegram_chat_id)
);

COMMENT ON TABLE public.bot_sessions IS
  'Per-chat session state for each managed Telegram bot.';

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_sessions: owner can select" ON public.bot_sessions;
DROP POLICY IF EXISTS "bot_sessions: owner can insert" ON public.bot_sessions;
DROP POLICY IF EXISTS "bot_sessions: owner can update" ON public.bot_sessions;
DROP POLICY IF EXISTS "bot_sessions: owner can delete" ON public.bot_sessions;

CREATE POLICY "bot_sessions: owner can select"
  ON public.bot_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bot_sessions: owner can insert"
  ON public.bot_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bot_sessions: owner can update"
  ON public.bot_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bot_sessions: owner can delete"
  ON public.bot_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- INDEXES (performance)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_avito_projects_user_id
  ON public.avito_projects(user_id);

CREATE INDEX IF NOT EXISTS idx_managed_bots_user_id
  ON public.managed_bots(user_id);

CREATE INDEX IF NOT EXISTS idx_managed_bots_project_id
  ON public.managed_bots(project_id);

CREATE INDEX IF NOT EXISTS idx_managed_bots_status
  ON public.managed_bots(status);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_id
  ON public.bot_sessions(bot_id);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_id
  ON public.bot_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_last_activity
  ON public.bot_sessions(last_activity_at DESC);

-- =============================================================================
-- GRANT public schema usage to authenticated role
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT ALL ON public.profiles       TO authenticated;
GRANT ALL ON public.avito_projects TO authenticated;
GRANT ALL ON public.managed_bots   TO authenticated;
GRANT ALL ON public.bot_sessions   TO authenticated;

-- Read-only for anon (needed for public-facing pages, if any)
GRANT SELECT ON public.profiles TO anon;
