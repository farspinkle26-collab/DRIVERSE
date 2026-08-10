-- Driveverse: first-launch tutorial completion
-- Run this in your Supabase SQL Editor.
--
-- WHY
--   The map's floating controls are plain circular icons with no visible
--   caption (Search, My Location, Filters, Event, Signal, Convoy, Chat, and
--   the Drive button — see app/(tabs)/map.tsx's MapChromeButton). A
--   brand-new driver has no way to learn what any of them do on their own,
--   so the app now plays a one-time spotlight walkthrough of the live map
--   right after a driver finishes account setup. This column is what makes
--   it play exactly once.
--
-- WHY A COLUMN, NOT AsyncStorage
--   This repo's own launch-safety notes (LAUNCH_SAFETY_REFERENCE.md) already
--   cover the exact failure this avoids: an app *update* carries persisted
--   AsyncStorage state that a fresh install does not, so a device-only flag
--   and the account's actual state can disagree. A column on `profiles`
--   settles it the same way `registration_completed_at` and
--   `last_active_at` already do.
--
-- SAFETY
--   Additive and nullable. NULL means "hasn't seen it yet" (every existing
--   account included — nobody gets it replayed, but nobody who signs up
--   after this ships gets skipped either, since new rows also start NULL).
--   Written once, on completion *or* on an explicit skip — a skip is a
--   decision, not "still pending".

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.tutorial_completed_at IS
  'When this driver finished (or explicitly skipped) the first-launch map tutorial. NULL means it has not been shown yet.';
