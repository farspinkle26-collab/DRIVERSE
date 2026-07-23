# Places (OSM + community) edge functions

Backend for the "nearby places" feature: free OpenStreetMap data via the
public Overpass API, cached in Postgres, merged with community submissions.

- `_shared/overpass.ts` — category → OSM tag mapping, Overpass QL query, fetch + normalize. Swap the POI source here later; `places-nearby`'s contract doesn't change.
- `_shared/cache.ts` — ~1km grid-bucket cache key, 7-day TTL, get/set against `osm_places_cache`.
- `_shared/merge.ts` — merges OSM + approved user places, preferring OSM within 30m (dedupe).
- `places-nearby` — `GET /places-nearby?lat=&lng=&radius=&category=`. Cache-or-Overpass, merges in approved `places` rows, returns `{ places: [...] }` or `{ error, places: [] }` on Overpass failure (never a raw crash/timeout).
- `places-submit` — authenticated `POST /places-submit` inserting a community place (auto-approved — no moderation UI exists yet).
- `places-refresh-cache` — background job that refreshes the oldest stale cache rows so real requests rarely hit a live Overpass call. Not invoked by user traffic — schedule it (Supabase dashboard → Edge Functions → this function → Schedule, e.g. every 6h, or a pg_cron job hitting its URL).

## Deploy

```
supabase functions deploy places-nearby
supabase functions deploy places-submit
supabase functions deploy places-refresh-cache
```

Apply `database_migration_osm_places.sql` first (creates `osm_places_cache` and `places`).

## Local testing

Pure logic (normalize/merge/cache bucketing) is covered by
`_shared/__tests__/places.test.ts`, runnable with `bun test` from `expo/`
(no Supabase/Deno instance needed — it mocks `fetch`). Manually verifying
the live Overpass path requires `supabase functions serve`.
