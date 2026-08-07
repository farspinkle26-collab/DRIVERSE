-- Driveverse Identity Lock
-- Prevents a driver from changing their name or nation after it is set, so
-- neither can be used to game anything downstream of them (regional speed
-- units chief among them: swap nation, get a different mph/km/h reading on
-- the same drive).
--
-- WHY THIS EXISTS
--
-- `profiles`' own RLS policy ("Users can update their own profile", USING
-- (auth.uid() = id)) has no column restriction — a signed-in driver can PATCH
-- `name` or `country` on their own row as many times as they like, straight
-- through the Supabase client, no app code involved. Removing the edit
-- affordance from the app (components/ProfileScreen.tsx) only stops the UI;
-- it does nothing against a direct API call. The enforcement has to live in
-- Postgres.
--
-- THE RULE: once `name` or `country` is set to a non-empty value, it cannot
-- be changed again by an ordinary authenticated client. `service_role`
-- (support/admin scripts, migrations) is exempt, so a genuine correction is
-- still possible without reopening the loophole to end users.
--
-- `name` is `NOT NULL` from signup, so this makes it immutable outright.
-- `country` is nullable until onboarding
-- (`useAuthStore.completeProfileCustomization`) sets it once — that write is
-- OLD.country IS NULL -> NEW.country = '<chosen>', which the trigger below
-- allows; every write after that has OLD.country already set and is
-- rejected.
--
-- Run this in your Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.lock_profile_identity()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role (admin/support corrections, migrations) bypasses the lock.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.name IS NOT NULL AND OLD.name <> '' AND NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'Your name cannot be changed once set. Contact support if this is a mistake.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.country IS NOT NULL AND OLD.country <> '' AND NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'Your nation cannot be changed once set. Contact support if this is a mistake.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lock_profile_identity_trigger ON public.profiles;

CREATE TRIGGER lock_profile_identity_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_profile_identity();
