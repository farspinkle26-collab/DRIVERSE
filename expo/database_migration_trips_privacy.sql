-- Driveverse — Trip privacy (public/private toggle for the Profile Trips tab)
-- Adds an is_public flag to trips and updates the SELECT policy so a
-- driver's public trips are visible on their profile to other users,
-- while private trips stay visible only to the owner.
-- Run this in your Supabase SQL Editor.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Users can view their own trips" ON public.trips;
CREATE POLICY "View own or public trips" ON public.trips
  FOR SELECT USING (auth.uid() = user_id OR is_public = true);
