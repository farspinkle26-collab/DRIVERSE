-- Places taxonomy expansion — cafe/gas_station/workshop/hangout -> nine categories.
--
-- Adds restaurant, shopping, parking, ev_charger and car_wash to the set the
-- `places` table accepts. `restaurant` was previously folded into `hangout`
-- (see supabase/functions/_shared/overpass.ts CATEGORY_TAGS) and is now its
-- own filterable category, so the map's Filters panel can show food and
-- park-up spots independently.
--
-- Additive and idempotent: no existing row changes category, and every value
-- that was valid before is still valid. Run after
-- database_migration_osm_places.sql.

-- ─── Widen the community-places category constraint ─────────
alter table places
  drop constraint if exists places_category_check;

alter table places
  add constraint places_category_check
  check (category in (
    'cafe',
    'restaurant',
    'gas_station',
    'workshop',
    'shopping',
    'parking',
    'ev_charger',
    'car_wash',
    'hangout'
  ));

-- ─── Invalidate hangout cache rows ──────────────────────────
-- `hangout` no longer includes amenity=restaurant, so every cached hangout
-- payload is now wrong (it carries restaurants that belong to their own
-- category). Deleting the rows rather than rewriting them lets the normal
-- cache-miss path refetch from Overpass with the corrected tag set.
--
-- osm_places_cache is a pure cache: dropping rows costs one Overpass call
-- per bucket on next request and nothing else.
delete from osm_places_cache where category = 'hangout';

-- The same pass moved the Overpass query from `node` to `nwr` + `out center`,
-- so malls, car parks and car washes that are mapped as areas are picked up
-- too. Cached payloads for the older node-only queries are undercounted for
-- every category, so clear them as well and let them repopulate.
delete from osm_places_cache;
