-- Places: provider swap + the nine-category catch-up.
--
-- Additive and idempotent, like every other database_migration_* file here.
-- Safe to re-run.
--
-- TWO UNRELATED THINGS, both constraints that had drifted behind the code:
--
--   1. `source` gained a value. The POI provider moved off the public Overpass
--      API (it rate-limits per IP, and every edge invocation shares one egress
--      IP, so it was refusing most requests) onto Mapbox Search Box. Rows write
--      `mapbox` now. `osm` stays valid — it is what every row saved before the
--      swap carries, and this is persisted data.
--
--   2. `category` never caught up with the marker rebuild. The map has shipped
--      nine categories since then, but both CHECKs still only permitted the
--      original four. Anything else was rejected by the database: a driver
--      bookmarking a car park or submitting an EV charger got a constraint
--      violation, not a saved place. Nothing in the app read these lists, so
--      the drift was invisible until you tried one of the five newer ones.

-- ── saved_places ────────────────────────────────────────────────────────────

alter table public.saved_places
  drop constraint if exists saved_places_source_check;

alter table public.saved_places
  add constraint saved_places_source_check
  check (source in ('mapbox', 'osm', 'user'));

alter table public.saved_places
  drop constraint if exists saved_places_category_check;

alter table public.saved_places
  add constraint saved_places_category_check
  check (category in (
    'cafe', 'restaurant', 'gas_station', 'workshop', 'hangout',
    'shopping', 'parking', 'ev_charger', 'car_wash'
  ));

-- New bookmarks come from the provider unless they are community submissions.
alter table public.saved_places
  alter column source set default 'mapbox';

-- ── places (community submissions) ──────────────────────────────────────────

alter table public.places
  drop constraint if exists places_category_check;

alter table public.places
  add constraint places_category_check
  check (category in (
    'cafe', 'restaurant', 'gas_station', 'workshop', 'hangout',
    'shopping', 'parking', 'ev_charger', 'car_wash'
  ));

-- ── verification ────────────────────────────────────────────────────────────
--
-- Both should return nine rows' worth of permitted values:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('public.places'::regclass, 'public.saved_places'::regclass)
--     and contype = 'c';
