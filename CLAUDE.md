# DRIVERSE

Monorepo for the Driverse product: a mobile app (`expo/`), an internal admin
dashboard (`admin/`), and a git-committed content store (`content/`) that
powers the content-performance dashboard. This file exists to give `claude -p`
(used by the local chat tool in `chat-server/`) fast context about the
Supabase schema and the content repo without re-reading every file.

## Apps

- `expo/` — React Native (Expo) app. Supabase is the backend.
- `admin/` — Next.js internal admin app, including `/content` (content
  performance dashboard) and `/admin` (analytics, tables built on TanStack
  Table).
- `content/` — plain-file content store, versioned in git. See
  `content/README.md` for the full spec.

## Supabase schema

Schema is defined across `expo/database_schema.json` (structured JSON schema
for the newer tables) and a set of standalone SQL migrations in `expo/*.sql`.
There is no single canonical migration history — each `database_migration_*.sql`
file is additive and named for the feature it introduces.

Key tables (see `expo/database_schema.json` for full column definitions,
including `jsonb` sub-structures):

- `company_registrations` — company onboarding/approval workflow
  (`status`: draft/submitted/under_review/approved/rejected/requires_revision),
  with `company_info`, `contact_person`, and `documents` as `jsonb`.
- `companies`, `company_vehicles`, `company_drivers` — approved companies and
  their fleets/drivers.
- `chat_messages` — in-app chat system (see `expo/chat_system_tables.sql` and
  `expo/CHAT_SYSTEM_SETUP.md`).
- `tow_requests` — roadside assistance requests.
- `platinum_subscribers` — Platinum entitlement **mirror**, written only by
  RevenueCat's webhook. Not the client's gate; the app reads entitlement from
  the RevenueCat SDK. The mirror backs the tier-cap triggers and the
  AI-showcase cost gate. See `expo/database_migration_platinum.sql`,
  `expo/PLATINUM_REFERENCE.md` (why the tier is built the way it is) and
  `expo/REVENUECAT_SETUP.md` (the runbook: keys, products, offering, paywall,
  Customer Center, testing).
- `saved_places`, `ai_showcases` — Platinum-era tables (bookmarked places with
  a Regular cap; the AI-showcase generation ledger that bounds monthly spend).

Other schema areas, one migration file per feature (self-descriptive names):
community v2, daily quests, realtime events, garage + public profiles, online
users presence, OSM places, parties/convoys, platinum, problem signal, profile
v2, saved routes, trip names, trip privacy. `expo/database_setup_complete.sql`
is a consolidated setup script. `expo/supabase/functions` holds Supabase Edge
Functions.

**Finishing a drive writes two different rows.** A `trips` row is written
automatically the moment the driver ends a drive (the log, the XP, the Drive
Hub); a `saved_routes` row is written only if they open the save sheet and
confirm (the publishable route, with a name, visibility and a Regular cap).
Sharing needs neither — the share card renders from the in-memory trip, so
the Share action is never gated on a successful save.
`expo/SAVE_ROUTE_REFERENCE.md` covers the sheet, the failure modes and how
to verify it; `expo/lib/routeDraft.ts` holds the pure guards and their tests.

**Online presence** — who each driver sees on the map — runs on two paths at
once, both in `expo/hooks/useOnlineUsers.ts`: Supabase Realtime Presence on
the `online-players` channel (instant), and a 10-second poll of the
`user_locations` table each client already upserts its position into (the
fallback, over HTTP, so a dead websocket degrades to "seconds late" instead of
an empty map with no error). `expo/hooks/onlineUsersMerge.ts` holds the pure
merge/staleness rule and its tests. Full detail — connection states, rejoin
backoff, and how to verify it on two devices — in
`expo/ONLINE_PRESENCE_REFERENCE.md`.

The **problem signal** (`expo/database_migration_problem_signal.sql`,
`expo/PROBLEM_SIGNAL_REFERENCE.md`) lets a driver in trouble broadcast a help
signal — breakdown / accident / out-of-fuel / SOS — that every online driver
on the map sees in real time, whether or not they share a convoy. It rides the
same two paths as position: the presence payload live, and the
`problem_type` / `problem_since` mirror columns on `user_locations` (all the
migration adds) on the fallback sweep.

