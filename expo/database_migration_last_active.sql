-- Driveverse Last Active
-- Records when each driver last had the app open, so DAU/WAU/MAU stop being
-- inferred and start being measured.
--
-- WHY THIS EXISTS
--
-- The admin dashboard approximates "active" by unioning the timestamps of
-- things a driver *produced* — a trip, a message, a served quest. That counts
-- users who did something, not users who opened the app, and it silently
-- undercounts everyone who opened it to look at the map and closed it again.
-- `profiles.last_active_at` is the direct measurement.
--
-- ONE TIMESTAMP, NOT A SESSION LOG. This column answers "when was this driver
-- last here" exactly. It cannot answer "how many drivers were here on the 3rd"
-- — that needs a per-day event log, which is a bigger change. So the dashboard
-- reads rolling windows (last 24h / 7d / 30d) off this column and keeps the
-- day-by-day chart and the retention cohorts on the approximation, labelled as
-- such. Do not read a calendar-day number off this column.
--
-- TWO WRITE PATHS, mirroring how presence already works:
--
--   1. `touch_last_active()` — the app calls this RPC on launch, on every
--      foreground, and on a heartbeat while it stays open
--      (hooks/useLastActivePing.ts). This is the path that counts a driver who
--      opens the app and does nothing.
--   2. A trigger on `user_locations` — anyone visible on the live map is by
--      definition here, so their position upsert touches the column too. This
--      is the fallback: if the RPC is missing, blocked or failing on a build
--      that shipped before it, the number degrades to "everyone who was on the
--      map" instead of to zero.
--
-- BOTH PATHS ARE THROTTLED IN SQL, not just in the client. `user_locations` is
-- upserted every ~10 seconds per online driver; writing `profiles` that often
-- would be a row update per driver per 10s for a column nothing reads in real
-- time. Both paths skip the write entirely when the stored value is younger
-- than TOUCH_INTERVAL (5 minutes), so the steady-state cost is one indexed
-- primary-key probe.
--
-- Run this in your Supabase SQL Editor.

-- ============================================================
-- PROFILES — the column
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.profiles.last_active_at IS
  'Last time this user had the app open (RPC ping + user_locations trigger, '
  'both throttled to 5 minutes). NULL means never seen since the column '
  'shipped — not "inactive".';

-- The dashboard asks "who was active in the last N days" and "who is the most
-- recently seen", both of which are this index. NULLS LAST because a NULL here
-- means "unknown", and unknown sorts after every real timestamp rather than
-- ahead of all of them.
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON public.profiles (last_active_at DESC NULLS LAST);

-- ============================================================
-- RPC: touch_last_active()
-- ============================================================
-- Called by the client. Returns the effective timestamp so a caller can tell
-- "written" from "skipped by the throttle" without a second round trip, and
-- NULL when there is no authenticated user or no profile row yet (a signed-out
-- app and a half-finished signup are both normal, neither is an error).
--
-- SECURITY DEFINER so the write does not depend on the profiles UPDATE policy
-- staying exactly as it is; the function can only ever touch the caller's own
-- row and only ever this one column, so it grants nothing else.
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid  UUID := auth.uid();
  seen TIMESTAMP WITH TIME ZONE;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.last_active_at INTO seen FROM public.profiles p WHERE p.id = uid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Throttle: a client that pings more often than it should costs a read.
  IF seen IS NOT NULL AND seen > NOW() - INTERVAL '5 minutes' THEN
    RETURN seen;
  END IF;

  UPDATE public.profiles
     SET last_active_at = NOW()
   WHERE id = uid
  RETURNING last_active_at INTO seen;

  RETURN seen;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

-- ============================================================
-- TRIGGER: user_locations -> profiles.last_active_at
-- ============================================================
-- The fallback path. A driver whose position is being published is here, so
-- their presence heartbeat doubles as an activity ping. Same 5-minute throttle,
-- expressed as a predicate on the UPDATE so a skipped touch is a no-op rather
-- than a write.
CREATE OR REPLACE FUNCTION public.user_locations_touch_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
     SET last_active_at = NOW()
   WHERE id = NEW.user_id
     AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '5 minutes');
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.user_locations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS user_locations_touch_last_active ON public.user_locations;
    CREATE TRIGGER user_locations_touch_last_active
      AFTER INSERT OR UPDATE ON public.user_locations
      FOR EACH ROW EXECUTE PROCEDURE public.user_locations_touch_last_active();
  END IF;
END $$;

-- ============================================================
-- BACKFILL
-- ============================================================
-- Seed the column from the activity that already exists, so the dashboard is
-- not blank for a month while pings accumulate. This is the same evidence the
-- approximation uses, collapsed to one timestamp per user: strictly a lower
-- bound on when each driver was last here, and superseded by the first real
-- ping. Every source is guarded by `to_regclass` — this repo has no single
-- migration history, so any given database may not have all of these tables.
DO $$
DECLARE
  src RECORD;
BEGIN
  FOR src IN
    SELECT * FROM (VALUES
      ('public.trips',        'user_id',   'created_at'),
      ('public.daily_quests', 'user_id',   'created_at'),
      ('public.direct_messages', 'sender_id', 'created_at'),
      ('public.user_locations',  'user_id',   'updated_at')
    ) AS t(tbl, user_col, ts_col)
  LOOP
    IF to_regclass(src.tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.profiles p
          SET last_active_at = s.ts
         FROM (SELECT %I AS uid, MAX(%I) AS ts FROM %s GROUP BY %I) s
        WHERE s.uid = p.id
          AND s.ts IS NOT NULL
          AND (p.last_active_at IS NULL OR p.last_active_at < s.ts)',
      src.user_col, src.ts_col, src.tbl, src.user_col
    );
  END LOOP;
END $$;

COMMIT;
