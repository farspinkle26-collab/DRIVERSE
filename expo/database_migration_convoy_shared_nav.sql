-- Driveverse — convoys: make creation work, open invites to any driver, and
-- give the convoy one shared destination.
--
-- Run this in the Supabase SQL editor. It is idempotent and self-healing: it
-- can be run against a database that has every earlier convoy migration, or
-- against one that only ever got database_migration_parties.sql, and it will
-- leave both in the same state. Run it after database_migration_profile_v2.sql
-- (which supplies `friends` and `handle_updated_at()`); everything else it
-- needs it creates or backfills itself.
--
-- ============================================================
-- WHY: "Couldn't create convoy. Please try again."
-- ============================================================
--
-- Creating a convoy is one client INSERT into `parties`, but four things fire
-- off the back of it, and any one of them failing fails the INSERT — with the
-- app showing the same useless alert either way:
--
--   1. `on_party_created`      seats the leader in `party_members`
--   2. `enforce_convoy_limit`  checks the leader's tier cap
--   3. `party_check_capacity`  checks `max_members`
--   4. `party_create_conversation` opens the convoy's group chat
--
-- Two causes were live at once, and neither is something a driver can retry
-- their way out of:
--
--   * **The client writes columns a half-migrated database doesn't have.**
--     `visibility`, `description` and `max_members` arrive in
--     database_migration_community_v2.sql, not in the parties migration. On a
--     database with parties but not community_v2, every create fails with
--     PostgREST's PGRST204 before it reaches a single trigger. The column
--     backfill below fixes that permanently, and the app now reports the
--     error text instead of "please try again".
--
--   * **RLS policies on `party_members` that query `party_members`.** Step 1
--     re-enters the policy that is being evaluated and Postgres aborts the
--     whole statement with 42P17 "infinite recursion detected in policy for
--     relation party_members". database_migration_fix_convoy_rls_recursion.sql
--     already fixes this; it is repeated here so that one file is enough.
--
-- Beyond the repair, creation now goes through `create_convoy()` — a
-- SECURITY DEFINER function that does the whole thing in one statement. That
-- matters for more than tidiness: running as the function owner takes the
-- leader's own seat out of RLS entirely, so this class of failure cannot come
-- back through a policy edit. The app still falls back to the direct INSERT
-- when the function isn't deployed, so an un-migrated database degrades to the
-- old behaviour rather than to a broken screen.

-- ============================================================
-- 0. COLUMN BACKFILL — parties
-- ============================================================
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'invite_only'
  CHECK (visibility IN ('public', 'invite_only'));
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 0 CHECK (max_members >= 0);

CREATE INDEX IF NOT EXISTS idx_parties_visibility ON public.parties(visibility);

-- ── The shared destination ──────────────────────────────────
-- Denormalised onto the convoy rather than given its own table: there is
-- exactly one destination per convoy, it is replaced rather than appended to,
-- and it has to arrive with the party row the members already subscribe to.
-- A separate table would mean a second realtime subscription and a join for
-- something that is never queried on its own.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS dest_name TEXT;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS dest_set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS dest_set_at TIMESTAMPTZ;

-- ============================================================
-- 1. MEMBERSHIP CHECK — the cycle-breaker
-- ============================================================
-- SECURITY DEFINER so it bypasses RLS on its own SELECT. Every policy below
-- asks membership questions through this and never through a subquery on
-- party_members, which is what makes the whole policy set non-recursive.
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

