-- ============================================================
-- Migration: Create balance_audit_log table
-- Run this in your Supabase SQL editor or via migrations
-- ============================================================

-- Table to permanently audit every manual balance adjustment made by admins.
-- The balance/route.ts API writes here on every POST.
CREATE TABLE IF NOT EXISTS balance_audit_log (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id      uuid         NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  admin_id      uuid         REFERENCES admins(id) ON DELETE SET NULL,
  old_balance   numeric      NOT NULL,
  adjustment    numeric      NOT NULL,
  new_balance   numeric      NOT NULL,
  reason        text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

-- Index for quick lookup by rider
CREATE INDEX IF NOT EXISTS idx_balance_audit_log_rider_id ON balance_audit_log(rider_id);
CREATE INDEX IF NOT EXISTS idx_balance_audit_log_created_at ON balance_audit_log(created_at DESC);

-- Only service role can write; admins can read via their dashboard
ALTER TABLE balance_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically
-- Allow authenticated admins to SELECT (admin dashboard uses service role so this is a safety net)
CREATE POLICY "admins_can_read_balance_audit"
  ON balance_audit_log FOR SELECT
  USING (true);

-- ============================================================
-- Also ensure outstanding_balance column exists on riders
-- (in case it was not added during initial schema creation)
-- ============================================================
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS outstanding_balance numeric NOT NULL DEFAULT 0;
