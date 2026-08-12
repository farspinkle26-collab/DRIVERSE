-- Driveverse — "territory" pins: a driver drops a pin anywhere, names it, and
-- it is theirs. Additive and idempotent, like every other
-- database_migration_* file here. Safe to re-run.
--
-- WHAT THIS ADDS
--   Reuses `saved_places` rather than a new table — a territory pin is a
--   bookmark the same way a starred cafe is one, just without a provider
--   place_id behind it. The client generates its own (`custom-<ts>-<rand>`,
--   see `generateCustomPlaceId` in `hooks/useSavedPlacesStore.ts`) and writes
--   `source = 'user'` (already a valid value — see
--   database_migration_places_provider.sql) with `category = 'custom'`, which
--   this migration is the only thing standing between that write and a
--   constraint violation.
--
--   `category` stays a CHECK, not a free column: 'custom' is one specific,
--   known value meaning "no provider category, this is the driver's own
--   mark" — not an open door for arbitrary strings. It is NOT added to
--   `constants/mapLayers.ts`'s `PlaceCategory`/`MAP_LAYERS` — that vocabulary
--   is the map's togglable *layer* system (nine OSM categories + events +
--   users), and a territory pin is never filterable through it: it is always
--   shown on the owner's own map, the same way the "You" label is.
--
-- PRIVACY
--   Nothing to add here. `saved_places` RLS already scopes every row to
--   `user_id = auth.uid()` on select/insert/update/delete
--   (database_migration_platinum.sql) — a territory pin was private the
--   moment it landed in this table, same as every other saved place.

alter table public.saved_places
  drop constraint if exists saved_places_category_check;

alter table public.saved_places
  add constraint saved_places_category_check
  check (category in (
    'cafe', 'restaurant', 'gas_station', 'workshop', 'hangout',
    'shopping', 'parking', 'ev_charger', 'car_wash', 'custom'
  ));

-- ── verification ────────────────────────────────────────────────────────────
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.saved_places'::regclass
--     and conname = 'saved_places_category_check';
--
-- should list ten values, ending in 'custom'.