-- The convoy a driver is currently in, or NULL. Same reason for SECURITY
-- DEFINER, and it saves every caller below repeating the lookup.
CREATE OR REPLACE FUNCTION public.current_convoy_id(p_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.party_id
  FROM public.party_members pm
  WHERE pm.user_id = p_user_id AND pm.status = 'accepted'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_convoy_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_convoy_id(UUID) TO authenticated, service_role;

-- ============================================================
-- 2. RLS — non-recursive replacements
-- ============================================================
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their party" ON public.parties;
DROP POLICY IF EXISTS "View public convoys or your own" ON public.parties;
CREATE POLICY "View public convoys or your own" ON public.parties
  FOR SELECT USING (
    visibility = 'public'
    OR leader_id = auth.uid()
    OR public.is_party_member(parties.id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create a party" ON public.parties;
CREATE POLICY "Users can create a party" ON public.parties
  FOR INSERT WITH CHECK (leader_id = auth.uid());

DROP POLICY IF EXISTS "Leader can update party" ON public.parties;
CREATE POLICY "Leader can update party" ON public.parties
  FOR UPDATE USING (leader_id = auth.uid()) WITH CHECK (leader_id = auth.uid());

DROP POLICY IF EXISTS "Leader can disband party" ON public.parties;
CREATE POLICY "Leader can disband party" ON public.parties
  FOR DELETE USING (leader_id = auth.uid());

DROP POLICY IF EXISTS "Members can view their party roster" ON public.party_members;
CREATE POLICY "Members can view their party roster" ON public.party_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_party_member(party_members.party_id, auth.uid())
    -- An open convoy's roster is public, or the browse list could not show
    -- head counts. Nothing but the membership row itself is exposed.
    OR EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id = party_members.party_id AND p.visibility = 'public'
    )
  );

-- ── INSERT: who may put a row on a roster ───────────────────
--
-- Changed here: a convoy invite no longer requires an accepted `friends` row.
-- The product asks for "invite everybody" — from the roster screen, from a
-- driver's map marker, from search — and the friends requirement made the
-- most natural invite (the driver you can see two streets away) the one that
-- failed. An invite is a row the target can decline, and only a member of the
-- convoy can create one, which is the check that actually matters.
--
-- The trade that buys: any convoy member can put a pending invite in front of
-- any driver. That is the same exposure a friend request already has, and the
-- invite carries no location, no contact detail and no obligation.
DROP POLICY IF EXISTS "Leader or member can invite a friend" ON public.party_members;
DROP POLICY IF EXISTS "Leader, member-invite, or self-join public convoy" ON public.party_members;
DROP POLICY IF EXISTS "Leader, member-invite, or self-join a convoy" ON public.party_members;
CREATE POLICY "Leader, member-invite, or self-join a convoy" ON public.party_members
  FOR INSERT WITH CHECK (
    -- (a) Seating myself in a public convoy.
    (
      user_id = auth.uid()
      AND status = 'accepted'
      AND EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.visibility = 'public')
    )
    -- (b) Accepting an invite that is already addressed to me is an UPDATE,
    --     not an INSERT — but a self-seat by the leader on a fresh convoy
    --     lands here.
    OR (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
    )
    -- (c) Inviting another driver: I must be in the convoy, and the row I
    --     write must be a pending invite. A member cannot seat someone
    --     directly as 'accepted' — that decision stays with the invitee.
    OR (
      status = 'invited'
      AND (
        EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_id AND p.leader_id = auth.uid())
        OR public.is_party_member(party_members.party_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can accept their own invite" ON public.party_members;
CREATE POLICY "Users can accept their own invite" ON public.party_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Leave or kick from party" ON public.party_members;
CREATE POLICY "Leave or kick from party" ON public.party_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.parties p WHERE p.id = party_members.party_id AND p.leader_id = auth.uid())
  );

-- ============================================================
-- 3. LEADER AUTO-SEAT — restated so this file stands alone
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_party()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.party_members (party_id, user_id, role, status)
  VALUES (NEW.id, NEW.leader_id, 'leader', 'accepted')
  ON CONFLICT (party_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_party_created ON public.parties;
CREATE TRIGGER on_party_created
  AFTER INSERT ON public.parties
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_party();

-- ============================================================
-- 4. TIER CAP — read defensively
-- ============================================================
-- `platinum_limit()` arrives with database_migration_platinum.sql. This
-- wrapper means every convoy function below works whether or not that
-- migration has been run: no Platinum tables, no cap.
CREATE OR REPLACE FUNCTION public.convoy_seat_cap(p_leader UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap INTEGER;
BEGIN
  BEGIN
    cap := public.platinum_limit('convoy_members', p_leader);
  EXCEPTION WHEN undefined_function OR undefined_table THEN
    cap := NULL;
  END;
  RETURN cap;
END;
$$;

REVOKE ALL ON FUNCTION public.convoy_seat_cap(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convoy_seat_cap(UUID) TO authenticated, service_role;

-- ============================================================
-- 5. create_convoy() — the whole creation, in one statement
-- ============================================================
--
-- Errors are raised with a machine-readable prefix so the client can tell
-- "you're already in one" from "the database is broken" without parsing
-- English. `PLATINUM_LIMIT:` is the shape lib/platinumLimits.ts already reads.
CREATE OR REPLACE FUNCTION public.create_convoy(
  p_name TEXT,
  p_visibility TEXT DEFAULT 'invite_only',
  p_description TEXT DEFAULT '',
  p_max_members INTEGER DEFAULT 0,
  p_color TEXT DEFAULT NULL
)
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cap INTEGER;
  v_max INTEGER;
  v_existing UUID;
  v_party public.parties;
  v_palette TEXT[] := ARRAY['#FFD700', '#FF3B6F', '#22D3EE', '#A78BFA', '#34D399'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN: Sign in to start a convoy.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_existing := public.current_convoy_id(v_uid);
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_IN_CONVOY: Leave your current convoy before starting another.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- A requested capacity above the organiser's tier cap is clamped, not
  -- rejected: the driver picked a number from a menu, and honouring the real
  -- ceiling beats failing the create. Mirrors the client.
  v_cap := public.convoy_seat_cap(v_uid);
  v_max := COALESCE(p_max_members, 0);
  IF v_cap IS NOT NULL THEN
    v_max := CASE WHEN v_max <= 0 THEN v_cap ELSE LEAST(v_max, v_cap) END;
  END IF;

  INSERT INTO public.parties (leader_id, name, color, visibility, description, max_members)
  VALUES (
    v_uid,
    COALESCE(NULLIF(btrim(COALESCE(p_name, '')), ''), 'Convoy'),
    COALESCE(NULLIF(btrim(COALESCE(p_color, '')), ''), v_palette[1 + floor(random() * array_length(v_palette, 1))::int]),
    CASE WHEN p_visibility IN ('public', 'invite_only') THEN p_visibility ELSE 'invite_only' END,
    COALESCE(btrim(COALESCE(p_description, '')), ''),
    v_max
  )
  RETURNING * INTO v_party;

  -- `on_party_created` normally does this. Repeated (idempotently) so the
  -- convoy still has a leader if that trigger was ever dropped — a convoy
  -- with an empty roster is invisible to its own creator, which is the
  -- failure that looks exactly like "create didn't work".
  INSERT INTO public.party_members (party_id, user_id, role, status)
  VALUES (v_party.id, v_uid, 'leader', 'accepted')
  ON CONFLICT (party_id, user_id) DO NOTHING;

  RETURN v_party;
END;
$$;

REVOKE ALL ON FUNCTION public.create_convoy(TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_convoy(TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- ============================================================
-- 6. invite_to_convoy() — any driver, not just friends
-- ============================================================
CREATE OR REPLACE FUNCTION public.invite_to_convoy(p_user_id UUID)
RETURNS public.party_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party_id UUID;
  v_leader UUID;
  v_cap INTEGER;
  v_taken INTEGER;
  v_row public.party_members;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN: Sign in to invite drivers.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_party_id := public.current_convoy_id(v_uid);
  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'NO_CONVOY: Start a convoy before inviting anyone.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'SELF_INVITE: You are already in this convoy.' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id = v_party_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_INVITED: That driver is already in your convoy or has an invite waiting.'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT leader_id INTO v_leader FROM public.parties WHERE id = v_party_id;
  v_cap := public.convoy_seat_cap(v_leader);

  -- Outstanding invites count as taken seats. Without that a leader can
  -- invite ten drivers and only discover the ceiling when the third accepts.
  IF v_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_taken
    FROM public.party_members
    WHERE party_id = v_party_id AND status IN ('accepted', 'invited');

    IF v_taken >= v_cap THEN
      RAISE EXCEPTION 'PLATINUM_LIMIT:convoy_members:% This convoy is full at % drivers.', v_cap, v_cap
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.party_members (party_id, user_id, role, status)
  VALUES (v_party_id, p_user_id, 'member', 'invited')
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_to_convoy(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_to_convoy(UUID) TO authenticated, service_role;

-- ============================================================
-- 7. SHARED DESTINATION — leader writes, everyone reads
-- ============================================================
--
-- The leader's route is the convoy's route. Written through a function rather
-- than an UPDATE so that "only the leader" is one rule in one place: the
-- UPDATE policy on `parties` allows the leader to change anything on the row,
-- and a member's client must not be able to reach these five columns at all.
CREATE OR REPLACE FUNCTION public.set_convoy_destination(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_name TEXT DEFAULT NULL
)
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party_id UUID;
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN: Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'BAD_DESTINATION: That is not a point on the map.' USING ERRCODE = 'check_violation';
  END IF;

  v_party_id := public.current_convoy_id(v_uid);
  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'NO_CONVOY: You are not in a convoy.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.parties
  SET dest_lat = p_lat,
      dest_lng = p_lng,
      dest_name = NULLIF(btrim(COALESCE(p_name, '')), ''),
      dest_set_by = v_uid,
      dest_set_at = NOW()
  WHERE id = v_party_id AND leader_id = v_uid
  RETURNING * INTO v_party;

  IF v_party.id IS NULL THEN
    RAISE EXCEPTION 'NOT_LEADER: Only the convoy leader sets where the convoy is going.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_party;
END;
$$;

REVOKE ALL ON FUNCTION public.set_convoy_destination(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_convoy_destination(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_convoy_destination()
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party_id UUID;
  v_party public.parties;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_SIGNED_IN: Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_party_id := public.current_convoy_id(v_uid);
  IF v_party_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.parties
  SET dest_lat = NULL, dest_lng = NULL, dest_name = NULL, dest_set_by = NULL, dest_set_at = NULL
  WHERE id = v_party_id AND leader_id = v_uid
  RETURNING * INTO v_party;

  RETURN v_party;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_convoy_destination() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_convoy_destination() TO authenticated, service_role;

-- ============================================================
-- 8. SEARCH — find a driver to invite
-- ============================================================
--
-- `profiles` is already readable by any signed-in driver
-- (database_migration_garage_and_public_profiles.sql), so this exists for one
-- reason: it excludes drivers who are already in a convoy, which the client
-- cannot work out for itself — `party_members` rows for other people's
-- convoys are not visible to it.
CREATE OR REPLACE FUNCTION public.search_convoy_invitees(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (id UUID, name TEXT, avatar TEXT, in_convoy BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(p.name, 'Driver') AS name,
    p.avatar,
    EXISTS (
      SELECT 1 FROM public.party_members pm
      WHERE pm.user_id = p.id AND pm.status = 'accepted'
    ) AS in_convoy
  FROM public.profiles p
  WHERE p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      btrim(COALESCE(p_query, '')) = ''
      OR p.name ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY p.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_convoy_invitees(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_convoy_invitees(TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================
-- 9. THE CONVOY'S GROUP CHAT — the same recursion, still live
-- ============================================================
--
-- Found by running this migration against a fully-migrated database and
-- reading the convoy back: creating a convoy succeeds, and then every read of
-- its chat fails with
--
--   ERROR: infinite recursion detected in policy for relation
--          "group_conversation_members"
--
-- because database_migration_community_v2.sql gave that table the identical
-- self-referencing policy party_members had — "am I in this conversation?"
-- answered by a subquery on the table whose policy is being evaluated. The
-- convoy fix never reached it. `group_conversations` and `group_messages`
-- both ask their membership question through the same table, so all three are
-- unreadable: `app/convoy/[id].tsx` looks up the convoy's conversation on
-- open, and that lookup is one of these.
--
-- Same cure: a SECURITY DEFINER membership function.
--
-- Wrapped in a guard because these tables arrive with community v2, and this
-- file has to keep working on a database that only ever got the parties
-- migration.
DO $$
BEGIN
  IF to_regclass('public.group_conversation_members') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.is_group_conversation_member(p_conversation_id UUID, p_user_id UUID)
    RETURNS BOOLEAN
    LANGUAGE SQL
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM public.group_conversation_members gcm
        WHERE gcm.conversation_id = p_conversation_id
          AND gcm.user_id = p_user_id
      );
    $body$;
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.is_group_conversation_member(UUID, UUID) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_group_conversation_member(UUID, UUID) TO authenticated, service_role';

  EXECUTE 'DROP POLICY IF EXISTS "Members can view the roster" ON public.group_conversation_members';
  EXECUTE $pol$
    CREATE POLICY "Members can view the roster" ON public.group_conversation_members
      FOR SELECT USING (
        user_id = auth.uid()
        OR public.is_group_conversation_member(group_conversation_members.conversation_id, auth.uid())
      );
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS "Members can view their conversation" ON public.group_conversations';
  EXECUTE $pol$
    CREATE POLICY "Members can view their conversation" ON public.group_conversations
      FOR SELECT USING (
        public.is_group_conversation_member(group_conversations.id, auth.uid())
      );
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS "Members can view messages" ON public.group_messages';
  EXECUTE $pol$
    CREATE POLICY "Members can view messages" ON public.group_messages
      FOR SELECT USING (
        public.is_group_conversation_member(group_messages.conversation_id, auth.uid())
      );
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages';
  EXECUTE $pol$
    CREATE POLICY "Members can send messages" ON public.group_messages
      FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND public.is_group_conversation_member(group_messages.conversation_id, auth.uid())
      );
  $pol$;
END $$;

-- ============================================================
-- 9b. THE LEADER WAS NEVER IN THEIR OWN CONVOY'S CHAT
-- ============================================================
--
-- Also found by running the whole thing and looking: after creating a convoy,
-- the leader could see no conversation while the member who accepted an
-- invite could see it fine.
--
-- Two AFTER INSERT triggers hang off `parties`, and Postgres fires them in
-- **alphabetical order by trigger name**:
--
--   on_party_created        → seats the leader in party_members
--   party_create_conversation → opens the group conversation
--
-- `on_party_created` sorts first, so the leader's roster row is written while
-- no conversation exists yet. `party_member_sync_conversation` looks for one,
-- finds none, and the leader is never added. Every member who joins *after*
-- creation is added correctly, which is exactly why this looked like it
-- worked.
--
-- Renaming a trigger to reorder them would be a fix that depends on a
-- collation. Instead the conversation seats whoever is already on the roster
-- when it is created — which is the honest statement of the rule, and is
-- order-independent.
DO $$
BEGIN
  IF to_regclass('public.group_conversations') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.party_create_conversation()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_conversation_id UUID;
    BEGIN
      INSERT INTO public.group_conversations (kind, party_id, title)
      VALUES ('convoy', NEW.id, NEW.name)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_conversation_id;

      IF v_conversation_id IS NULL THEN
        SELECT id INTO v_conversation_id
        FROM public.group_conversations WHERE party_id = NEW.id;
      END IF;

      INSERT INTO public.group_conversation_members (conversation_id, user_id)
      SELECT v_conversation_id, pm.user_id
      FROM public.party_members pm
      WHERE pm.party_id = NEW.id AND pm.status = 'accepted'
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $body$;
  $fn$;

  -- One-time repair for convoys created before this migration, whose leaders
  -- are locked out of a chat they own.
  EXECUTE $backfill$
    INSERT INTO public.group_conversation_members (conversation_id, user_id)
    SELECT gc.id, pm.user_id
    FROM public.group_conversations gc
    JOIN public.party_members pm ON pm.party_id = gc.party_id AND pm.status = 'accepted'
    WHERE gc.party_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  $backfill$;
END $$;

-- ============================================================
-- 10. REALTIME
-- ============================================================
-- `parties` carries the shared destination now, so a member's map depends on
-- this publication to hear about it.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parties;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
