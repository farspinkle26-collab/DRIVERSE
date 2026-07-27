-- Driveverse Problem Signal
-- Lets a driver in trouble raise a problem signal that every online driver
-- on the map — convoy-mate or not — can see in real time.
--
-- The live path is Supabase Realtime Presence (the same channel that carries
-- positions, see hooks/useOnlineUsers.ts), so nothing here is required for a
-- signal to appear on other drivers' maps. These columns mirror the raised
-- signal onto user_locations for persistence and stale-cleanup, exactly as
-- position already is.
--
-- Run this in your Supabase SQL Editor.

-- ============================================================
-- USER LOCATIONS — problem signal mirror
-- ============================================================
ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS problem_type  TEXT,
  ADD COLUMN IF NOT EXISTS problem_since TIMESTAMP WITH TIME ZONE;

-- Only the four recognised signals (or NULL for "no problem") are allowed,
-- so a bad client can't scribble arbitrary strings other drivers would then
-- render.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_locations_problem_type_check'
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_problem_type_check
      CHECK (problem_type IS NULL OR problem_type IN ('breakdown', 'accident', 'fuel', 'sos'));
  END IF;
END $$;

-- Partial index: the map only ever queries the handful of drivers who
-- currently have a signal up, so index just those rows.
CREATE INDEX IF NOT EXISTS idx_user_locations_problem
  ON public.user_locations (problem_since DESC)
  WHERE problem_type IS NOT NULL;

COMMIT;
