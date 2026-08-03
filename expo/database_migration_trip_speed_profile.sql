-- Driveverse: per-point speed profile on a recorded drive
-- Run this in your Supabase SQL Editor.
--
-- WHY
--   The share card draws the route as a speed heatmap — the faster the car was
--   moving, the redder that stretch of the line. `trips` already stores the
--   shape of the drive (`route_polyline`) and two summary speeds
--   (`avg_speed_kmh`, `top_speed_kmh`), but nothing that says *where* on the
--   route the fast part was.
--
--   `lib/speedTrace.ts` can reconstruct an approximate profile from the
--   geometry alone — the recorder samples on a ~1 Hz timer and `simplifyPath`
--   thins by a constant index step, so segment length is roughly proportional
--   to speed — and that is what every drive already in the table falls back
--   to. This column is the real thing for drives recorded from here on.
--
-- FORMAT
--   Comma-separated whole km/h, one entry per point of `route_polyline`:
--   "0,14,32,31,…". Text rather than an array or a binary packing because it
--   is under 1.6 kB at the 400-point cap, it is readable in a psql session,
--   and a corrupt entry degrades to one bad sample instead of an unparseable
--   row (`decodeSpeedProfile` maps anything unparseable to 0).
--
--   The length has to match `route_polyline` exactly. A profile that is one
--   point out paints the fast stretch onto the wrong corner of the map, so the
--   client refuses a mismatched profile outright and derives one instead —
--   there is no attempt to realign it.
--
-- SAFETY
--   Additive and nullable. Existing rows keep working (they take the derived
--   path), and nothing reads this column except the share card.

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS speed_profile TEXT;

COMMENT ON COLUMN public.trips.speed_profile IS
  'Per-point speed in whole km/h, comma-separated, one entry per point of route_polyline. Drives the share card speed heatmap. NULL on drives recorded before this column existed.';

-- The same trace and the same card are reachable from a saved route, so the
-- column exists on both tables and means the same thing on both.
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS speed_profile TEXT;

COMMENT ON COLUMN public.saved_routes.speed_profile IS
  'Per-point speed in whole km/h, comma-separated, one entry per point of route_polyline. Same format as trips.speed_profile.';

COMMIT;
