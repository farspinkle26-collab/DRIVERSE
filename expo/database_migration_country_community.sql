-- Driveverse Country Scoping + Real Community (Crews)
-- Makes Events genuinely country-scoped and replaces the mocked-up
-- Community screen (convoys/meetups) with real, persisted, multi-user data.
-- Run this in your Supabase SQL Editor after database_migration_events_realtime.sql.

-- ============================================================
-- COUNTRY COLUMNS
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_events_country ON public.events(country);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);

-- Events are only visible to signed-in drivers in the same country as the
-- event (creators can always see their own, regardless of country drift).
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.events;
CREATE POLICY "Drivers can view events in their country" ON public.events
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      creator_id = auth.uid()
      OR country = (SELECT p.country FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- ============================================================
-- COMMUNITY CREWS — persistent, discoverable driving crews (real Community feature)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_crews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  tag TEXT NOT NULL DEFAULT '' CHECK (char_length(tag) <= 6),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 300),
  country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_crew_members (
  crew_id UUID REFERENCES public.community_crews(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (crew_id, user_id)
);

ALTER TABLE public.community_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_crew_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view crews in their country" ON public.community_crews;
CREATE POLICY "Drivers can view crews in their country" ON public.community_crews
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (
      creator_id = auth.uid()
      OR country = (SELECT p.country FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create their own crews" ON public.community_crews;
CREATE POLICY "Users can create their own crews" ON public.community_crews
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their crews" ON public.community_crews;
CREATE POLICY "Creators can update their crews" ON public.community_crews
  FOR UPDATE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can delete their crews" ON public.community_crews;
CREATE POLICY "Creators can delete their crews" ON public.community_crews
  FOR DELETE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Authenticated users can view crew members" ON public.community_crew_members;
CREATE POLICY "Authenticated users can view crew members" ON public.community_crew_members
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can join crews" ON public.community_crew_members;
CREATE POLICY "Users can join crews" ON public.community_crew_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave crews" ON public.community_crew_members;
CREATE POLICY "Users can leave crews" ON public.community_crew_members
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_community_crews_country ON public.community_crews(country);
CREATE INDEX IF NOT EXISTS idx_community_crew_members_user ON public.community_crew_members(user_id);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.community_crews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS community_crews_updated_at ON public.community_crews;
CREATE TRIGGER community_crews_updated_at
  BEFORE UPDATE ON public.community_crews
  FOR EACH ROW EXECUTE PROCEDURE public.community_crews_updated_at();

-- Auto-add the creator as a member when a crew is created
CREATE OR REPLACE FUNCTION public.community_crew_add_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.community_crew_members (crew_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'creator')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_crew_add_creator ON public.community_crews;
CREATE TRIGGER community_crew_add_creator
  AFTER INSERT ON public.community_crews
  FOR EACH ROW EXECUTE PROCEDURE public.community_crew_add_creator();

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_crews;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_crew_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
