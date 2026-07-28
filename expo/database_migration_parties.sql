-- Driveverse Parties Migration
-- Adds parties + party_members — small friend groups that render a
-- shared colored ring around each member's avatar marker on the map.
-- Run this in your Supabase SQL Editor (after database_migration_profile_v2.sql,
-- which this depends on for the `friends` table and `handle_updated_at()`).

-- ============================================================
-- PARTIES — a friend group led by one member
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Party',
  color TEXT NOT NULL DEFAULT '#FFD700',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- PARTY MEMBERS — roster + pending invites
-- ============================================================
CREATE TABLE IF NOT EXISTS public.party_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  party_id UUID REFERENCES public.parties(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('leader', 'member')) NOT NULL DEFAULT 'member',
  status TEXT CHECK (status IN ('invited', 'accepted')) NOT NULL DEFAULT 'invited',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(party_id, user_id)
);

-- A member can only be actively in one party at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_members_one_active
  ON public.party_members(user_id) WHERE status = 'accepted';

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
DROP TRIGGER IF EXISTS parties_updated_at ON parties;
CREATE TRIGGER parties_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Auto-seat the leader as an accepted member the moment a party is created.
CREATE OR REPLACE FUNCTION public.handle_new_party()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.party_members (party_id, user_id, role, status)
  VALUES (NEW.id, NEW.leader_id, 'leader', 'accepted');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_party_created ON parties;
CREATE TRIGGER on_party_created
  AFTER INSERT ON parties
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_party();

-- ============================================================
-- MEMBERSHIP CHECK — SECURITY DEFINER so RLS policies on parties and
-- party_members can ask "is this user an accepted member of this party"
-- without querying party_members from inside its own policy. A policy on
-- party_members that does that re-enters its own RLS evaluation and
-- Postgres aborts with "infinite recursion detected in policy for relation
-- party_members" — this function breaks that cycle by running as its
-- owner, which bypasses RLS on its own SELECT.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_party_member(p_party_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = p_party_id
      AND pm.user_id = p_user_id
      AND pm.status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION public.is_party_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_party_member(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- RLS ENABLE
-- ============================================================
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: parties
-- ============================================================
CREATE POLICY "Members can view their party" ON parties
  FOR SELECT USING (
    leader_id = auth.uid()
    OR public.is_party_member(parties.id, auth.uid())
  );

CREATE POLICY "Users can create a party" ON parties
  FOR INSERT WITH CHECK (leader_id = auth.uid());

CREATE POLICY "Leader can update party" ON parties
  FOR UPDATE USING (leader_id = auth.uid());

CREATE POLICY "Leader can disband party" ON parties
  FOR DELETE USING (leader_id = auth.uid());

-- ============================================================
-- RLS POLICIES: party_members
-- ============================================================
-- Membership checks below go through is_party_member() (SECURITY DEFINER,
-- defined above) rather than a direct subquery on party_members: a policy
-- on party_members that queries party_members itself re-enters its own RLS
-- evaluation and Postgres aborts with "infinite recursion detected in
-- policy for relation party_members".
CREATE POLICY "Members can view their party roster" ON party_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_party_member(party_members.party_id, auth.uid())
  );

-- Leader (self-seat trigger) or an accepted member inviting an existing
-- accepted friend may insert a roster row.
CREATE POLICY "Leader or member can invite a friend" ON party_members
  FOR INSERT WITH CHECK (
    (
      EXISTS (SELECT 1 FROM parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
      OR public.is_party_member(party_members.party_id, auth.uid())
    )
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM friends f
        WHERE f.status = 'accepted'
          AND (
            (f.user_id = auth.uid() AND f.friend_id = party_members.user_id)
            OR (f.friend_id = auth.uid() AND f.user_id = party_members.user_id)
          )
      )
    )
  );

CREATE POLICY "Users can accept their own invite" ON party_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Leave or kick from party" ON party_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_members.party_id AND p.leader_id = auth.uid())
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_party_members_party_id ON party_members(party_id);
CREATE INDEX IF NOT EXISTS idx_party_members_user_id ON party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_party_members_status ON party_members(status);
CREATE INDEX IF NOT EXISTS idx_parties_leader_id ON parties(leader_id);

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
ALTER PUBLICATION supabase_realtime ADD TABLE party_members;

COMMIT;
