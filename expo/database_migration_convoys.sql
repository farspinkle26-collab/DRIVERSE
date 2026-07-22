-- Driveverse: Community convoys (persistent driving crews)
-- Run this in your Supabase SQL Editor.
--
-- Backs the "Convoy" tab on the Community screen with real, user-created
-- crews instead of hardcoded sample data. Any authenticated driver in the
-- app (nationwide) can see and join every crew, mirroring the visibility
-- model already used for events and public profiles.

-- ============================================================
-- CONVOYS — user-created driving crews
-- ============================================================
CREATE TABLE IF NOT EXISTS public.convoys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  tag TEXT NOT NULL CHECK (char_length(tag) BETWEEN 2 AND 6),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 300),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- CONVOY MEMBERS — who joined which crew
-- ============================================================
CREATE TABLE IF NOT EXISTS public.convoy_members (
  convoy_id UUID REFERENCES public.convoys(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (convoy_id, user_id)
);

-- ============================================================
-- RLS POLICIES — visible to every signed-in driver (nationwide)
-- ============================================================
ALTER TABLE public.convoys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convoy_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view convoys" ON public.convoys;
CREATE POLICY "Authenticated users can view convoys" ON public.convoys
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can create their own convoys" ON public.convoys;
CREATE POLICY "Users can create their own convoys" ON public.convoys
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can update their convoys" ON public.convoys;
CREATE POLICY "Creators can update their convoys" ON public.convoys
  FOR UPDATE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators can delete their convoys" ON public.convoys;
CREATE POLICY "Creators can delete their convoys" ON public.convoys
  FOR DELETE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Authenticated users can view convoy members" ON public.convoy_members;
CREATE POLICY "Authenticated users can view convoy members" ON public.convoy_members
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can join convoys" ON public.convoy_members;
CREATE POLICY "Users can join convoys" ON public.convoy_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave convoys" ON public.convoy_members;
CREATE POLICY "Users can leave convoys" ON public.convoy_members
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_convoys_created ON public.convoys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_convoy_members_user ON public.convoy_members(user_id);

-- ============================================================
-- TRIGGERS — auto-add the creator as the crew's owner
-- ============================================================
CREATE OR REPLACE FUNCTION public.convoy_add_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.convoy_members (convoy_id, user_id, role)
  VALUES (NEW.id, NEW.creator_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS convoy_add_owner ON public.convoys;
CREATE TRIGGER convoy_add_owner
  AFTER INSERT ON public.convoys
  FOR EACH ROW EXECUTE PROCEDURE public.convoy_add_owner();

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.convoys;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
