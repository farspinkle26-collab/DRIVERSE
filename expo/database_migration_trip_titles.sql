-- Adds a user-editable custom title to trips (drive-recording history)
-- Run this in your Supabase SQL Editor

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
