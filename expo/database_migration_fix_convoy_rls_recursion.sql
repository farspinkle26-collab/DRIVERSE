-- Driveverse — fix "infinite recursion detected in policy for relation
-- party_members" (Postgres 42P17).
--
-- database_migration_parties.sql and database_migration_community_v2.sql
-- both gave party_members RLS policies that check membership by querying
-- party_members from inside its own policy (`EXISTS (SELECT 1 FROM
-- party_members pm WHERE ...)`). Evaluating that policy re-triggers RLS on
-- party_members, which re-evaluates the same policy, forever — Postgres
-- detects the cycle and refuses the whole statement. Since creating a
-- convoy auto-seats the leader into party_members via the
-- `on_party_created` trigger, this broke every "Create Convoy" tap.
--
-- Fix: move the membership check into a SECURITY DEFINER function. Because
-- it runs as the function owner it bypasses RLS on its own SELECT, so it
-- can answer "is this user an accepted member of this party" without
-- re-entering party_members' policies.
--
-- Run this after database_migration_parties.sql, database_migration_community_v2.sql
-- and database_migration_platinum.sql.

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
-- parties — SELECT policy (was querying party_members directly)
-- ============================================================
DROP POLICY IF EXISTS "View public convoys or your own" ON public.parties;
DROP POLICY IF EXISTS "Members can view their party" ON public.parties;
CREATE POLICY "View public convoys or your own" ON public.parties
  FOR SELECT USING (
    visibility = 'public'
    OR leader_id = auth.uid()
    OR public.is_party_member(parties.id, auth.uid())
  );

-- ============================================================
-- party_members — SELECT policy (the self-referencing one)
-- ============================================================
DROP POLICY IF EXISTS "Members can view their party roster" ON public.party_members;
CREATE POLICY "Members can view their party roster" ON public.party_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_party_member(party_members.party_id, auth.uid())
  );

-- ============================================================
-- party_members — INSERT policy (self-referencing "am I already
-- an accepted member" check)
-- ============================================================
DROP POLICY IF EXISTS "Leader, member-invite, or self-join public convoy" ON public.party_members;
DROP POLICY IF EXISTS "Leader or member can invite a friend" ON public.party_members;
CREATE POLICY "Leader, member-invite, or self-join public convoy" ON public.party_members
  FOR INSERT WITH CHECK (
    (
      user_id = auth.uid()
      AND status = 'accepted'
      AND EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.visibility = 'public')
    )
    OR (
      (
        EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
        OR public.is_party_member(party_members.party_id, auth.uid())
      )
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.friends f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = auth.uid() AND f.friend_id = party_members.user_id)
              OR (f.friend_id = auth.uid() AND f.user_id = party_members.user_id)
            )
        )
      )
    )
  );

COMMIT;
