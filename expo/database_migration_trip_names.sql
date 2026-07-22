-- Driveverse: Nameable Trips
-- Lets drivers give a recorded trip a custom name (defaults to NULL, UI
-- falls back to "Drive to <destination>" when empty).
-- Run this in your Supabase SQL Editor.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS name TEXT;
