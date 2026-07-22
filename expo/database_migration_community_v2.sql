-- Driveverse Community v2: country-scoped events, open-join convoys, group chat
-- Run this in your Supabase SQL Editor after database_migration_events_realtime.sql
-- and database_migration_parties.sql have already been applied.

-- ============================================================
-- PROFILES — country
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- ============================================================
-- EVENTS — country scoping
-- ============================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

-- Stamp the creator's profile country onto the event at insert time so
-- clients never need to pass it explicitly.
CREATE OR REPLACE FUNCTION public.events_set_country()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.country IS NULL OR NEW.country = '' THEN
    SELECT country INTO NEW.country FROM public.profiles WHERE id = NEW.creator_id;
    NEW.country := COALESCE(NEW.country, '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS events_set_country ON public.events;
CREATE TRIGGER events_set_country
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.events_set_country();

CREATE INDEX IF NOT EXISTS idx_events_country ON public.events(country);

-- Replace the "view events" policy: only events in the viewer's own
-- country are visible (plus your own, even before you set a country).
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.events;
CREATE POLICY "Users view events in their own country" ON public.events
  FOR SELECT USING (
    creator_id = auth.uid()
    OR (
      country <> ''
      AND country = (SELECT country FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Defense in depth: joining is only allowed when the event's country
-- matches the joining user's profile country.
DROP POLICY IF EXISTS "Users can join events" ON public.event_participants;
CREATE POLICY "Users can join events in their country" ON public.event_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE e.id = event_participants.event_id
        AND e.country <> ''
        AND e.country = p.country
    )
  );

-- ============================================================
-- PARTIES — open-join visibility
-- ============================================================
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'invite_only'
  CHECK (visibility IN ('public', 'invite_only'));
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 0 CHECK (max_members >= 0);

CREATE INDEX IF NOT EXISTS idx_parties_visibility ON public.parties(visibility);

-- Anyone authenticated can browse public convoys; existing member/leader
-- visibility still applies for invite-only ones.
DROP POLICY IF EXISTS "Members can view their party" ON public.parties;
CREATE POLICY "View public convoys or your own" ON public.parties
  FOR SELECT USING (
    visibility = 'public'
    OR leader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.party_members pm
      WHERE pm.party_id = parties.id AND pm.user_id = auth.uid()
    )
  );

-- A user may self-join (accepted, no invite) any public convoy.
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
        OR EXISTS (
          SELECT 1 FROM public.party_members pm
          WHERE pm.party_id = party_members.party_id
            AND pm.user_id = auth.uid()
            AND pm.status = 'accepted'
        )
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

-- Enforce max_members at the database level (0 = unlimited), mirrors
-- event_check_capacity.
CREATE OR REPLACE FUNCTION public.party_check_capacity()
RETURNS TRIGGER AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
BEGIN
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  SELECT max_members INTO cap FROM public.parties WHERE id = NEW.party_id;
  IF cap IS NOT NULL AND cap > 0 THEN
    SELECT COUNT(*) INTO current_count
    FROM public.party_members WHERE party_id = NEW.party_id AND status = 'accepted';
    IF current_count >= cap THEN
      RAISE EXCEPTION 'Convoy is full';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS party_check_capacity ON public.party_members;
CREATE TRIGGER party_check_capacity
  BEFORE INSERT ON public.party_members
  FOR EACH ROW EXECUTE PROCEDURE public.party_check_capacity();

-- ============================================================
-- GROUP CONVERSATIONS — chat tied to an event or a convoy
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'convoy')),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (
    (kind = 'event' AND event_id IS NOT NULL AND party_id IS NULL)
    OR (kind = 'convoy' AND party_id IS NOT NULL AND event_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_conversations_event ON public.group_conversations(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_conversations_party ON public.group_conversations(party_id) WHERE party_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.group_conversation_members (
  conversation_id UUID REFERENCES public.group_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.group_conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_conversation_members_user ON public.group_conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_conversation ON public.group_messages(conversation_id, created_at);

ALTER TABLE public.group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their conversation" ON public.group_conversations;
CREATE POLICY "Members can view their conversation" ON public.group_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_conversation_members gcm
      WHERE gcm.conversation_id = group_conversations.id AND gcm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can view the roster" ON public.group_conversation_members;
CREATE POLICY "Members can view the roster" ON public.group_conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_conversation_members gcm2
      WHERE gcm2.conversation_id = group_conversation_members.conversation_id
        AND gcm2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can view messages" ON public.group_messages;
CREATE POLICY "Members can view messages" ON public.group_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_conversation_members gcm
      WHERE gcm.conversation_id = group_messages.conversation_id AND gcm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can send messages" ON public.group_messages;
CREATE POLICY "Members can send messages" ON public.group_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_conversation_members gcm
      WHERE gcm.conversation_id = group_messages.conversation_id AND gcm.user_id = auth.uid()
    )
  );

-- ============================================================
-- TRIGGERS: create a conversation alongside each event/convoy,
-- and keep membership in sync with join/leave.
-- ============================================================
CREATE OR REPLACE FUNCTION public.event_create_conversation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.group_conversations (kind, event_id, title)
  VALUES ('event', NEW.id, NEW.title)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS event_create_conversation ON public.events;
CREATE TRIGGER event_create_conversation
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.event_create_conversation();

CREATE OR REPLACE FUNCTION public.party_create_conversation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.group_conversations (kind, party_id, title)
  VALUES ('convoy', NEW.id, NEW.name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS party_create_conversation ON public.parties;
CREATE TRIGGER party_create_conversation
  AFTER INSERT ON public.parties
  FOR EACH ROW EXECUTE PROCEDURE public.party_create_conversation();

CREATE OR REPLACE FUNCTION public.event_participant_sync_conversation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.group_conversation_members (conversation_id, user_id)
    SELECT gc.id, NEW.user_id FROM public.group_conversations gc
    WHERE gc.event_id = NEW.event_id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.group_conversation_members gcm
    USING public.group_conversations gc
    WHERE gc.id = gcm.conversation_id AND gc.event_id = OLD.event_id AND gcm.user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS event_participant_sync_conversation ON public.event_participants;
CREATE TRIGGER event_participant_sync_conversation
  AFTER INSERT OR DELETE ON public.event_participants
  FOR EACH ROW EXECUTE PROCEDURE public.event_participant_sync_conversation();

CREATE OR REPLACE FUNCTION public.party_member_sync_conversation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.group_conversation_members gcm
    USING public.group_conversations gc
    WHERE gc.id = gcm.conversation_id AND gc.party_id = OLD.party_id AND gcm.user_id = OLD.user_id;
    RETURN OLD;
  ELSIF NEW.status = 'accepted' THEN
    INSERT INTO public.group_conversation_members (conversation_id, user_id)
    SELECT gc.id, NEW.user_id FROM public.group_conversations gc
    WHERE gc.party_id = NEW.party_id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS party_member_sync_conversation ON public.party_members;
CREATE TRIGGER party_member_sync_conversation
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.party_members
  FOR EACH ROW EXECUTE PROCEDURE public.party_member_sync_conversation();

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_conversation_members;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
