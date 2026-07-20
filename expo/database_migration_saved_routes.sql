-- Driveverse — Save Routes & Share (Strava-style)
-- Creates the social route-sharing system: saved routes with recorded GPS
-- polylines, "kudos" (likes), and comments, plus public/friends/private
-- visibility enforced with RLS. Run this in your Supabase SQL Editor.

-- ============================================================
-- SAVED ROUTES — a recorded drive the user chose to keep & share
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description TEXT DEFAULT '' CHECK (char_length(description) <= 1000),
  activity_type TEXT NOT NULL DEFAULT 'drive'
    CHECK (activity_type IN ('drive', 'cruise', 'commute', 'race', 'roadtrip')),
  -- Encoded Google polyline of the recorded GPS path
  route_polyline TEXT NOT NULL DEFAULT '',
  -- Endpoints (for list previews without decoding the whole polyline)
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  origin_name TEXT DEFAULT '',
  destination_name TEXT DEFAULT '',
  -- Stats
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  top_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  -- Sharing
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'friends', 'private')),
  kudos_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  car_id UUID REFERENCES public.car_collections(id) ON DELETE SET NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ROUTE KUDOS — a "like"/"kudos" on a shared route (one per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.route_kudos (
  route_id UUID REFERENCES public.saved_routes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (route_id, user_id)
);

-- ============================================================
-- ROUTE COMMENTS — discussion on a shared route
-- ============================================================
CREATE TABLE IF NOT EXISTS public.route_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID REFERENCES public.saved_routes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON public.saved_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_visibility ON public.saved_routes(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_kudos_user ON public.route_kudos(user_id);
CREATE INDEX IF NOT EXISTS idx_route_comments_route ON public.route_comments(route_id, created_at);

-- ============================================================
-- VISIBILITY HELPER — can the current user see this route?
-- SECURITY DEFINER so kudos/comments policies can check the parent
-- route's visibility (and friendship) without tripping over RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_route(route_uuid UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.saved_routes r
    WHERE r.id = route_uuid
      AND (
        r.user_id = auth.uid()
        OR r.visibility = 'public'
        OR (
          r.visibility = 'friends' AND EXISTS (
            SELECT 1 FROM public.friends f
            WHERE f.status = 'accepted'
              AND (
                (f.user_id = auth.uid() AND f.friend_id = r.user_id)
                OR (f.friend_id = auth.uid() AND f.user_id = r.user_id)
              )
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.can_view_route(UUID) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_comments ENABLE ROW LEVEL SECURITY;

-- ─── saved_routes ────────────────────────────────────────────
DROP POLICY IF EXISTS "View routes by visibility" ON public.saved_routes;
CREATE POLICY "View routes by visibility" ON public.saved_routes
  FOR SELECT USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND EXISTS (
        SELECT 1 FROM public.friends f
        WHERE f.status = 'accepted'
          AND (
            (f.user_id = auth.uid() AND f.friend_id = saved_routes.user_id)
            OR (f.friend_id = auth.uid() AND f.user_id = saved_routes.user_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "Users insert their own routes" ON public.saved_routes;
CREATE POLICY "Users insert their own routes" ON public.saved_routes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own routes" ON public.saved_routes;
CREATE POLICY "Users update their own routes" ON public.saved_routes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete their own routes" ON public.saved_routes;
CREATE POLICY "Users delete their own routes" ON public.saved_routes
  FOR DELETE USING (auth.uid() = user_id);

-- ─── route_kudos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "View kudos on visible routes" ON public.route_kudos;
CREATE POLICY "View kudos on visible routes" ON public.route_kudos
  FOR SELECT USING (public.can_view_route(route_id));

DROP POLICY IF EXISTS "Users give kudos" ON public.route_kudos;
CREATE POLICY "Users give kudos" ON public.route_kudos
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_view_route(route_id));

DROP POLICY IF EXISTS "Users remove their kudos" ON public.route_kudos;
CREATE POLICY "Users remove their kudos" ON public.route_kudos
  FOR DELETE USING (auth.uid() = user_id);

-- ─── route_comments ──────────────────────────────────────────
DROP POLICY IF EXISTS "View comments on visible routes" ON public.route_comments;
CREATE POLICY "View comments on visible routes" ON public.route_comments
  FOR SELECT USING (public.can_view_route(route_id));

DROP POLICY IF EXISTS "Users comment on visible routes" ON public.route_comments;
CREATE POLICY "Users comment on visible routes" ON public.route_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_view_route(route_id));

DROP POLICY IF EXISTS "Users delete their own comments" ON public.route_comments;
CREATE POLICY "Users delete their own comments" ON public.route_comments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS — keep kudos_count / comments_count / updated_at fresh
-- ============================================================
CREATE OR REPLACE FUNCTION public.saved_routes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_routes_updated_at ON public.saved_routes;
CREATE TRIGGER saved_routes_updated_at
  BEFORE UPDATE ON public.saved_routes
  FOR EACH ROW EXECUTE PROCEDURE public.saved_routes_updated_at();

CREATE OR REPLACE FUNCTION public.route_kudos_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.saved_routes
    SET kudos_count = kudos_count + 1
    WHERE id = NEW.route_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.saved_routes
    SET kudos_count = GREATEST(kudos_count - 1, 0)
    WHERE id = OLD.route_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS route_kudos_count_ins ON public.route_kudos;
CREATE TRIGGER route_kudos_count_ins
  AFTER INSERT ON public.route_kudos
  FOR EACH ROW EXECUTE PROCEDURE public.route_kudos_count();

DROP TRIGGER IF EXISTS route_kudos_count_del ON public.route_kudos;
CREATE TRIGGER route_kudos_count_del
  AFTER DELETE ON public.route_kudos
  FOR EACH ROW EXECUTE PROCEDURE public.route_kudos_count();

CREATE OR REPLACE FUNCTION public.route_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.saved_routes
    SET comments_count = comments_count + 1
    WHERE id = NEW.route_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.saved_routes
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.route_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS route_comments_count_ins ON public.route_comments;
CREATE TRIGGER route_comments_count_ins
  AFTER INSERT ON public.route_comments
  FOR EACH ROW EXECUTE PROCEDURE public.route_comments_count();

DROP TRIGGER IF EXISTS route_comments_count_del ON public.route_comments;
CREATE TRIGGER route_comments_count_del
  AFTER DELETE ON public.route_comments
  FOR EACH ROW EXECUTE PROCEDURE public.route_comments_count();

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_routes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.route_kudos;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.route_comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
