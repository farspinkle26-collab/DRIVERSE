-- Driveverse Event Building & Online Realtime Player Locations
-- Creates the events system (car meets, convoys, cruises) and hardens
-- the realtime user_locations table used for live player positions.
-- Run this in your Supabase SQL Editor.

-- ============================================================
-- EVENTS — user-created map events (meetup / convoy / cruise / race)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 500),
  event_type TEXT NOT NULL DEFAULT 'meetup'
    CHECK (event_type IN ('meetup', 'convoy', 'cruise', 'race')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location_name TEXT DEFAULT '',
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE,
  max_participants INTEGER DEFAULT 0 CHECK (max_participants >= 0), -- 0 = unlimited
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- EVENT PARTICIPANTS — who joined which event
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_participants (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view events" ON public.events;
CREATE POLICY "Authenticated users can view events" ON public.events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can create their own events" ON public.events;
CREATE POLICY "Users can create their own events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their events" ON public.events;
CREATE POLICY "Creators can update their events" ON public.events
  FOR UPDATE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can delete their events" ON public.events;
CREATE POLICY "Creators can delete their events" ON public.events
  FOR DELETE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Authenticated users can view participants" ON public.event_participants;
CREATE POLICY "Authenticated users can view participants" ON public.event_participants
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can join events" ON public.event_participants;
CREATE POLICY "Users can join events" ON public.event_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave events" ON public.event_participants;
CREATE POLICY "Users can leave events" ON public.event_participants
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_events_status_starts ON public.events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_creator ON public.events(creator_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user ON public.event_participants(user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.events_updated_at();

-- Auto-add the creator as host participant when an event is created
CREATE OR REPLACE FUNCTION public.event_add_host()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.event_participants (event_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'host')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS event_add_host ON public.events;
CREATE TRIGGER event_add_host
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.event_add_host();

-- Enforce max_participants at the database level (0 = unlimited)
CREATE OR REPLACE FUNCTION public.event_check_capacity()
RETURNS TRIGGER AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
BEGIN
  SELECT max_participants INTO cap FROM public.events WHERE id = NEW.event_id;
  IF cap IS NOT NULL AND cap > 0 THEN
    SELECT COUNT(*) INTO current_count
    FROM public.event_participants WHERE event_id = NEW.event_id;
    IF current_count >= cap THEN
      RAISE EXCEPTION 'Event is full';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS event_check_capacity ON public.event_participants;
CREATE TRIGGER event_check_capacity
  BEFORE INSERT ON public.event_participants
  FOR EACH ROW EXECUTE PROCEDURE public.event_check_capacity();

-- ============================================================
-- MAINTENANCE: auto-complete finished events, cancel-safe
-- Call periodically (pg_cron) or opportunistically from the client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_event_statuses()
RETURNS void AS $$
BEGIN
  -- Events whose window started -> active
  UPDATE public.events
  SET status = 'active'
  WHERE status = 'upcoming'
    AND starts_at <= NOW()
    AND (ends_at IS NULL OR ends_at > NOW());

  -- Events whose window ended -> completed
  UPDATE public.events
  SET status = 'completed'
  WHERE status IN ('upcoming', 'active')
    AND ends_at IS NOT NULL
    AND ends_at <= NOW();

  -- Events with no end time auto-complete 6 hours after start
  UPDATE public.events
  SET status = 'completed'
  WHERE status IN ('upcoming', 'active')
    AND ends_at IS NULL
    AND starts_at <= NOW() - INTERVAL '6 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow authenticated clients to trigger the refresh
GRANT EXECUTE ON FUNCTION public.refresh_event_statuses() TO authenticated;

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participants;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================
-- USER LOCATIONS — make sure the realtime location table exists
-- (no-op if database_migration_online_users.sql already ran)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION DEFAULT 0,
  is_online BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_locations' AND policyname = 'Anyone can view online user locations'
  ) THEN
    CREATE POLICY "Anyone can view online user locations" ON public.user_locations
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_locations' AND policyname = 'Users can upsert their own location'
  ) THEN
    CREATE POLICY "Users can upsert their own location" ON public.user_locations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_locations' AND policyname = 'Users can update their own location'
  ) THEN
    CREATE POLICY "Users can update their own location" ON public.user_locations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
