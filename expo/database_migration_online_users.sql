-- Driveverse Online Users & Real-Time Map Presence
-- Enables showing all online users on the map in real time
-- Run this in your Supabase SQL Editor

-- ============================================================
-- USER LOCATIONS — real-time location for map presence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION DEFAULT 0,
  is_online BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see online users' locations
CREATE POLICY "Anyone can view online user locations" ON public.user_locations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can upsert their own location
CREATE POLICY "Users can upsert their own location" ON public.user_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location" ON public.user_locations
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_locations_online ON public.user_locations(is_online, updated_at DESC);

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;

-- ============================================================
-- FUNCTION: update user_locations timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_locations_updated_at ON public.user_locations;
CREATE TRIGGER user_locations_updated_at
  BEFORE UPDATE ON public.user_locations
  FOR EACH ROW EXECUTE PROCEDURE public.user_locations_updated_at();

-- ============================================================
-- FUNCTION: cleanup stale locations (> 5 min without update)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_locations()
RETURNS void AS $$
BEGIN
  DELETE FROM public.user_locations
  WHERE updated_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

COMMIT;
