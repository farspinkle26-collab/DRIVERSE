-- Driveverse — Daily Quest System (procedural, rule-based, no AI)
-- =====================================================================
-- A modular quest engine that generates 3 personalised daily quests per
-- user (1 Easy, 1 Medium, 1 Hard) from a catalogue of templates. Quests
-- are **global / universal** — they describe generic, worldwide goals
-- ("drive 10 km", "drive 500 m", "reach 80 km/h", "make a new friend",
-- "meet a driver through a convoy") rather than referencing any specific
-- country or named location — so the system works for every user anywhere
-- on the planet. There are deliberately no place-based quests ("visit a
-- café", etc.) — that needs a places API this app doesn't have a reliable
-- one for yet.
--
-- Quests are **auto-completed**. A quest can never be marked done by the
-- user. It finishes only when its real-world indicator/calculation reaches
-- the target: distance actually driven (from saved routes/trips), a top
-- speed actually reached, friends actually made, another driver actually
-- shared a convoy with them. Real signals flow in through database triggers
-- and the record_quest_event() RPC; rewards (XP, coins, streak, badges) are
-- granted automatically the moment the target is met.
--
-- Run this whole file in your Supabase SQL Editor. It is idempotent
-- (safe to re-run) — tables use IF NOT EXISTS, policies/functions are
-- dropped-and-recreated, and seed rows upsert on conflict.
--
-- Design overview
--   quest_templates      catalogue of parametric, universal quest blueprints
--   points_of_interest   OPTIONAL place catalogue (unused by the universal
--                        set; kept for future location-specific packs)
--   badges               catalogue of unlockable badges
--   daily_quests         generated quest instances (per user, per day)
--   user_quest_stats     coins, streak, counters, progression per user
--   user_badges          badges a user has unlocked
--
--   ensure_daily_quests()   lazy generator — call on app open
--   record_quest_event()    the ONLY progress path — an indicator fires,
--                           matching quests advance & auto-complete
--   award_badges()          internal — unlock badges on milestones
--
-- The "quest day" boundary is **UTC** so every user on Earth rolls over at
-- the same, unambiguous instant.
-- =====================================================================


-- =====================================================================
-- 1. QUEST TEMPLATES — the rule-based blueprint catalogue
-- =====================================================================
-- Each row is a parametric blueprint. The generator fills placeholders
-- ({target}, {unit}, {place}) and rolls a numeric target inside
-- [param_min, param_max] snapped to param_step. Templates are universal:
-- they name generic place *categories* ("a café", "a mall") instead of
-- specific real-world locations, so a single catalogue serves the world.
CREATE TABLE IF NOT EXISTS public.quest_templates (
  id TEXT PRIMARY KEY,                       -- stable slug, e.g. 'cafe_stop'
  difficulty TEXT NOT NULL
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT NOT NULL,                     -- driving | exploration | social | scenic | photo
  objective_type TEXT NOT NULL,              -- how progress is measured (see questEngine.ts)
  title_template TEXT NOT NULL,              -- may contain placeholders
  description_template TEXT NOT NULL,        -- may contain placeholders
  icon TEXT NOT NULL DEFAULT 'Flame',        -- lucide icon name for the UI
  accent_color TEXT NOT NULL DEFAULT '#FF6B35',

  -- Place requirement (generic category, not a specific location).
  -- NULL = no place needed. 'any' = a place of any category.
  -- e.g. cafe | restaurant | mall | park | viewpoint | landmark | fuel | ev_station | gym
  poi_category TEXT,
  -- Human phrase substituted for the {place} placeholder, e.g. 'a café'.
  place_label TEXT,

  -- Parametric target: rolled target = param_min + k*param_step
  param_min NUMERIC NOT NULL DEFAULT 1,
  param_max NUMERIC,                          -- NULL => fixed target = param_min
  param_step NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',             -- 'km', 'places', 'friends', 'photos', ...

  -- Eligibility rules
  min_level INTEGER NOT NULL DEFAULT 1,
  max_level INTEGER,                          -- NULL => no upper bound
  time_windows TEXT[],                        -- optional UTC time-of-day gate; NULL => any time
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

-- Backfill the place_label column for databases created before it existed.
ALTER TABLE public.quest_templates
  ADD COLUMN IF NOT EXISTS place_label TEXT;

CREATE INDEX IF NOT EXISTS idx_quest_templates_pick
  ON public.quest_templates(difficulty, is_active);


-- =====================================================================
-- 2. POINTS OF INTEREST — OPTIONAL location catalogue
-- =====================================================================
-- Not used by the universal quest set (which is location-agnostic). Kept
-- so future location-specific quest packs can attach real coordinates.
CREATE TABLE IF NOT EXISTS public.points_of_interest (
  id TEXT PRIMARY KEY,                        -- stable slug
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  description TEXT DEFAULT '',
  min_level INTEGER NOT NULL DEFAULT 1,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.points_of_interest
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';

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
  quest_date DATE NOT NULL,                   -- the "quest day" (UTC)
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
  -- Generic place category this quest matches (for indicator routing).
  objective_category TEXT,

  -- Progress tracking
  target NUMERIC NOT NULL DEFAULT 1,
  progress NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',

  -- Rewards (computed at generation, granted automatically on completion)
  xp_reward INTEGER NOT NULL DEFAULT 0,
  coin_reward INTEGER NOT NULL DEFAULT 0,
  badge_id TEXT REFERENCES public.badges(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','expired')),
  generation_context JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One quest per (user, day, difficulty)
  UNIQUE (user_id, quest_date, difficulty)
);

ALTER TABLE public.daily_quests
  ADD COLUMN IF NOT EXISTS objective_category TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_quests_user_day
  ON public.daily_quests(user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_recent_templates
  ON public.daily_quests(user_id, template_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quests_active_objective
  ON public.daily_quests(user_id, status, objective_type);


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

-- Daily quests: a user may only READ their own. There is deliberately NO
-- client UPDATE policy — progress cannot be self-marked; it is written
-- exclusively by the SECURITY DEFINER indicator functions below.
DROP POLICY IF EXISTS "View own quests" ON public.daily_quests;
CREATE POLICY "View own quests" ON public.daily_quests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own quests" ON public.daily_quests;  -- remove any legacy self-mark policy

-- Stats: owner read. (Writes go through functions.)
DROP POLICY IF EXISTS "View own stats" ON public.user_quest_stats;
CREATE POLICY "View own stats" ON public.user_quest_stats
  FOR SELECT USING (auth.uid() = user_id);

-- Badges a user unlocked: publicly viewable (for profiles).
DROP POLICY IF EXISTS "User badges are viewable" ON public.user_badges;
CREATE POLICY "User badges are viewable" ON public.user_badges
  FOR SELECT USING (true);


-- =====================================================================
-- 8. REWARD MODEL  (mirrored in expo/lib/questEngine.ts)
-- =====================================================================
-- Base XP sits in the 10k-20k band, not the hundreds — a driver clearing a
-- handful of quests should feel it move the level bar, not read as a
-- rounding error next to the 1.6×-per-level curve in useXPStore.ts
-- (L10 alone costs ~6.9k XP, L20 ~1.2M). Coins are unchanged; only XP
-- was asked to jump. Mirrored in DIFFICULTY_TIERS in questEngine.ts —
-- keep both in sync.
CREATE OR REPLACE FUNCTION public.quest_base_reward(p_difficulty TEXT)
RETURNS TABLE (base_xp INTEGER, base_coins INTEGER) AS $$
  SELECT CASE p_difficulty
           WHEN 'easy'   THEN 10000
           WHEN 'medium' THEN 15000
           WHEN 'hard'   THEN 20000
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
-- Lazily generates today's 3 universal quests for the calling user if
-- missing, then returns the active set. The quest set is location-agnostic,
-- so latitude/longitude are accepted only for backward compatibility and
-- are not required. Considers: player level, previously served templates
-- (anti-repetition), UTC time of day, optional weather and events.
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
  v_day            DATE := (v_now AT TIME ZONE 'UTC')::date;
  v_hour           INTEGER := EXTRACT(HOUR FROM (v_now AT TIME ZONE 'UTC'))::int;
  v_expires        TIMESTAMPTZ := ((v_day + 1)::timestamp AT TIME ZONE 'UTC');
  v_level          INTEGER := 1;
  v_time_bucket    TEXT;
  v_template_cd    INTEGER := 7;   -- days a template stays on cooldown per user
  v_diff           TEXT;
  v_tpl            public.quest_templates%ROWTYPE;
  v_target         NUMERIC;
  v_steps          NUMERIC;
  v_base_xp        INTEGER;
  v_base_coins     INTEGER;
  v_level_bonus    NUMERIC;
  v_xp             INTEGER;
  v_coins          INTEGER;
  v_title          TEXT;
  v_desc           TEXT;
  v_place          TEXT;
  v_existing       INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Time-of-day bucket (UTC)
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

  -- Expire any of this user's stale quests.
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

    -- Weighted-random over eligible, non-cooldown templates, falling back
    -- to the full eligible pool if cooldown empties it.
    WITH recent AS (
      SELECT DISTINCT template_id FROM public.daily_quests
      WHERE user_id = v_uid AND template_id IS NOT NULL
        AND quest_date > v_day - v_template_cd
    ),
    eligible AS (
      SELECT t.* FROM public.quest_templates t
      WHERE t.is_active
        AND t.difficulty = v_diff
        -- Belt-and-braces against place-category quests, independent of what
        -- any stray legacy row happens to be named or id'd: this app has no
        -- reliable places API to verify a visit against, so nothing with a
        -- poi_category or an objective_type outside the allowed set is ever
        -- eligible, no matter what is sitting in the table. See the SEED
        -- section below for why a row like this could exist in the first
        -- place — this filter is what makes it harmless either way.
        AND t.poi_category IS NULL
        AND t.objective_type IN ('drive_distance', 'night_drive', 'reach_speed', 'make_friend', 'attend_meetup')
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

    IF v_tpl.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Roll the numeric target inside the template's range.
    IF v_tpl.param_max IS NULL OR v_tpl.param_max <= v_tpl.param_min THEN
      v_target := v_tpl.param_min;
    ELSE
      v_steps := FLOOR((v_tpl.param_max - v_tpl.param_min) / v_tpl.param_step);
      v_target := v_tpl.param_min + FLOOR(RANDOM() * (v_steps + 1)) * v_tpl.param_step;
    END IF;

    -- Generic place phrase for the {place} placeholder.
    v_place := COALESCE(
      v_tpl.place_label,
      CASE WHEN v_tpl.poi_category IS NULL OR v_tpl.poi_category = 'any'
           THEN 'a new place' ELSE 'a ' || v_tpl.poi_category END
    );

    -- Substitute placeholders.
    v_title := v_tpl.title_template;
    v_desc  := v_tpl.description_template;
    v_title := REPLACE(v_title, '{target}', TRIM(TO_CHAR(v_target, 'FM999999990.###')));
    v_desc  := REPLACE(v_desc,  '{target}', TRIM(TO_CHAR(v_target, 'FM999999990.###')));
    v_title := REPLACE(v_title, '{unit}', v_tpl.unit);
    v_desc  := REPLACE(v_desc,  '{unit}', v_tpl.unit);
    v_title := REPLACE(v_title, '{window}', v_time_bucket);
    v_desc  := REPLACE(v_desc,  '{window}', v_time_bucket);
    v_title := REPLACE(v_title, '{place}', v_place);
    v_desc  := REPLACE(v_desc,  '{place}', v_place);

    -- Compute rewards.
    SELECT base_xp, base_coins INTO v_base_xp, v_base_coins
    FROM public.quest_base_reward(v_diff);
    v_level_bonus := 1 + LEAST(v_level, 100) * 0.01;
    v_xp    := ROUND(v_base_xp   * v_tpl.reward_multiplier * v_level_bonus);
    v_coins := ROUND(v_base_coins * v_tpl.reward_multiplier * v_level_bonus);

    -- Insert the generated quest.
    INSERT INTO public.daily_quests (
      user_id, quest_date, difficulty, template_id, poi_id,
      title, description, icon, accent_color, category, objective_type,
      objective_category, target, progress, unit, xp_reward, coin_reward,
      badge_id, status, generation_context, expires_at
    ) VALUES (
      v_uid, v_day, v_diff, v_tpl.id, NULL,
      v_title, v_desc, v_tpl.icon, v_tpl.accent_color, v_tpl.category, v_tpl.objective_type,
      v_tpl.poi_category, v_target, 0, v_tpl.unit, v_xp, v_coins,
      v_tpl.badge_id, 'active',
      jsonb_build_object(
        'level', v_level, 'time_bucket', v_time_bucket,
        'weather', p_weather, 'event', p_event
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
-- 11. XP GRANT — internal (server-authoritative levelling)
-- =====================================================================
-- Because quests auto-complete from indicators (possibly while no screen
-- is open), XP is granted server-side into user_xp using the SAME curve as
-- expo/hooks/useXPStore.ts:  xpForLevel(L) = round(100 * 1.6^(L-1)).
-- The client XP store simply reflects user_xp (via realtime), so levelling
-- keeps a single source of truth.
CREATE OR REPLACE FUNCTION public._apply_quest_xp(p_uid UUID, p_xp INTEGER)
RETURNS void AS $$
DECLARE
  v_level    INTEGER;
  v_xp       INTEGER;
  v_total    INTEGER;
  v_need     INTEGER;
BEGIN
  IF p_xp IS NULL OR p_xp <= 0 THEN RETURN; END IF;

  INSERT INTO public.user_xp (user_id, level, xp, total_xp, xp_required_for_level)
  VALUES (p_uid, 1, 0, 0, 100)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT level, xp, total_xp INTO v_level, v_xp, v_total
  FROM public.user_xp WHERE user_id = p_uid FOR UPDATE;

  v_level := COALESCE(v_level, 1);
  v_xp    := COALESCE(v_xp, 0) + p_xp;
  v_total := COALESCE(v_total, 0) + p_xp;

  LOOP
    v_need := ROUND(100 * POWER(1.6, v_level - 1));
    EXIT WHEN v_xp < v_need;
    v_xp := v_xp - v_need;
    v_level := v_level + 1;
  END LOOP;

  UPDATE public.user_xp
  SET level = v_level,
      xp = v_xp,
      total_xp = v_total,
      xp_required_for_level = ROUND(100 * POWER(1.6, v_level - 1)),
      updated_at = NOW()
  WHERE user_id = p_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================================
-- 12. AUTO-COMPLETE — internal
-- =====================================================================
-- Marks a single active quest complete and grants ALL rewards atomically:
-- coins, streak, counters, badges AND XP. Idempotent. Returns the badge
-- ids newly unlocked by this call. Never callable by clients directly —
-- completion is only ever reached by an indicator meeting the target.
CREATE OR REPLACE FUNCTION public._finish_quest(p_quest_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_q      public.daily_quests%ROWTYPE;
  v_day    DATE := (NOW() AT TIME ZONE 'UTC')::date;
  v_stats  public.user_quest_stats%ROWTYPE;
  v_streak INTEGER;
  v_new    TEXT[];
BEGIN
  SELECT * INTO v_q FROM public.daily_quests
  WHERE id = p_quest_id FOR UPDATE;

  IF v_q.id IS NULL OR v_q.status <> 'active' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  UPDATE public.daily_quests
  SET status = 'completed', progress = target, completed_at = NOW()
  WHERE id = p_quest_id;

  INSERT INTO public.user_quest_stats (user_id)
  VALUES (v_q.user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_stats FROM public.user_quest_stats WHERE user_id = v_q.user_id;

  -- Streak: consecutive days with >=1 completion
  IF v_stats.last_completed_date = v_day THEN
    v_streak := v_stats.current_streak;
  ELSIF v_stats.last_completed_date = v_day - 1 THEN
    v_streak := v_stats.current_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  UPDATE public.user_quest_stats
  SET coins                = coins + v_q.coin_reward,
      total_completed      = total_completed + 1,
      total_xp_from_quests = total_xp_from_quests + v_q.xp_reward,
      current_streak       = v_streak,
      longest_streak       = GREATEST(longest_streak, v_streak),
      last_completed_date  = v_day,
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
  WHERE user_id = v_q.user_id;

  -- Grant XP server-side (single source of truth).
  PERFORM public._apply_quest_xp(v_q.user_id, v_q.xp_reward);

  -- Guaranteed template badge (if any)
  IF v_q.badge_id IS NOT NULL THEN
    INSERT INTO public.user_badges (user_id, badge_id)
    VALUES (v_q.user_id, v_q.badge_id) ON CONFLICT DO NOTHING;
  END IF;

  -- Milestone badges
  v_new := public.award_badges(v_q.user_id);
  IF v_q.badge_id IS NOT NULL AND NOT (v_q.badge_id = ANY(v_new)) THEN
    IF EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE user_id = v_q.user_id AND badge_id = v_q.badge_id
        AND unlocked_at > NOW() - INTERVAL '5 seconds'
    ) THEN
      v_new := array_append(v_new, v_q.badge_id);
    END IF;
  END IF;

  RETURN v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================================
-- 13. INDICATOR INTAKE — record_quest_event()
-- =====================================================================
-- The ONE and ONLY way quest progress advances. A real-world indicator
-- fires (distance driven, a top speed reached, a friend made, a convoy
-- joined) and every matching active quest advances. Any quest that reaches
-- its target auto-completes and its rewards are granted immediately.
--
-- Event → objective routing:
--   'drive_distance'  → objective_type in (drive_distance, night_drive)   [amount = km driven;
--                        converted to metres and added when the quest's unit is 'm']
--   'reach_speed'     → objective_type = reach_speed                      [amount = km/h reached;
--                        progress tracks the BEST speed seen, not a sum]
--   'make_friend'     → objective_type = make_friend                       [amount = friends]
--   'attend_meetup'   → objective_type = attend_meetup                     [amount = drivers met;
--                        fires per driver, per convoy — see §14b]
--   'photo_capture'   → objective_type = photo_capture                     [amount = photos]
--
-- Returns one row per quest touched: whether it just completed and what it
-- granted, so the client can surface a celebration. (XP is already applied
-- server-side; the fields are informational.)
CREATE OR REPLACE FUNCTION public._record_quest_event_for(
  p_uid        UUID,
  p_event_type TEXT,
  p_amount     NUMERIC DEFAULT 1,
  p_category   TEXT DEFAULT NULL
)
RETURNS TABLE (
  quest_id    UUID,
  title       TEXT,
  completed   BOOLEAN,
  xp_reward   INTEGER,
  coin_reward INTEGER,
  new_badges  TEXT[]
) AS $$
DECLARE
  v_q        public.daily_quests%ROWTYPE;
  v_amt      NUMERIC;
  v_newprog  NUMERIC;
  v_finished BOOLEAN;
  v_badges   TEXT[];
BEGIN
  IF p_uid IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  FOR v_q IN
    SELECT * FROM public.daily_quests
    WHERE user_id = p_uid
      AND status = 'active'
      AND (
        (p_event_type = 'drive_distance' AND objective_type IN ('drive_distance','night_drive'))
        OR (p_event_type = 'reach_speed'   AND objective_type = 'reach_speed')
        OR (p_event_type = 'make_friend'   AND objective_type = 'make_friend')
        OR (p_event_type = 'attend_meetup' AND objective_type = 'attend_meetup')
        OR (p_event_type = 'photo_capture' AND objective_type = 'photo_capture')
      )
    FOR UPDATE
  LOOP
    IF v_q.objective_type = 'reach_speed' THEN
      -- Speed quests track the best (max) speed seen, not a running sum.
      v_newprog := LEAST(GREATEST(v_q.progress, p_amount), v_q.target);
    ELSE
      -- Distance quests may be set in km or m; the trigger always reports
      -- km, so convert to metres when the quest's own unit is metres.
      v_amt := CASE WHEN v_q.unit = 'm' THEN p_amount * 1000 ELSE p_amount END;
      v_newprog := LEAST(v_q.progress + v_amt, v_q.target);
    END IF;

    IF v_newprog >= v_q.target THEN
      v_badges := public._finish_quest(v_q.id);
      v_finished := TRUE;
    ELSE
      UPDATE public.daily_quests SET progress = v_newprog WHERE id = v_q.id;
      v_badges := ARRAY[]::TEXT[];
      v_finished := FALSE;
    END IF;

    quest_id    := v_q.id;
    title       := v_q.title;
    completed   := v_finished;
    xp_reward   := CASE WHEN v_finished THEN v_q.xp_reward ELSE 0 END;
    coin_reward := CASE WHEN v_finished THEN v_q.coin_reward ELSE 0 END;
    new_badges  := v_badges;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public RPC: routes the calling user's indicator into the engine.
CREATE OR REPLACE FUNCTION public.record_quest_event(
  p_event_type TEXT,
  p_amount     NUMERIC DEFAULT 1,
  p_category   TEXT DEFAULT NULL
)
RETURNS TABLE (
  quest_id    UUID,
  title       TEXT,
  completed   BOOLEAN,
  xp_reward   INTEGER,
  coin_reward INTEGER,
  new_badges  TEXT[]
) AS $$
  SELECT * FROM public._record_quest_event_for(auth.uid(), p_event_type, p_amount, p_category);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_quest_event(TEXT, NUMERIC, TEXT) TO authenticated;


-- =====================================================================
-- 14. REAL-WORLD INDICATOR TRIGGERS
-- =====================================================================
-- These wire the app's genuine calculations directly to quest progress,
-- so quests finish on their own — no button, no self-marking.

-- Distance actually driven → drive_distance quests. Top speed reached →
-- reach_speed quests.
CREATE OR REPLACE FUNCTION public.quest_on_saved_route()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.distance_km IS NOT NULL AND NEW.distance_km > 0 THEN
    PERFORM public._record_quest_event_for(NEW.user_id, 'drive_distance', NEW.distance_km::NUMERIC, NULL);
  END IF;
  IF NEW.top_speed_kmh IS NOT NULL AND NEW.top_speed_kmh > 0 THEN
    PERFORM public._record_quest_event_for(NEW.user_id, 'reach_speed', NEW.top_speed_kmh::NUMERIC, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_quest_saved_route ON public.saved_routes;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'saved_routes') THEN
    CREATE TRIGGER trg_quest_saved_route
      AFTER INSERT ON public.saved_routes
      FOR EACH ROW EXECUTE FUNCTION public.quest_on_saved_route();
  END IF;
END $$;

-- Distance from completed trips → drive_distance quests. Top speed reached
-- → reach_speed quests.
CREATE OR REPLACE FUNCTION public.quest_on_trip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.distance_km IS NOT NULL AND NEW.distance_km > 0 THEN
    PERFORM public._record_quest_event_for(NEW.user_id, 'drive_distance', NEW.distance_km::NUMERIC, NULL);
  END IF;
  IF NEW.top_speed_kmh IS NOT NULL AND NEW.top_speed_kmh > 0 THEN
    PERFORM public._record_quest_event_for(NEW.user_id, 'reach_speed', NEW.top_speed_kmh::NUMERIC, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_quest_trip ON public.trips;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'trips') THEN
    CREATE TRIGGER trg_quest_trip
      AFTER INSERT ON public.trips
      FOR EACH ROW EXECUTE FUNCTION public.quest_on_trip();
  END IF;
END $$;

-- Friendship accepted → make_friend quests (both people gain a friend).
CREATE OR REPLACE FUNCTION public.quest_on_friend_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    PERFORM public._record_quest_event_for(NEW.user_id,   'make_friend', 1, NULL);
    PERFORM public._record_quest_event_for(NEW.friend_id, 'make_friend', 1, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_quest_friend ON public.friends;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'friends') THEN
    CREATE TRIGGER trg_quest_friend
      AFTER INSERT OR UPDATE ON public.friends
      FOR EACH ROW EXECUTE FUNCTION public.quest_on_friend_accepted();
  END IF;
END $$;

-- =====================================================================
-- 14b. CONVOY MEETUP → attend_meetup quests
-- =====================================================================
-- 'attend_meetup' rides the same real-world-indicator model as
-- 'make_friend': a driver actually being in a convoy with someone else
-- (`party_members`, database_migration_parties.sql /
-- database_migration_convoy_shared_nav.sql), not a GPS proximity check —
-- this app has no reliable places/proximity API, the same reason there are
-- no location-based quests at all (see §9, §19, §20). "Met" means shared a
-- convoy roster, nothing about where.
--
-- A party's leader is seated by `handle_new_party()` with an INSERT straight
-- to status = 'accepted' — that must NOT count alone, or every solo convoy
-- creation would silently grant a meetup. So credit only fires once there is
-- at least one OTHER accepted member in the party:
--   • the driver whose own row just became 'accepted' (join, or an invite
--     accepted) is credited for the drivers already there;
--   • the moment a party crosses from solo to its second accepted member,
--     the one who was already there (the leader, most often) is credited
--     too — otherwise they never trigger their own row and would never get
--     credit for the very meetup that just happened to them.
-- Every accepted member beyond the second has already been credited once
-- the party had company, so only the newcomer is touched — one credit per
-- driver per convoy, not one per membership change.
CREATE OR REPLACE FUNCTION public.quest_on_convoy_member_accepted()
RETURNS TRIGGER AS $$
DECLARE
  v_prior_accepted INTEGER;
  v_other_uid      UUID;
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT COUNT(*) INTO v_prior_accepted
    FROM public.party_members
    WHERE party_id = NEW.party_id AND status = 'accepted' AND user_id <> NEW.user_id;

    IF v_prior_accepted >= 1 THEN
      PERFORM public._record_quest_event_for(NEW.user_id, 'attend_meetup', 1, NULL);

      IF v_prior_accepted = 1 THEN
        SELECT user_id INTO v_other_uid
        FROM public.party_members
        WHERE party_id = NEW.party_id AND status = 'accepted' AND user_id <> NEW.user_id
        LIMIT 1;
        IF v_other_uid IS NOT NULL THEN
          PERFORM public._record_quest_event_for(v_other_uid, 'attend_meetup', 1, NULL);
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_quest_convoy_member ON public.party_members;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'party_members') THEN
    CREATE TRIGGER trg_quest_convoy_member
      AFTER INSERT OR UPDATE ON public.party_members
      FOR EACH ROW EXECUTE FUNCTION public.quest_on_convoy_member_accepted();
  END IF;
END $$;


-- =====================================================================
-- 15. SCHEDULED REFRESH (optional but recommended)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_quests()
RETURNS void AS $$
BEGIN
  UPDATE public.daily_quests
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= NOW();

  DELETE FROM public.daily_quests
  WHERE quest_date < (NOW() AT TIME ZONE 'UTC')::date - 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule with pg_cron if available. UTC midnight = 00:00 UTC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'driveverse-expire-quests') THEN
      PERFORM cron.unschedule('driveverse-expire-quests');
    END IF;
    PERFORM cron.schedule(
      'driveverse-expire-quests',
      '5 0 * * *',
      $cron$ SELECT public.expire_stale_quests(); $cron$
    );
  END IF;
END $$;


-- =====================================================================
-- 16. ENABLE REALTIME
-- =====================================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_quests;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_quest_stats;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  -- XP is granted server-side on auto-completion; realtime keeps the
  -- client XP store in sync without a manual apply.
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_xp;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- =====================================================================
-- 16b. CLEANUP — retire the place-based universal templates
-- =====================================================================
-- The universal catalogue used to include place-visit quests ("visit a
-- café", "visit a mall", ...). Removed: the app has no reliable places API
-- to verify a visit against. daily_quests references templates with
-- ON DELETE SET NULL, so any already-generated quest is unaffected; the
-- catalogue is replaced by the distance/speed set below.
DELETE FROM public.quest_templates
WHERE id IN (
  'u_easy_cafe','u_easy_restaurant','u_easy_park',
  'u_med_mall','u_med_cafe_hop','u_med_viewpoint',
  'u_hard_explore','u_hard_viewpoints'
);


-- =====================================================================
-- 17. CLEANUP — retire the old self-marking API + Indonesia-only seeds
-- =====================================================================
-- Progress can no longer be set by clients: drop the legacy self-mark
-- functions so nothing can call them.
DROP FUNCTION IF EXISTS public.update_quest_progress(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.complete_quest(UUID);

-- Remove the old Indonesia-specific sample POIs and location-bound quest
-- templates. daily_quests reference them with ON DELETE SET NULL, so live
-- quests are unaffected; they are replaced by the universal set below.
DELETE FROM public.points_of_interest
WHERE id IN (
  'monas','kota_tua','istiqlal','bundaran_hi','gedung_sate','kemang_cafe',
  'scbd_roastery','senopati_brew','dago_coffee','bogor_kopi','puncak_pass',
  'dago_pakar','ancol_pier','tebing_keraton','puncak_route','lembang_loop',
  'coastal_pik','sudirman_night','garasi_id','bandung_garage','spbu_gatot',
  'ev_scbd','ev_bandung'
);

DELETE FROM public.quest_templates
WHERE id IN (
  'easy_warmup_drive','easy_cafe_stop','easy_landmark_visit','easy_morning_drive',
  'easy_photo_spot','easy_fuel_top','med_explore_cafes','med_scenic_visit',
  'med_distance_grind','med_route_run','med_evening_cruise','med_ev_charge',
  'med_photo_tour','hard_night_cruiser','hard_scenic_expedition','hard_grand_tour',
  'hard_landmark_sweep','hard_summit_dawn','hard_route_master','event_rally_night',
  'event_indie_day'
);


-- =====================================================================
-- 18. SEED — BADGES
-- =====================================================================
INSERT INTO public.badges (id, name, description, icon, accent_color, criteria_type, criteria_value, criteria_key, sort_order) VALUES
  ('first_quest',    'First Gear',       'Complete your first daily quest.',                 'Award',   '#00D4AA', 'total_completed',      1,   NULL,          1),
  ('quest_10',       'Getting Rolling',  'Complete 10 quests.',                              'Medal',   '#3B82F6', 'total_completed',      10,  NULL,          2),
  ('quest_50',       'Road Regular',     'Complete 50 quests.',                              'Medal',   '#8B5CF6', 'total_completed',      50,  NULL,          3),
  ('quest_100',      'Century Driver',   'Complete 100 quests.',                             'Trophy',  '#FFD700', 'total_completed',      100, NULL,          4),
  ('streak_3',       'On a Roll',        'Keep a 3-day quest streak.',                       'Flame',   '#FF6B35', 'streak',               3,   NULL,          5),
  ('streak_7',       'Week Warrior',     'Keep a 7-day quest streak.',                       'Flame',   '#FF3B6F', 'streak',               7,   NULL,          6),
  ('streak_30',      'Unstoppable',      'Keep a 30-day quest streak.',                      'Zap',     '#FBBF24', 'streak',               30,  NULL,          7),
  ('hard_10',        'Hard Charger',     'Complete 10 Hard quests.',                         'Swords',  '#EF4444', 'difficulty_completed', 10,  'hard',        8),
  ('scenic_10',      'Sightseer',        'Complete 10 scenic quests.',                       'Mountain','#00D4AA', 'category_completed',   10,  'scenic',      9),
  ('explorer_10',    'Trailblazer',      'Complete 10 exploration quests.',                  'Compass', '#3B82F6', 'category_completed',   10,  'exploration', 10),
  ('social_5',       'Fast Friends',     'Complete 5 social quests.',                        'Users',   '#FF3B6F', 'category_completed',   5,   'social',      11),
  ('coins_1000',     'Coin Collector',   'Earn 1,000 coins from quests.',                    'Coins',   '#FFD700', 'coins_earned',         1000, NULL,         12),
  ('coins_10000',    'Treasure Hunter',  'Earn 10,000 coins from quests.',                   'Gem',     '#A855F7', 'coins_earned',         10000, NULL,        13)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color, criteria_type = EXCLUDED.criteria_type,
  criteria_value = EXCLUDED.criteria_value, criteria_key = EXCLUDED.criteria_key,
  sort_order = EXCLUDED.sort_order;


-- =====================================================================
-- 19. SEED — UNIVERSAL QUEST TEMPLATES
-- =====================================================================
-- Location-agnostic blueprints: drive a distance (km or m), reach a top
-- speed, make a new friend, or meet another driver through a convoy —
-- valid for a driver anywhere in the world. Deliberately only these four:
-- no place-based quests (no places API to verify a visit against) and no
-- photo quests either — kept to exactly the four indicators this app can
-- measure without either. Targets roll across ranges and combine with time
-- buckets to yield a large, non-repeating combination space.
INSERT INTO public.quest_templates (
  id, difficulty, category, objective_type, title_template, description_template,
  icon, accent_color, poi_category, place_label, param_min, param_max, param_step, unit,
  min_level, max_level, time_windows, weather, required_event,
  reward_multiplier, badge_id, weight
) VALUES
  -- ── EASY ────────────────────────────────────────────────────────
  ('u_easy_drive', 'easy', 'driving', 'drive_distance',
    'Warm-Up Lap', 'Drive {target} {unit} today to get rolling.',
    'Car', '#00D4AA', NULL, NULL, 5, 15, 1, 'km',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.4),
  ('u_easy_drive_m', 'easy', 'driving', 'drive_distance',
    'Quick Spin', 'Drive {target} {unit} to get moving.',
    'Car', '#00D4AA', NULL, NULL, 300, 1000, 100, 'm',
    1, NULL, NULL, NULL, NULL, 0.9, NULL, 1.2),
  ('u_easy_speed', 'easy', 'driving', 'reach_speed',
    'Pick Up The Pace', 'Reach {target} {unit} on your drive today.',
    'Gauge', '#F59E0B', NULL, NULL, 40, 60, 5, 'km/h',
    1, NULL, NULL, NULL, NULL, 1.0, NULL, 1.3),

  -- ── MEDIUM ──────────────────────────────────────────────────────
  ('u_med_distance', 'medium', 'driving', 'drive_distance',
    'Distance Grinder', 'Cover {target} {unit} on the road today.',
    'Route', '#FF6B35', NULL, NULL, 25, 60, 5, 'km',
    1, NULL, NULL, NULL, NULL, 1.1, NULL, 1.3),
  ('u_med_speed', 'medium', 'driving', 'reach_speed',
    'Highway Ready', 'Reach {target} {unit} on your drive today.',
    'Gauge', '#F59E0B', NULL, NULL, 70, 90, 5, 'km/h',
    1, NULL, NULL, NULL, NULL, 1.15, NULL, 1.2),
  ('u_med_friend', 'medium', 'social', 'make_friend',
    'New Connection', 'Make {target} new {unit} on Driveverse.',
    'Users', '#FF3B6F', NULL, NULL, 1, NULL, 1, 'friend',
    1, NULL, NULL, NULL, NULL, 1.2, NULL, 1.2),
  ('u_med_meetup', 'medium', 'social', 'attend_meetup',
    'Convoy Up', 'Meet {target} new {unit} by joining a convoy today.',
    'Handshake', '#FF3B6F', NULL, NULL, 1, NULL, 1, 'driver',
    1, NULL, NULL, NULL, NULL, 1.2, NULL, 1.2),

  -- ── HARD ────────────────────────────────────────────────────────
  ('u_hard_grand_tour', 'hard', 'driving', 'drive_distance',
    'Grand Tour', 'Cover {target} {unit} across the day.',
    'Route', '#FF3B6F', NULL, NULL, 80, 150, 10, 'km',
    1, NULL, NULL, NULL, NULL, 1.4, NULL, 1.2),
  ('u_hard_long_haul', 'hard', 'driving', 'drive_distance',
    'Long Haul', 'Log a serious {target} {unit} on the road.',
    'Flame', '#FF6B35', NULL, NULL, 40, 90, 10, 'km',
    1, NULL, NULL, NULL, NULL, 1.3, NULL, 1.2),
  ('u_hard_speed', 'hard', 'driving', 'reach_speed',
    'Top Speed', 'Reach {target} {unit} on your drive today.',
    'Gauge', '#EF4444', NULL, NULL, 100, 130, 5, 'km/h',
    1, NULL, NULL, NULL, NULL, 1.35, NULL, 1.2),
  ('u_hard_friends', 'hard', 'social', 'make_friend',
    'Social Butterfly', 'Make {target} new {unit} today.',
    'Users', '#FF3B6F', NULL, NULL, 2, 3, 1, 'friends',
    1, NULL, NULL, NULL, NULL, 1.4, 'social_5', 1.1),
  ('u_hard_meetup', 'hard', 'social', 'attend_meetup',
    'Convoy Captain', 'Meet {target} new {unit} through convoys today.',
    'Handshake', '#FF3B6F', NULL, NULL, 2, 3, 1, 'drivers',
    1, NULL, NULL, NULL, NULL, 1.4, 'social_5', 1.1)
ON CONFLICT (id) DO UPDATE SET
  difficulty = EXCLUDED.difficulty, category = EXCLUDED.category,
  objective_type = EXCLUDED.objective_type, title_template = EXCLUDED.title_template,
  description_template = EXCLUDED.description_template, icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color, poi_category = EXCLUDED.poi_category,
  place_label = EXCLUDED.place_label,
  param_min = EXCLUDED.param_min, param_max = EXCLUDED.param_max,
  param_step = EXCLUDED.param_step, unit = EXCLUDED.unit,
  min_level = EXCLUDED.min_level, max_level = EXCLUDED.max_level,
  time_windows = EXCLUDED.time_windows, weather = EXCLUDED.weather,
  required_event = EXCLUDED.required_event, reward_multiplier = EXCLUDED.reward_multiplier,
  badge_id = EXCLUDED.badge_id, weight = EXCLUDED.weight;


-- =====================================================================
-- 20. CLEANUP — anything outside the allowed set, by characteristic
-- =====================================================================
-- Section 16b and 17 above delete legacy place-based templates by a
-- *guessed* list of ids — the ones this migration's own history happened to
-- introduce. That list cannot know about rows this repo never inserted:
-- Driveverse was bootstrapped from a template project, and quests like
-- "Grab a Bite" (visit a restaurant) or "Mall Run" (visit a shopping mall)
-- reached some databases as seed data that was never captured in any
-- tracked migration file here, under ids no DELETE list above could name.
--
-- So this section does not delete by id at all. It deletes by the trait
-- that actually defines a place-category quest — a set `poi_category`, or
-- an `objective_type` outside the four this app measures without a places
-- API (drive_distance, night_drive, reach_speed, make_friend, attend_meetup;
-- photo_capture is retired too — see section 19's header). That catches
-- every stray row regardless of its name, past or future, which is the same
-- reasoning behind the `ensure_daily_quests()` filter above — this is the
-- same rule applied to what is already sitting in the table.
--
-- This allowlist has to move in lockstep with section 19's INSERT and
-- `ensure_daily_quests()`'s `eligible` CTE: this file is re-run in place
-- (idempotent, not append-only — see the git history on this file), so a
-- new objective_type seeded above and left out of this DELETE's allowlist
-- would delete itself the moment this very file runs.
DELETE FROM public.quest_templates
WHERE poi_category IS NOT NULL
   OR objective_type NOT IN ('drive_distance', 'night_drive', 'reach_speed', 'make_friend', 'attend_meetup');

-- A deleted template does not retract a quest already generated from it —
-- `daily_quests.template_id` is ON DELETE SET NULL, so a driver looking at
-- their quest board right now would still see "Grab a Bite" sitting there
-- until it expired on its own. Expiring it here (not deleting — this
-- follows the same status transition `ensure_daily_quests()` already uses
-- for a quest that ran past its `expires_at`) frees that difficulty slot
-- immediately, so the next call to `ensure_daily_quests()` — which the
-- client already makes on every quest-tab load — regenerates it from the
-- now-clean template pool instead.
UPDATE public.daily_quests
SET status = 'expired'
WHERE status = 'active'
  AND (
    poi_id IS NOT NULL
    OR objective_category IS NOT NULL
    OR objective_type NOT IN ('drive_distance', 'night_drive', 'reach_speed', 'make_friend', 'attend_meetup')
  );

-- Done. See DAILY_QUEST_SYSTEM.md for architecture and client usage.
