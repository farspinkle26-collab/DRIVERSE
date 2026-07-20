-- Driveverse — Daily Quest System (procedural, rule-based, no AI)
-- =====================================================================
-- A modular quest engine that generates 3 personalised daily quests per
-- user (1 Easy, 1 Medium, 1 Hard) from a catalogue of templates + a
-- Point-of-Interest (POI) database. Generation is a server-side function
-- so it is atomic, scalable to millions of users, and can be scheduled
-- with pg_cron. Templates × POIs × numeric parameter ranges × time
-- windows produce millions of distinct quest combinations.
--
-- Run this whole file in your Supabase SQL Editor. It is idempotent
-- (safe to re-run) — tables use IF NOT EXISTS, policies/functions are
-- dropped-and-recreated, and seed rows upsert on conflict.
--
-- Design overview
--   quest_templates      catalogue of parametric quest blueprints
--   points_of_interest   landmarks / cafés / viewpoints / routes / …
--   badges               catalogue of unlockable badges
--   daily_quests         generated quest instances (per user, per day)
--   user_quest_stats     coins, streak, counters, progression per user
--   user_badges          badges a user has unlocked
--
--   ensure_daily_quests()  lazy generator — call on app open
--   complete_quest()       claim rewards for a finished quest
--   update_quest_progress()incremental progress updates
--   award_badges()         internal — unlock badges on milestones
-- =====================================================================


