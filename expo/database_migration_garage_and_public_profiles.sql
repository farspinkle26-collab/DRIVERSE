-- Driveverse: Garage redesign + public profile visibility
-- Run this in your Supabase SQL Editor
--
-- 1. Adds category / drivetrain / 0-100 fields to car_collections so the
--    "Choose your ride" screen can show spec bars and category filters.
-- 2. Opens read access so any signed-in driver can view another driver's
--    profile, garage and the car they're currently driving ("driving
--    status"). Only SELECT is relaxed — writes stay restricted to the
--    owning user via the existing policies.

-- ============================================================
-- CAR_COLLECTIONS — new spec columns
-- ============================================================
ALTER TABLE public.car_collections ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE public.car_collections ADD COLUMN IF NOT EXISTS drivetrain TEXT NOT NULL DEFAULT 'RWD';
ALTER TABLE public.car_collections ADD COLUMN IF NOT EXISTS accel_0_100 TEXT NOT NULL DEFAULT '';

ALTER TABLE public.car_collections DROP CONSTRAINT IF EXISTS car_collections_category_check;
ALTER TABLE public.car_collections ADD CONSTRAINT car_collections_category_check
  CHECK (category IN ('sport', 'jdm', 'daily', 'ev'));

-- Give the auto-created starter car sensible spec defaults too.
CREATE OR REPLACE FUNCTION public.handle_new_user_starter_car()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.car_collections
    (user_id, name, make, model, year, color, color_name, hp, mileage_km, is_primary, category, drivetrain, accel_0_100)
  VALUES
    (NEW.id, 'Starter Ride', 'Honda', 'Civic Type R', '2023', '#FF3B30', 'Championship White', 315, 0, true, 'sport', 'FWD', '5.4s');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PUBLIC READ POLICIES — so driver profiles are viewable by others
-- ============================================================
DROP POLICY IF EXISTS "Profiles are viewable by any signed-in driver" ON public.profiles;
CREATE POLICY "Profiles are viewable by any signed-in driver" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Cars are viewable by any signed-in driver" ON public.car_collections;
CREATE POLICY "Cars are viewable by any signed-in driver" ON public.car_collections
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "XP is viewable by any signed-in driver" ON public.user_xp;
CREATE POLICY "XP is viewable by any signed-in driver" ON public.user_xp
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Quest stats are viewable by any signed-in driver" ON public.user_quest_stats;
CREATE POLICY "Quest stats are viewable by any signed-in driver" ON public.user_quest_stats
  FOR SELECT USING (auth.role() = 'authenticated');

COMMIT;