When asked about the schema, prefer reading `expo/database_schema.json` and
the specific `expo/database_migration_*.sql` file for the feature in question
over guessing column names.

## Content repo (`content/`)

- `content/posts/*.md` — one file per social post (Instagram/TikTok).
  Frontmatter holds metrics (views, saves, engagement_rate, etc. — the
  `*_rate` fields are always recomputed, never stale); body holds the
  script/caption/takeaway.
- `content/account.json` — per-platform follower + funnel + demographics
  snapshot.
- `content/what-works.md` — the learned playbook. Content between
  `<!-- AUTO:START -->` / `<!-- AUTO:END -->` is machine-generated and
  rewritten by the content pipeline; everything outside that fence is
  hand-written strategy notes and must never be edited automatically.
- Five content pillars: `garagey`, `pov_daily`, `fake_scripted_pov`,
  `ai_supercars` (reach-only, judged on reach/follows not save rate),
  `tips_tricks`.

Full detail, including the ingestion/enrichment/learning-loop pipeline and the
`admin/src/lib/content/*` implementation, is in `content/README.md`.

## Chat tool

`chat-server/` is a small local Node.js server (no dependencies) that serves a
chat UI at `localhost` and answers questions about this repo by shelling out
to `claude -p`. See `chat-server/README.md` to run it.

**Map markers** — the map's marker system (`expo/app/(tabs)/map.tsx`,
`expo/components/PlacesLayer.tsx`) draws eleven filterable layers: nine
OSM/community place categories plus `events` and `users`. The vocabulary —
ids, order, labels — is owned by `expo/constants/mapLayers.ts` and nothing
else may define a category id. Layer visibility is one persisted store
(`expo/hooks/useMapFilters.ts`) over a pure, tested rule
(`expo/hooks/mapFiltersState.ts`); `isLayerVisible` is the single predicate
every marker render site goes through, and a hidden category is not fetched
either. Per-category marker colours live in
`expo/constants/mapCategoryColors.ts`, deliberately quarantined there
because they reverse the "category is shape, state is colour" rule that
`expo/MAP_SCREEN_REFERENCE.md` §2 established — read that file's header
before using one. Clustering is `expo/lib/mapClustering.ts` (grid-based,
per-category), because `react-native-maps` has none of its own.

Two rules the first device pass established the hard way, both in
`expo/MAP_MARKER_REFERENCE.md` §10:

- **POIs are fetched for the area on screen**, bounded by a radius and
  refetched when the map centre moves. Both sources obey this — landmarks
  (Mapbox geocoding, `types=poi` + a hard radius, because `proximity` only
  *ranks*) and the nine place categories (`expo/lib/placesApi.ts`, windowed
  three at a time through `expo/lib/concurrency.ts`, into the `places-nearby`
  edge function, which bounds by `bbox` for the same reason).

  That category layer is served by **Mapbox Search Box**, not OpenStreetMap.
  It ran on the public Overpass API until Overpass's per-IP concurrency cap —
  hit from Supabase's *shared* egress IP — turned it into a constant stream of
  HTTP 502s across every category. Retrying at both the client and the edge
  function compounded rather than helped (up to 72 upstream requests per pan).
  The source is quarantined in
  `expo/supabase/functions/_shared/placesSource.ts`; the `/places-nearby`
  contract did not change, retries now live only at the layer nearest the
  provider, and a provider failure serves the stale cache instead of erroring.
  Rows and saved places written before the swap still carry `source: "osm"`,
  so anything reading that field must test for `!== "user"` rather than for a
  provider name. Full account in `expo/MAP_MARKER_REFERENCE.md` §10b.
- **No marker sets `tracksViewChanges` itself** — every custom marker goes
  through `expo/components/SettledMarker.tsx`. A constant `false` freezes
  Android's marker bitmap before the SVG inside it has drawn, leaving a
  marker that is present, tappable and blank.

Full detail, including what is still unverified on device, in
`expo/MAP_MARKER_REFERENCE.md`.
