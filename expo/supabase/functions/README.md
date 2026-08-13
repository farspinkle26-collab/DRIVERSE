# Edge functions

Backend for the "nearby places" feature: POI data from Mapbox Search Box,
cached in Postgres, merged with community submissions.

> **The POI source used to be the public Overpass API and no longer is.**
> Overpass caps *concurrent* queries per IP and refuses the rest with 429
> immediately. Every edge invocation leaves Supabase from a shared regional
> egress IP, so the app competed with itself and with every other project in
> the region — producing a constant stream of `HTTP 502 — Couldn't load nearby
> places` across every category. Client-side windowing could not fix a
> dependency refusing the request before it started. See the header of
> `_shared/placesSource.ts`.

- `_shared/placesSource.ts` — category → Mapbox canonical category mapping, bbox + query building, fetch + normalize. Swap the POI source here later; `places-nearby`'s contract doesn't change.
- `_shared/cache.ts` — ~1km grid-bucket cache key, 7-day TTL, get/set against `osm_places_cache`. `getCachedEntry` reports staleness instead of enforcing it, so a caller can serve a stale row when the provider is down.
- `_shared/merge.ts` — merges provider + approved user places, preferring the provider entry within 30m (dedupe).
- `places-nearby` — `GET /places-nearby?lat=&lng=&radius=&category=`. Cache-or-provider, merges in approved `places` rows, returns `{ places: [...] }`. **A provider failure only 502s when nothing is cached for that bucket** — a stale row is served in preference to an error, because POIs don't move.
- `places-submit` — authenticated `POST /places-submit` inserting a community place (auto-approved — no moderation UI exists yet).
- `places-refresh-cache` — background job that refreshes the oldest stale cache rows so real requests rarely hit a live provider call. Not invoked by user traffic — **schedule it** (Supabase dashboard → Edge Functions → this function → Schedule, e.g. every 6h, or a pg_cron job hitting its URL). Unscheduled, the cache only ever holds what a driver already waited for, which is also what the stale-serving fallback in `places-nearby` has to draw on.
- `generate-car-image` — authenticated `POST /generate-car-image` (`{ carId, imageBase64, mimeType }`). Verifies the car belongs to the caller, sends the photo to Gemini 3.1 Flash Lite Image ("Nano Banana 2 Lite") through the shared Rork Toolkit renderer with a fixed Driveverse Signature style prompt, uploads the result to the `car-photos` storage bucket, writes it to `car_collections.photo_url`, and returns `{ photoUrl }`. Existing deployments can use the `OPENROUTER_API_KEY` fallback. This is what powers the "Generate My Car" flow in `components/ProfileScreen.tsx` — it replaced an earlier stub that just let the user manually pick their own photo as the "render".

## Platinum

See `../../PLATINUM_REFERENCE.md` for the tier as a whole.

- `generate-showcase` — authenticated `POST /generate-showcase` (`{ carId, imageBase64, mimeType, style }`). The server ignores legacy style values and always applies the Driveverse Signature treatment. Unlike `generate-car-image` it does **not** touch `car_collections`; it writes a standalone artwork to the `car-showcases` bucket and a row to `ai_showcases`, returning `{ imageUrl, style, quota }`. Gates, in order: Platinum entitlement (via `is_platinum()` against the webhook-written mirror — never anything the client sends) and the monthly quota (via `ai_showcase_quota()`). The ledger row is written before the response so parallel requests can't each spend the same remaining allowance.
- `revenuecat-webhook` — `POST /revenuecat-webhook`, called by RevenueCat, not by the app. Keeps `platinum_subscribers` in step with subscription lifecycle events. Derives activity from `expiration_at_ms` plus a small set of terminal event types, so an event type we haven't seen yet fails toward the expiry date rather than toward a wrong boolean. Drops duplicate and out-of-order deliveries; returns 500 on a write failure so RevenueCat retries. Requires `REVENUECAT_WEBHOOK_SECRET`, matched against the Authorization header configured in the RevenueCat dashboard — without it set, every request is refused rather than allowing unauthenticated writes to the entitlement mirror.

## Account deletion

- `delete-account` — authenticated `POST /delete-account`, no body. App Store Guideline 5.1.1(v): self-service, no email/call required — the confirmation step is client-side (`components/DeleteAccountModal.tsx`, type-to-confirm), this is what actually runs once a driver confirms. Deletes their Storage uploads (`avatars`/`car-photos`/`place-photos`, listed by `${userId}/` prefix), best-effort cleans the app's original "towing" template tables the current feature set doesn't otherwise touch (`tow_requests`, `chat_messages`, `company_registrations.reviewed_by` — tolerant of the table not existing, since it's unclear which of `database_setup_complete.sql` / `chat_system_tables.sql` ever ran against a given project), then calls `auth.admin.deleteUser()`. Every table the app's real features write to — `profiles`, `car_collections`, `trips`, `user_xp`, `daily_quests`, `user_main_quests`, `saved_places`, `saved_routes`, `friends`, `parties`/`party_members`, `direct_messages`, group chat, events, badges — has `ON DELETE CASCADE` to `auth.users(id)` (audited against every `database_migration_*.sql` file), so that one call removes all of it in one transaction. Uses the service role key — this is the one place it can safely live, since the function only ever acts on the caller's own id from their verified JWT.

## Deploy

```
supabase functions deploy places-nearby
supabase functions deploy places-submit
supabase functions deploy places-refresh-cache
supabase functions deploy generate-car-image
supabase functions deploy generate-showcase
supabase functions deploy revenuecat-webhook
supabase functions deploy delete-account
```

Apply `database_migration_osm_places.sql` first (creates `osm_places_cache` and `places`), and `database_migration_platinum.sql` before the two Platinum functions (creates the mirror, the ledger, `is_platinum()` and `ai_showcase_quota()`).

Also apply `database_migration_places_provider.sql`, which widens the `source`
CHECK to accept `mapbox` and brings both `category` CHECKs up from the original
four categories to all nine. Without it, `places-submit` and bookmarking reject
every category added in the marker rebuild.

`places-nearby` and `places-refresh-cache` need a Mapbox token. The AI car
functions use Rork Toolkit's Gemini route when its server secret is configured,
with OpenRouter retained as a fallback for existing deployments. The webhook
needs its shared secret:

```
supabase secrets set MAPBOX_ACCESS_TOKEN=pk....
supabase secrets set RORK_TOOLKIT_URL=https://toolkit.rork.com
supabase secrets set RORK_TOOLKIT_SECRET_KEY=...
# Existing deployments can keep this fallback:
# supabase secrets set OPENROUTER_API_KEY=sk-or-...
supabase secrets set REVENUECAT_WEBHOOK_SECRET=...
```

`MAPBOX_ACCESS_TOKEN` is a *server* secret and is not the same value as the
client's `EXPO_PUBLIC_MAPBOX_TOKEN`, even though the same token would work for
both. Keep them separate so the server's POI spend can be scoped, rotated or
URL-restricted without shipping a new app build.

## Local testing

Pure logic (normalize/merge/cache bucketing) is covered by
`_shared/__tests__/places.test.ts`, runnable with `bun test` from `expo/`
(no Supabase/Deno instance needed — it mocks `fetch` and stubs `Deno.env`).
Manually verifying the live provider path requires `supabase functions serve`.

The canonical category ids in `_shared/placesSource.ts` are the one part that
cannot be verified by unit test — a wrong id is a valid request for a category
that does not exist. Check them against the live list before trusting a deploy:

```
curl "https://api.mapbox.com/search/searchbox/v1/list/category?access_token=$MAPBOX_ACCESS_TOKEN&language=en"
```
