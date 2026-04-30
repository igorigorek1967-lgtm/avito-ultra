-- Add revenue and profit fields for per-request financial analytics
ALTER TABLE public.chat_logs
  ADD COLUMN IF NOT EXISTS revenue_rub NUMERIC(10,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_rub NUMERIC(10,6) NOT NULL DEFAULT 0;