-- =====================================================================
-- 1. QUEST TEMPLATES — the rule-based blueprint catalogue
-- =====================================================================
-- Each row is a parametric blueprint. The generator fills placeholders
-- ({target}, {unit}, {poi}, {category}, {window}) and rolls a numeric
-- target inside [param_min, param_max] snapped to param_step.
CREATE TABLE IF NOT EXISTS public.quest_templates (
  id TEXT PRIMARY KEY,                       -- stable slug, e.g. 'night_cruiser'
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT NOT NULL,                     -- exploration | driving | social | scenic | fuel | photo | eco | streak
  objective_type TEXT NOT NULL,              -- how progress is measured (see questEngine.ts)
  title_template TEXT NOT NULL,              -- may contain placeholders
  description_template TEXT NOT NULL,        -- may contain placeholders
  icon TEXT NOT NULL DEFAULT 'Flame',        -- lucide icon name for the UI
  accent_color TEXT NOT NULL DEFAULT '#FF6B35',

  -- POI requirement. NULL = no POI needed. 'any' = any active POI.
  poi_category TEXT,                          -- landmark|cafe|viewpoint|route|workshop|fuel|ev_station|any

  -- Parametric target: rolled target = param_min + k*param_step
  param_min NUMERIC NOT NULL DEFAULT 1,
  param_max NUMERIC,                          -- NULL => fixed target = param_min
  param_step NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',             -- 'km', 'places', 'photos', ...

  -- Eligibility rules
  min_level INTEGER NOT NULL DEFAULT 1,
  max_level INTEGER,                          -- NULL => no upper bound
  time_windows TEXT[],                        -- e.g. {'evening','night'}; NULL => any time
  weather TEXT,                               -- required weather, else NULL (optional)
  required_event TEXT,                        -- required special-event tag, else NULL

  -- Reward tuning (base amounts come from difficulty; this scales them)
  reward_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  badge_id TEXT,                              -- optional guaranteed badge on completion

  -- Selection weight for weighted-random draw (higher => more frequent)
  weight NUMERIC NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_templates_pick
  ON public.quest_templates(difficulty, is_active);


-- =====================================================================
-- 2. POINTS OF INTEREST — the location database
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.points_of_interest (
  id TEXT PRIMARY KEY,                        -- stable slug
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('landmark','cafe','viewpoint','route','workshop','fuel','ev_station')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city TEXT DEFAULT '',
  description TEXT DEFAULT '',
  min_level INTEGER NOT NULL DEFAULT 1,       -- gate exotic POIs behind level
  weight NUMERIC NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_category ON public.points_of_interest(category, is_active);


-- =====================================================================
-- 3. BADGES — unlockable achievement catalogue
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Award',
  accent_color TEXT NOT NULL DEFAULT '#FFD700',
  -- Criteria: how the badge unlocks
  criteria_type TEXT NOT NULL
    CHECK (criteria_type IN ('total_completed','streak','difficulty_completed','category_completed','coins_earned','manual')),
  criteria_value INTEGER NOT NULL DEFAULT 1,  -- threshold
  criteria_key TEXT,                          -- e.g. difficulty or category name
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =====================================================================
-- 4. DAILY QUESTS — generated quest instances (per user, per day)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.daily_quests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  quest_date DATE NOT NULL,                   -- the "quest day" (Asia/Jakarta)
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),

  template_id TEXT REFERENCES public.quest_templates(id) ON DELETE SET NULL,
  poi_id TEXT REFERENCES public.points_of_interest(id) ON DELETE SET NULL,

  -- Rendered, player-facing content (placeholders already substituted)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Flame',
  accent_color TEXT NOT NULL DEFAULT '#FF6B35',
  category TEXT NOT NULL DEFAULT 'driving',
  objective_type TEXT NOT NULL DEFAULT 'drive_distance',

  -- Progress tracking
  target NUMERIC NOT NULL DEFAULT 1,
  progress NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',

  -- Rewards (computed at generation, granted on completion)
  xp_reward INTEGER NOT NULL DEFAULT 0,
  coin_reward INTEGER NOT NULL DEFAULT 0,
  badge_id TEXT REFERENCES public.badges(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','expired')),
  generation_context JSONB DEFAULT '{}'::jsonb,  -- snapshot: level, time, weather, event, distance
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One quest per (user, day, difficulty)
  UNIQUE (user_id, quest_date, difficulty)
);

CREATE INDEX IF NOT EXISTS idx_daily_quests_user_day
  ON public.daily_quests(user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_recent_templates
  ON public.daily_quests(user_id, template_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_recent_pois
  ON public.daily_quests(user_id, poi_id, quest_date);


-- =====================================================================
-- 5. USER QUEST STATS — coins, streak, counters, progression
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_quest_stats (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0,
  total_completed INTEGER NOT NULL DEFAULT 0,
  total_xp_from_quests INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_completed_date DATE,
  -- Counters keyed by difficulty and by category, e.g.
  --   {"difficulty": {"hard": 12}, "category": {"scenic": 5}}
  counters JSONB NOT NULL DEFAULT '{"difficulty":{},"category":{}}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =====================================================================
-- 6. USER BADGES — badges a user has unlocked
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_id TEXT REFERENCES public.badges(id) ON DELETE CASCADE NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);


-- =====================================================================
-- 7. ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.quest_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges        ENABLE ROW LEVEL SECURITY;

-- Catalogue tables: readable by any signed-in user, no client writes.
DROP POLICY IF EXISTS "Templates are readable" ON public.quest_templates;
CREATE POLICY "Templates are readable" ON public.quest_templates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "POIs are readable" ON public.points_of_interest;
CREATE POLICY "POIs are readable" ON public.points_of_interest
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Badges are readable" ON public.badges;
CREATE POLICY "Badges are readable" ON public.badges
  FOR SELECT USING (true);

-- Daily quests: a user only sees & mutates their own.
DROP POLICY IF EXISTS "View own quests" ON public.daily_quests;
CREATE POLICY "View own quests" ON public.daily_quests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own quests" ON public.daily_quests;
CREATE POLICY "Update own quests" ON public.daily_quests
  FOR UPDATE USING (auth.uid() = user_id);

-- (Inserts happen through SECURITY DEFINER functions, not directly.)

-- Stats: owner read/update. (Writes go through functions; read for UI.)
DROP POLICY IF EXISTS "View own stats" ON public.user_quest_stats;
CREATE POLICY "View own stats" ON public.user_quest_stats
  FOR SELECT USING (auth.uid() = user_id);

-- Badges a user unlocked: publicly viewable (for profiles), owner-scoped writes via functions.
DROP POLICY IF EXISTS "User badges are viewable" ON public.user_badges;
CREATE POLICY "User badges are viewable" ON public.user_badges
  FOR SELECT USING (true);


-- =====================================================================
-- 8. REWARD MODEL  (mirrored in expo/lib/questEngine.ts)
-- =====================================================================
-- Base reward per difficulty, scaled by a level bonus and the template's
-- reward_multiplier. Keep in sync with questEngine.ts REWARD_TABLE.
CREATE OR REPLACE FUNCTION public.quest_base_reward(p_difficulty TEXT)
RETURNS TABLE (base_xp INTEGER, base_coins INTEGER) AS $$
  SELECT CASE p_difficulty
           WHEN 'easy'   THEN 120
           WHEN 'medium' THEN 280
           WHEN 'hard'   THEN 550
           ELSE 100
         END,
         CASE p_difficulty
           WHEN 'easy'   THEN 25
           WHEN 'medium' THEN 60
           WHEN 'hard'   THEN 130
           ELSE 20
         END;
$$ LANGUAGE sql IMMUTABLE;


-- =====================================================================
-- 9. GENERATOR — ensure_daily_quests()
-- =====================================================================
-- Lazily generates today's 3 quests for the calling user if missing, then
-- returns the active set. Considers: player level, current location,
-- nearby POIs, previously served templates/locations (anti-repetition),
-- time of day, optional weather and special events.
--
-- Call from the client when the quest screen opens, passing the device's
-- current coordinates (and optionally weather / event tags).
CREATE OR REPLACE FUNCTION public.ensure_daily_quests(
  p_lat     DOUBLE PRECISION DEFAULT NULL,
  p_lng     DOUBLE PRECISION DEFAULT NULL,
  p_weather TEXT DEFAULT NULL,
  p_event   TEXT DEFAULT NULL
)
RETURNS SETOF public.daily_quests AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_now            TIMESTAMPTZ := NOW();
  v_day            DATE := (v_now AT TIME ZONE 'Asia/Jakarta')::date;
  v_hour           INTEGER := EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Jakarta'))::int;
  v_expires        TIMESTAMPTZ := ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Jakarta');
  v_level          INTEGER := 1;
  v_time_bucket    TEXT;
  v_template_cd    INTEGER := 7;   -- days a template stays on cooldown per user
  v_poi_cd         INTEGER := 5;   -- days a POI stays on cooldown per user
  v_radius_km      NUMERIC := 40;  -- prefer POIs within this radius of the user
  v_diff           TEXT;
  v_tpl            public.quest_templates%ROWTYPE;
  v_poi            public.points_of_interest%ROWTYPE;
  v_have_poi       BOOLEAN;
  v_target         NUMERIC;
  v_steps          NUMERIC;
  v_base_xp        INTEGER;
  v_base_coins     INTEGER;
  v_level_bonus    NUMERIC;
  v_xp             INTEGER;
  v_coins          INTEGER;
  v_title          TEXT;
  v_desc           TEXT;
  v_existing       INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Time-of-day bucket (Asia/Jakarta)
  v_time_bucket := CASE
    WHEN v_hour >= 5  AND v_hour < 11 THEN 'morning'
    WHEN v_hour >= 11 AND v_hour < 15 THEN 'midday'
    WHEN v_hour >= 15 AND v_hour < 18 THEN 'afternoon'
    WHEN v_hour >= 18 AND v_hour < 22 THEN 'evening'
    ELSE 'night'
  END;

  -- Player level from the XP system (default 1 if none yet)
  SELECT COALESCE(level, 1) INTO v_level
  FROM public.user_xp WHERE user_id = v_uid;
  IF v_level IS NULL THEN v_level := 1; END IF;

  -- Ensure a stats row exists
  INSERT INTO public.user_quest_stats (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  -- Expire any of this user's stale quests (covers users returning after
  -- the daily boundary even without the scheduled cron job running).
  UPDATE public.daily_quests
  SET status = 'expired'
  WHERE user_id = v_uid AND status = 'active' AND expires_at <= v_now;

  -- Already have today's set? Return it.
  SELECT COUNT(*) INTO v_existing
  FROM public.daily_quests
  WHERE user_id = v_uid AND quest_date = v_day AND status <> 'expired';

  IF v_existing >= 3 THEN
    RETURN QUERY
      SELECT * FROM public.daily_quests
      WHERE user_id = v_uid AND quest_date = v_day AND status <> 'expired'
      ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END;
    RETURN;
  END IF;

  -- Generate one quest per difficulty (skip difficulties already present).
  FOREACH v_diff IN ARRAY ARRAY['easy','medium','hard'] LOOP
    IF EXISTS (
      SELECT 1 FROM public.daily_quests
      WHERE user_id = v_uid AND quest_date = v_day
        AND difficulty = v_diff AND status <> 'expired'
    ) THEN
      CONTINUE;
    END IF;

    -- ── Pick a template: weighted-random over eligible, non-cooldown rows,
    --    falling back to the full eligible pool if cooldown empties it. ──
    WITH recent AS (
      SELECT DISTINCT template_id FROM public.daily_quests
      WHERE user_id = v_uid AND template_id IS NOT NULL
        AND quest_date > v_day - v_template_cd
    ),
    eligible AS (
      SELECT t.* FROM public.quest_templates t
      WHERE t.is_active
        AND t.difficulty = v_diff
        AND v_level >= t.min_level
        AND (t.max_level IS NULL OR v_level <= t.max_level)
        AND (t.time_windows IS NULL OR v_time_bucket = ANY(t.time_windows))
        AND (t.weather IS NULL OR p_weather IS NULL OR t.weather = p_weather)
        AND (t.required_event IS NULL OR t.required_event = p_event)
    ),
    fresh AS (
      SELECT * FROM eligible
      WHERE id NOT IN (SELECT template_id FROM recent)
    ),
    pool AS (
      SELECT * FROM fresh
      UNION ALL
      SELECT * FROM eligible WHERE NOT EXISTS (SELECT 1 FROM fresh)
    )
    SELECT * INTO v_tpl FROM pool
    ORDER BY -LN(GREATEST(RANDOM(), 1e-12)) / GREATEST(weight, 0.0001)
    LIMIT 1;

    -- No eligible template for this difficulty/level/time — skip gracefully.
    IF v_tpl.id IS NULL THEN
      CONTINUE;
    END IF;

    -- ── Pick a POI if the template needs one ──
    v_poi := NULL;
    v_have_poi := FALSE;
    IF v_tpl.poi_category IS NOT NULL THEN
      WITH recent_poi AS (
        SELECT DISTINCT poi_id FROM public.daily_quests
        WHERE user_id = v_uid AND poi_id IS NOT NULL
          AND quest_date > v_day - v_poi_cd
      ),
      candidates AS (
        SELECT p.*,
          CASE WHEN p_lat IS NULL OR p_lng IS NULL THEN 0
          ELSE 6371 * ACOS(LEAST(1, GREATEST(-1,
              COS(RADIANS(p_lat)) * COS(RADIANS(p.latitude)) *
              COS(RADIANS(p.longitude) - RADIANS(p_lng)) +
              SIN(RADIANS(p_lat)) * SIN(RADIANS(p.latitude))
          ))) END AS dist_km
        FROM public.points_of_interest p
        WHERE p.is_active
          AND v_level >= p.min_level
          AND (v_tpl.poi_category = 'any' OR p.category = v_tpl.poi_category)
      ),
      nearby AS (
        SELECT * FROM candidates
        WHERE id NOT IN (SELECT poi_id FROM recent_poi)
          AND (p_lat IS NULL OR dist_km <= v_radius_km)
      ),
      fallback AS (
        -- widen if nothing nearby/fresh: any candidate not on cooldown, else any
        SELECT * FROM candidates
        WHERE NOT EXISTS (SELECT 1 FROM nearby)
      ),
      chosen AS (
        SELECT * FROM nearby
        UNION ALL
        SELECT * FROM fallback
      ),
      topk AS (
        SELECT * FROM chosen ORDER BY dist_km ASC LIMIT 8
      )
      -- Explicit column list (topk carries an extra dist_km that must not
      -- leak into the points_of_interest%ROWTYPE target).
      SELECT id, name, category, latitude, longitude, city, description,
             min_level, weight, is_active, created_at
      INTO v_poi
      FROM topk
      ORDER BY -LN(GREATEST(RANDOM(), 1e-12)) / GREATEST(weight, 0.0001)
      LIMIT 1;

      IF v_poi.id IS NOT NULL THEN
        v_have_poi := TRUE;
      END IF;
    END IF;

    -- ── Roll the numeric target inside the template's range ──
    IF v_tpl.param_max IS NULL OR v_tpl.param_max <= v_tpl.param_min THEN
      v_target := v_tpl.param_min;
    ELSE
      v_steps := FLOOR((v_tpl.param_max - v_tpl.param_min) / v_tpl.param_step);
      v_target := v_tpl.param_min + FLOOR(RANDOM() * (v_steps + 1)) * v_tpl.param_step;
    END IF;

    -- ── Substitute placeholders ──
    v_title := v_tpl.title_template;
    v_desc  := v_tpl.description_template;
    v_title := REPLACE(v_title, '{target}', TRIM(TO_CHAR(v_target, 'FM999999990.###')));
    v_desc  := REPLACE(v_desc,  '{target}', TRIM(TO_CHAR(v_target, 'FM999999990.###')));
    v_title := REPLACE(v_title, '{unit}', v_tpl.unit);
    v_desc  := REPLACE(v_desc,  '{unit}', v_tpl.unit);
    v_title := REPLACE(v_title, '{window}', v_time_bucket);
    v_desc  := REPLACE(v_desc,  '{window}', v_time_bucket);
    v_title := REPLACE(v_title, '{category}', COALESCE(v_tpl.poi_category, ''));
    v_desc  := REPLACE(v_desc,  '{category}', COALESCE(v_tpl.poi_category, ''));
    IF v_have_poi THEN
      v_title := REPLACE(v_title, '{poi}', v_poi.name);
      v_desc  := REPLACE(v_desc,  '{poi}', v_poi.name);
    ELSE
      v_title := REPLACE(v_title, '{poi}', 'a nearby spot');
      v_desc  := REPLACE(v_desc,  '{poi}', 'a nearby spot');
    END IF;

    -- ── Compute rewards ──
    SELECT base_xp, base_coins INTO v_base_xp, v_base_coins
    FROM public.quest_base_reward(v_diff);
    -- Level bonus: +1% per level, capped at +100% (level 100+)
    v_level_bonus := 1 + LEAST(v_level, 100) * 0.01;
    v_xp    := ROUND(v_base_xp   * v_tpl.reward_multiplier * v_level_bonus);
    v_coins := ROUND(v_base_coins * v_tpl.reward_multiplier * v_level_bonus);

    -- ── Insert the generated quest ──
    INSERT INTO public.daily_quests (
      user_id, quest_date, difficulty, template_id, poi_id,
      title, description, icon, accent_color, category, objective_type,
      target, progress, unit, xp_reward, coin_reward, badge_id,
      status, generation_context, expires_at
    ) VALUES (
      v_uid, v_day, v_diff, v_tpl.id,
      CASE WHEN v_have_poi THEN v_poi.id ELSE NULL END,
      v_title, v_desc, v_tpl.icon, v_tpl.accent_color, v_tpl.category, v_tpl.objective_type,
      v_target, 0, v_tpl.unit, v_xp, v_coins, v_tpl.badge_id,
      'active',
      jsonb_build_object(
        'level', v_level, 'time_bucket', v_time_bucket,
        'weather', p_weather, 'event', p_event,
        'poi_distance_km', CASE WHEN v_have_poi THEN ROUND(
          (6371 * ACOS(LEAST(1, GREATEST(-1,
            COS(RADIANS(COALESCE(p_lat, v_poi.latitude))) * COS(RADIANS(v_poi.latitude)) *
            COS(RADIANS(v_poi.longitude) - RADIANS(COALESCE(p_lng, v_poi.longitude))) +
            SIN(RADIANS(COALESCE(p_lat, v_poi.latitude))) * SIN(RADIANS(v_poi.latitude))
          ))))::numeric, 1) ELSE NULL END
      ),
      v_expires
    )
    ON CONFLICT (user_id, quest_date, difficulty) DO NOTHING;
  END LOOP;

  RETURN QUERY
    SELECT * FROM public.daily_quests
    WHERE user_id = v_uid AND quest_date = v_day AND status <> 'expired'
    ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.ensure_daily_quests(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;


-- =====================================================================
-- 10. BADGE AWARDER — internal
-- =====================================================================
-- Checks every active badge criterion against the user's current stats
-- and unlocks any newly-earned badges. Returns the list of badge ids
-- unlocked by this call.
CREATE OR REPLACE FUNCTION public.award_badges(p_uid UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_stats  public.user_quest_stats%ROWTYPE;
  v_badge  public.badges%ROWTYPE;
  v_new    TEXT[] := ARRAY[]::TEXT[];
  v_count  INTEGER;
  v_met    BOOLEAN;
BEGIN
  SELECT * INTO v_stats FROM public.user_quest_stats WHERE user_id = p_uid;
  IF v_stats.user_id IS NULL THEN RETURN v_new; END IF;

  FOR v_badge IN
    SELECT b.* FROM public.badges b
    WHERE b.is_active
      AND b.criteria_type <> 'manual'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_badges ub
        WHERE ub.user_id = p_uid AND ub.badge_id = b.id
      )
  LOOP
    v_met := FALSE;
    IF v_badge.criteria_type = 'total_completed' THEN
      v_met := v_stats.total_completed >= v_badge.criteria_value;
    ELSIF v_badge.criteria_type = 'streak' THEN
      v_met := v_stats.current_streak >= v_badge.criteria_value;
    ELSIF v_badge.criteria_type = 'coins_earned' THEN
      v_met := v_stats.coins >= v_badge.criteria_value;
    ELSIF v_badge.criteria_type = 'difficulty_completed' THEN
      v_count := COALESCE((v_stats.counters #>> ARRAY['difficulty', v_badge.criteria_key])::int, 0);
      v_met := v_count >= v_badge.criteria_value;
    ELSIF v_badge.criteria_type = 'category_completed' THEN
      v_count := COALESCE((v_stats.counters #>> ARRAY['category', v_badge.criteria_key])::int, 0);
      v_met := v_count >= v_badge.criteria_value;
    END IF;

    IF v_met THEN
      INSERT INTO public.user_badges (user_id, badge_id)
      VALUES (p_uid, v_badge.id)
      ON CONFLICT DO NOTHING;
      v_new := array_append(v_new, v_badge.id);
    END IF;
  END LOOP;

  RETURN v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================================
-- 11. PROGRESS UPDATE — update_quest_progress()
-- =====================================================================
-- Sets absolute progress on an active quest (clamped to [0, target]).
-- Does NOT auto-grant rewards — call complete_quest() to claim.
CREATE OR REPLACE FUNCTION public.update_quest_progress(
  p_quest_id UUID,
  p_progress NUMERIC
)
RETURNS public.daily_quests AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_q   public.daily_quests%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM public.daily_quests
  WHERE id = p_quest_id AND user_id = v_uid
  FOR UPDATE;

  IF v_q.id IS NULL THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF v_q.status <> 'active' THEN RETURN v_q; END IF;

  UPDATE public.daily_quests
  SET progress = LEAST(GREATEST(p_progress, 0), target)
  WHERE id = p_quest_id
  RETURNING * INTO v_q;

  RETURN v_q;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_quest_progress(UUID, NUMERIC) TO authenticated;


-- =====================================================================
-- 12. COMPLETE / CLAIM — complete_quest()
-- =====================================================================
-- Atomically marks an active quest complete, grants coins, updates the
-- streak + counters, and unlocks any earned badges. Idempotent: a quest
-- that is already completed returns awarded=false and grants nothing.
--
-- XP is returned (xp_reward) so the client can apply it through the
-- existing user_xp / useXPStore pipeline, keeping a single source of
-- truth for levelling. Coins are granted here.
CREATE OR REPLACE FUNCTION public.complete_quest(p_quest_id UUID)
RETURNS TABLE (
  awarded     BOOLEAN,
  xp_reward   INTEGER,
  coin_reward INTEGER,
  new_badges  TEXT[]
) AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_q      public.daily_quests%ROWTYPE;
  v_day    DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::date;
  v_stats  public.user_quest_stats%ROWTYPE;
  v_streak INTEGER;
  v_new    TEXT[];
BEGIN
  SELECT * INTO v_q FROM public.daily_quests
  WHERE id = p_quest_id AND user_id = v_uid
  FOR UPDATE;

  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'Quest not found';
  END IF;

  -- Already claimed or expired => no-op (idempotent)
  IF v_q.status <> 'active' THEN
    RETURN QUERY SELECT FALSE, 0, 0, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- Mark complete
  UPDATE public.daily_quests
  SET status = 'completed', progress = target, completed_at = NOW()
  WHERE id = p_quest_id;

  -- Ensure stats row, then load it
  INSERT INTO public.user_quest_stats (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_stats FROM public.user_quest_stats WHERE user_id = v_uid;

  -- Streak: consecutive days with >=1 completion
  IF v_stats.last_completed_date = v_day THEN
    v_streak := v_stats.current_streak;                 -- already counted today
  ELSIF v_stats.last_completed_date = v_day - 1 THEN
    v_streak := v_stats.current_streak + 1;             -- continued
  ELSE
    v_streak := 1;                                      -- reset / first
  END IF;

  UPDATE public.user_quest_stats
  SET coins               = coins + v_q.coin_reward,
      total_completed     = total_completed + 1,
      total_xp_from_quests = total_xp_from_quests + v_q.xp_reward,
      current_streak      = v_streak,
      longest_streak      = GREATEST(longest_streak, v_streak),
      last_completed_date = v_day,
      counters = jsonb_set(
        jsonb_set(
          counters,
          ARRAY['difficulty', v_q.difficulty],
          to_jsonb(COALESCE((counters #>> ARRAY['difficulty', v_q.difficulty])::int, 0) + 1),
          true
        ),
        ARRAY['category', v_q.category],
        to_jsonb(COALESCE((counters #>> ARRAY['category', v_q.category])::int, 0) + 1),
        true
      ),
      updated_at = NOW()
  WHERE user_id = v_uid;

  -- Guaranteed template badge (if any)
  IF v_q.badge_id IS NOT NULL THEN
    INSERT INTO public.user_badges (user_id, badge_id)
    VALUES (v_uid, v_q.badge_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Milestone badges
  v_new := public.award_badges(v_uid);
  IF v_q.badge_id IS NOT NULL AND NOT (v_q.badge_id = ANY(v_new)) THEN
    -- include template badge if it was newly unlocked this call
    IF EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE user_id = v_uid AND badge_id = v_q.badge_id
        AND unlocked_at > NOW() - INTERVAL '5 seconds'
    ) THEN
      v_new := array_append(v_new, v_q.badge_id);
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_q.xp_reward, v_q.coin_reward, v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_quest(UUID) TO authenticated;


-- =====================================================================
-- 13. SCHEDULED REFRESH (optional but recommended)
-- =====================================================================
-- Flips yesterday's active quests to 'expired' so every user gets a fresh
-- set on their next app open. Generation stays lazy (it needs the user's
-- live location), so this job only handles expiry + cleanup.
CREATE OR REPLACE FUNCTION public.expire_stale_quests()
RETURNS void AS $$
BEGIN
  UPDATE public.daily_quests
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= NOW();

  -- Housekeeping: drop quest rows older than 30 days
  DELETE FROM public.daily_quests
  WHERE quest_date < (NOW() AT TIME ZONE 'Asia/Jakarta')::date - 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule with pg_cron if the extension is available. Asia/Jakarta
-- midnight = 17:00 UTC, so run just after the daily boundary.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'driveverse-expire-quests') THEN
      PERFORM cron.unschedule('driveverse-expire-quests');
    END IF;
    PERFORM cron.schedule(
      'driveverse-expire-quests',
      '5 17 * * *',
      $cron$ SELECT public.expire_stale_quests(); $cron$
    );
  END IF;
END $$;


-- =====================================================================
-- 14. ENABLE REALTIME
-- =====================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_quests;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_quest_stats;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- =====================================================================
-- 15. SEED — BADGES
-- =====================================================================
INSERT INTO public.badges (id, name, description, icon, accent_color, criteria_type, criteria_value, criteria_key, sort_order) VALUES
  ('first_quest',    'First Gear',       'Complete your first daily quest.',                 'Award',   '#00D4AA', 'total_completed',      1,   NULL,       1),
  ('quest_10',       'Getting Rolling',  'Complete 10 quests.',                              'Medal',   '#3B82F6', 'total_completed',      10,  NULL,       2),
  ('quest_50',       'Road Regular',     'Complete 50 quests.',                              'Medal',   '#8B5CF6', 'total_completed',      50,  NULL,       3),
  ('quest_100',      'Century Driver',   'Complete 100 quests.',                             'Trophy',  '#FFD700', 'total_completed',      100, NULL,       4),
  ('streak_3',       'On a Roll',        'Keep a 3-day quest streak.',                       'Flame',   '#FF6B35', 'streak',               3,   NULL,       5),
  ('streak_7',       'Week Warrior',     'Keep a 7-day quest streak.',                       'Flame',   '#FF3B6F', 'streak',               7,   NULL,       6),
  ('streak_30',      'Unstoppable',      'Keep a 30-day quest streak.',                      'Zap',     '#FBBF24', 'streak',               30,  NULL,       7),
  ('hard_10',        'Hard Charger',     'Complete 10 Hard quests.',                         'Swords',  '#EF4444', 'difficulty_completed', 10,  'hard',     8),
  ('scenic_10',      'Sightseer',        'Complete 10 scenic quests.',                       'Mountain','#00D4AA', 'category_completed',   10,  'scenic',   9),
  ('explorer_10',    'Trailblazer',      'Complete 10 exploration quests.',                  'Compass', '#3B82F6', 'category_completed',   10,  'exploration', 10),
  ('coins_1000',     'Coin Collector',   'Earn 1,000 coins from quests.',                    'Coins',   '#FFD700', 'coins_earned',         1000, NULL,      11),
  ('coins_10000',    'Treasure Hunter',  'Earn 10,000 coins from quests.',                   'Gem',     '#A855F7', 'coins_earned',         10000, NULL,     12)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color, criteria_type = EXCLUDED.criteria_type,
  criteria_value = EXCLUDED.criteria_value, criteria_key = EXCLUDED.criteria_key,
  sort_order = EXCLUDED.sort_order;


-- =====================================================================
-- 16. SEED — POINTS OF INTEREST (Jakarta / Bandung / Bogor sample set)
-- =====================================================================
INSERT INTO public.points_of_interest (id, name, category, latitude, longitude, city, description, min_level, weight) VALUES
  -- Landmarks
  ('monas',            'National Monument (Monas)',   'landmark',   -6.175392, 106.827153, 'Jakarta', 'Iconic Jakarta landmark.',            1, 1.4),
  ('kota_tua',         'Kota Tua Old Town',           'landmark',   -6.135200, 106.813301, 'Jakarta', 'Historic old town square.',           1, 1.2),
  ('istiqlal',         'Istiqlal Mosque',             'landmark',   -6.170238, 106.831314, 'Jakarta', 'Southeast Asia''s largest mosque.',   1, 1.0),
  ('bundaran_hi',      'Bundaran HI',                 'landmark',   -6.194913, 106.823006, 'Jakarta', 'Central roundabout landmark.',        1, 1.1),
  ('gedung_sate',      'Gedung Sate',                 'landmark',   -6.902481, 107.618782, 'Bandung', 'Bandung''s colonial landmark.',       1, 1.0),
  -- Cafés
  ('kemang_cafe',      'Kemang Coffee House',         'cafe',       -6.263700, 106.813900, 'Jakarta', 'Trendy café hangout.',                1, 1.3),
  ('scbd_roastery',    'SCBD Roastery',               'cafe',       -6.226900, 106.808600, 'Jakarta', 'Specialty coffee in the CBD.',        1, 1.2),
  ('senopati_brew',    'Senopati Brew Bar',           'cafe',       -6.234500, 106.812000, 'Jakarta', 'Cosy brew bar.',                      1, 1.1),
  ('dago_coffee',      'Dago Highland Coffee',        'cafe',       -6.858000, 107.613000, 'Bandung', 'Highland café with a view.',          1, 1.2),
  ('bogor_kopi',       'Bogor Rain Coffee',           'cafe',       -6.595038, 106.816635, 'Bogor',   'Rainy-city coffee spot.',             1, 1.0),
  -- Viewpoints
  ('puncak_pass',      'Puncak Pass Viewpoint',       'viewpoint',  -6.702000, 106.985000, 'Bogor',   'Mountain-pass panorama.',             3, 1.4),
  ('dago_pakar',       'Dago Pakar Overlook',         'viewpoint',  -6.833000, 107.640000, 'Bandung', 'City lights overlook.',               3, 1.3),
  ('ancol_pier',       'Ancol Bayfront',              'viewpoint',  -6.125000, 106.833000, 'Jakarta', 'Seafront sunset viewpoint.',          1, 1.1),
  ('tebing_keraton',   'Tebing Keraton Cliff',        'viewpoint',  -6.835500, 107.663900, 'Bandung', 'Dawn cliff viewpoint.',               8, 1.5),
  -- Scenic routes
  ('puncak_route',     'Puncak Mountain Route',       'route',      -6.700000, 106.980000, 'Bogor',   'Winding mountain drive.',             3, 1.4),
  ('lembang_loop',     'Lembang Highland Loop',       'route',      -6.811900, 107.617700, 'Bandung', 'Highland loop drive.',                5, 1.3),
  ('coastal_pik',      'PIK Coastal Boulevard',       'route',      -6.108000, 106.740000, 'Jakarta', 'Breezy coastal cruise.',              1, 1.1),
  ('sudirman_night',   'Sudirman Night Sprint',       'route',      -6.214600, 106.819000, 'Jakarta', 'City avenue night drive.',            1, 1.2),
  -- Workshops
  ('garasi_id',        'Garasi.id Workshop',          'workshop',   -6.245000, 106.800000, 'Jakarta', 'Trusted tuning workshop.',            1, 1.0),
  ('bandung_garage',   'Bandung Motorsport Garage',   'workshop',   -6.914700, 107.609800, 'Bandung', 'Performance garage.',                 1, 0.9),
  -- Fuel / EV
  ('spbu_gatot',       'Gatot Subroto Fuel Stop',     'fuel',       -6.235000, 106.830000, 'Jakarta', 'Central fuel station.',               1, 0.8),
  ('ev_scbd',          'SCBD EV Charging Hub',        'ev_station', -6.225000, 106.809000, 'Jakarta', 'Fast EV charging.',                   1, 1.0),
  ('ev_bandung',       'Bandung EV Point',            'ev_station', -6.903000, 107.620000, 'Bandung', 'City EV charging.',                   1, 0.9)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category,
  latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
  city = EXCLUDED.city, description = EXCLUDED.description,
  min_level = EXCLUDED.min_level, weight = EXCLUDED.weight;


-- =====================================================================
-- 17. SEED — QUEST TEMPLATES
-- =====================================================================
-- Templates × POIs × parameter ranges × time windows → millions of combos.
INSERT INTO public.quest_templates (
  id, difficulty, category, objective_type, title_template, description_template,
  icon, accent_color, poi_category, param_min, param_max, param_step, unit,
  min_level, max_level, time_windows, weather, required_event,
  reward_multiplier, badge_id, weight
) VALUES
  -- ── EASY ────────────────────────────────────────────────────────
  ('easy_warmup_drive', 'easy', 'driving', 'drive_distance',
    'Warm-Up Lap', 'Drive {target} {unit} today to get rolling.',
    'Car', '#00D4AA', NULL, 5, 15, 1, 'km',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.4),
  ('easy_cafe_stop', 'easy', 'exploration', 'visit_poi',
    'Coffee Run', 'Stop by {poi} for a quick break.',
    'Coffee', '#8B5CF6', 'cafe', 1, NULL, 1, 'visit',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.3),
  ('easy_landmark_visit', 'easy', 'exploration', 'visit_poi',
    'Local Sightseer', 'Visit {poi} and check it off your map.',
    'MapPin', '#3B82F6', 'landmark', 1, NULL, 1, 'visit',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.2),
  ('easy_morning_drive', 'easy', 'driving', 'drive_distance',
    'Early Bird', 'Log {target} {unit} during the {window}.',
    'Sunrise', '#FBBF24', NULL, 3, 10, 1, 'km',
    1, NULL, ARRAY['morning'], NULL, NULL, 1.1, NULL, 1.0),
  ('easy_photo_spot', 'easy', 'photo', 'photo_capture',
    'Snap It', 'Take {target} {unit} at {poi}.',
    'Camera', '#FF3B6F', 'any', 1, 2, 1, 'photos',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.0),
  ('easy_fuel_top', 'easy', 'driving', 'visit_poi',
    'Pit Stop', 'Top up at {poi}.',
    'Fuel', '#F59E0B', 'fuel', 1, NULL, 1, 'visit',
    1, NULL, NULL, NULL, NULL, 0.9, NULL, 0.7),

  -- ── MEDIUM ──────────────────────────────────────────────────────
  ('med_explore_cafes', 'medium', 'exploration', 'explore_category',
    'Café Crawl', 'Visit {target} different cafés around town.',
    'Coffee', '#8B5CF6', 'cafe', 2, 4, 1, 'places',
    3, NULL, NULL, NULL, NULL, 1.1, NULL, 1.3),
  ('med_scenic_visit', 'medium', 'scenic', 'visit_poi',
    'Scenic Detour', 'Reach {poi} and soak in the view.',
    'Mountain', '#00D4AA', 'viewpoint', 1, NULL, 1, 'visit',
    3, NULL, NULL, NULL, NULL, 1.2, NULL, 1.4),
  ('med_distance_grind', 'medium', 'driving', 'drive_distance',
    'Distance Grinder', 'Cover {target} {unit} on the road today.',
    'Route', '#FF6B35', NULL, 25, 60, 5, 'km',
    3, NULL, NULL, NULL, NULL, 1.1, NULL, 1.3),
  ('med_route_run', 'medium', 'driving', 'complete_route',
    'Route Runner', 'Complete a drive along {poi}.',
    'Route', '#00D4AA', 'route', 1, NULL, 1, 'route',
    5, NULL, NULL, NULL, NULL, 1.2, NULL, 1.2),
  ('med_evening_cruise', 'medium', 'driving', 'drive_distance',
    'Evening Cruiser', 'Cruise {target} {unit} during the {window}.',
    'Moon', '#3B82F6', NULL, 15, 35, 5, 'km',
    3, NULL, ARRAY['evening','night'], NULL, NULL, 1.15, NULL, 1.1),
  ('med_ev_charge', 'medium', 'exploration', 'visit_poi',
    'Charged Up', 'Visit {poi} to charge or check out the EV hub.',
    'Zap', '#22C55E', 'ev_station', 1, NULL, 1, 'visit',
    4, NULL, NULL, NULL, NULL, 1.1, NULL, 0.9),
  ('med_photo_tour', 'medium', 'photo', 'photo_capture',
    'Photo Tour', 'Capture {target} {unit} at scenic spots.',
    'Camera', '#FF3B6F', 'viewpoint', 2, 3, 1, 'photos',
    5, NULL, NULL, 'clear', NULL, 1.2, NULL, 1.0),

  -- ── HARD ────────────────────────────────────────────────────────
  ('hard_night_cruiser', 'hard', 'driving', 'night_drive',
    'Night Cruiser', 'Drive {target} {unit} during the {window}.',
    'Flame', '#FF6B35', NULL, 40, 90, 10, 'km',
    8, NULL, ARRAY['evening','night'], NULL, NULL, 1.3, NULL, 1.3),
  ('hard_scenic_expedition', 'hard', 'scenic', 'explore_category',
    'Scenic Expedition', 'Reach {target} different viewpoints.',
    'Mountain', '#00D4AA', 'viewpoint', 2, 4, 1, 'viewpoints',
    10, NULL, NULL, NULL, NULL, 1.35, 'scenic_10', 1.3),
  ('hard_grand_tour', 'hard', 'driving', 'drive_distance',
    'Grand Tour', 'Cover {target} {unit} across the day.',
    'Route', '#FF3B6F', NULL, 80, 150, 10, 'km',
    10, NULL, NULL, NULL, NULL, 1.4, NULL, 1.2),
  ('hard_landmark_sweep', 'hard', 'exploration', 'explore_category',
    'Landmark Sweep', 'Visit {target} landmarks in one day.',
    'Compass', '#3B82F6', 'landmark', 3, 5, 1, 'landmarks',
    12, NULL, NULL, NULL, NULL, 1.4, 'explorer_10', 1.2),
  ('hard_summit_dawn', 'hard', 'scenic', 'visit_poi',
    'Dawn Summit', 'Reach {poi} for the sunrise.',
    'Sunrise', '#FBBF24', 'viewpoint', 1, NULL, 1, 'visit',
    8, NULL, ARRAY['morning'], 'clear', NULL, 1.35, NULL, 1.1),
  ('hard_route_master', 'hard', 'driving', 'complete_route',
    'Route Master', 'Complete the full {poi} without stopping short.',
    'Swords', '#EF4444', 'route', 1, NULL, 1, 'route',
    15, NULL, NULL, NULL, NULL, 1.45, 'hard_10', 1.1),

  -- ── SEASONAL / EVENT (opt-in via required_event) ─────────────────
  ('event_rally_night', 'hard', 'social', 'social_event',
    'Rally Night', 'Join the {poi} rally meetup and clock {target} {unit}.',
    'Users', '#FF3B6F', 'route', 20, 40, 5, 'km',
    5, NULL, ARRAY['evening','night'], NULL, 'night_rally', 1.6, NULL, 2.0),
  ('event_indie_day', 'medium', 'social', 'social_event',
    'Independence Cruise', 'Celebrate with a {target} {unit} community cruise.',
    'Flag', '#EF4444', NULL, 17, 45, 8, 'km',
    1, NULL, NULL, NULL, 'independence_day', 1.7, NULL, 2.0)
ON CONFLICT (id) DO UPDATE SET
  difficulty = EXCLUDED.difficulty, category = EXCLUDED.category,
  objective_type = EXCLUDED.objective_type, title_template = EXCLUDED.title_template,
  description_template = EXCLUDED.description_template, icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color, poi_category = EXCLUDED.poi_category,
  param_min = EXCLUDED.param_min, param_max = EXCLUDED.param_max,
  param_step = EXCLUDED.param_step, unit = EXCLUDED.unit,
  min_level = EXCLUDED.min_level, max_level = EXCLUDED.max_level,
  time_windows = EXCLUDED.time_windows, weather = EXCLUDED.weather,
  required_event = EXCLUDED.required_event, reward_multiplier = EXCLUDED.reward_multiplier,
  badge_id = EXCLUDED.badge_id, weight = EXCLUDED.weight;

-- Done. See DAILY_QUEST_SYSTEM.md for architecture and client usage.
