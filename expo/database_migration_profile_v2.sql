-- Driveverse Profile V2 Migration
-- Adds car_collections, user_xp, trips, friends, direct_messages tables
-- Run this in your Supabase SQL Editor

-- ============================================================
-- CAR COLLECTIONS — user's garage vehicles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.car_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  make TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#FF3B30',
  color_name TEXT NOT NULL DEFAULT 'Orange',
  hp INTEGER NOT NULL DEFAULT 200,
  mileage_km NUMERIC NOT NULL DEFAULT 0,
  license_plate TEXT DEFAULT '',
  is_primary BOOLEAN DEFAULT false,
  photo_url TEXT,
  acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- USER XP / LEVELS — synced from device, persisted to cloud
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_xp (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  total_xp INTEGER NOT NULL DEFAULT 0,
  xp_required_for_level INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL DEFAULT 'Rookie Driver',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TRIPS — drive recording history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  origin_name TEXT NOT NULL DEFAULT '',
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL DEFAULT '',
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  top_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  estimated_duration_seconds INTEGER NOT NULL DEFAULT 0,
  route_polyline TEXT DEFAULT '',
  xp_earned INTEGER NOT NULL DEFAULT 0,
  was_faster_than_estimation BOOLEAN DEFAULT false,
  car_id UUID REFERENCES public.car_collections(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- FRIENDS — social connections
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- ============================================================
-- DIRECT MESSAGES — peer-to-peer chat (separate from tow chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS car_collections_updated_at ON car_collections;
CREATE TRIGGER car_collections_updated_at
  BEFORE UPDATE ON car_collections
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS user_xp_updated_at ON user_xp;
CREATE TRIGGER user_xp_updated_at
  BEFORE UPDATE ON user_xp
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS trips_updated_at ON trips;
CREATE TRIGGER trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS friends_updated_at ON friends;
CREATE TRIGGER friends_updated_at
  BEFORE UPDATE ON friends
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS direct_messages_updated_at ON direct_messages;
CREATE TRIGGER direct_messages_updated_at
  BEFORE UPDATE ON direct_messages
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- ============================================================
-- RLS ENABLE
-- ============================================================
ALTER TABLE car_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: car_collections
-- ============================================================
CREATE POLICY "Users can view their own cars" ON car_collections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cars" ON car_collections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cars" ON car_collections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cars" ON car_collections
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: user_xp
-- ============================================================
CREATE POLICY "Users can view their own xp" ON user_xp
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own xp" ON user_xp
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own xp" ON user_xp
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: trips
-- ============================================================
CREATE POLICY "Users can view their own trips" ON trips
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trips" ON trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trips" ON trips
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES: friends
-- ============================================================
CREATE POLICY "Users can view their friendships" ON friends
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can send friend requests" ON friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their friendships" ON friends
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ============================================================
-- RLS POLICIES: direct_messages
-- ============================================================
CREATE POLICY "Users can view their messages" ON direct_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" ON direct_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can mark received messages read" ON direct_messages
  FOR UPDATE USING (auth.uid() = receiver_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-create XP row on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_xp()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_xp (user_id, level, xp, total_xp, xp_required_for_level)
  VALUES (NEW.id, 1, 0, 0, 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_xp ON auth.users;
CREATE TRIGGER on_auth_user_created_xp
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_xp();

-- Auto-create first car on signup (starter car)
CREATE OR REPLACE FUNCTION public.handle_new_user_starter_car()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.car_collections (user_id, name, make, model, year, color, color_name, hp, mileage_km, is_primary)
  VALUES (NEW.id, 'Starter Ride', 'Honda', 'Civic Type R', '2023', '#FF3B30', 'Championship White', 315, 0, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_car ON auth.users;
CREATE TRIGGER on_auth_user_created_car
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_starter_car();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_car_collections_user_id ON car_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_xp_level ON user_xp(level);
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_completed_at ON trips(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_id ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages(created_at DESC);

-- ============================================================
-- ENABLE REALTIME for messages
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;

COMMIT;
