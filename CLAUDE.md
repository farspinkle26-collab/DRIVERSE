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

**Launch safety** — the app has crashed on open twice, both times from the
same cause: a native module call at *module scope*, which Hermes runs while
evaluating the bundle, before any React tree exists and outside every error
boundary. A throw there ends the process ~200 ms after the icon is tapped,
with a black screen and no diagnosable error, and neither case reproduced in
development. The rule is in `expo/LAUNCH_SAFETY_REFERENCE.md`: **no native
call and no `throw` at module scope on anything reachable from
`app/_layout.tsx` — defer it to a mount effect or to first use.** APIs that
read the `expo-constants` manifest are the sharp edge, `Linking.createURL`
above all: it throws in a release build when the manifest or its `scheme` is
missing and only warns in development, so `lib/deepLink.ts` wraps it in a
`createAppLink()` that cannot throw (pure rule and tests in
`lib/deepLinkFormat.ts`). `components/AppErrorBoundary.tsx` is the second
line only — it catches render-time throws, never module-scope ones; it wraps
the whole root component rather than part of its output, so the loading screen
and the font hook are inside it too.

A third crash report arrived after both fixes had shipped, which exposed the
real problem: **both were diagnosed by reading the launch path, because a
store build that dies on open leaves no artefact.** The app now carries its own
black box. `expo/lib/crashReporter.ts` installs a global error and rejection
handler on the first mount effect and writes what it catches to AsyncStorage;
a failure that happens before the app finishes starting is shown as copyable
text on the *next* launch (`expo/components/CrashReportScreen.tsx`). A launch
marker distinguishes "crashed during startup" from "was killed" from "never
reached mount" — that last being the signature of a bundle-evaluation death
and the only case where reading the import graph is still the method. Shaping
and parsing are pure and tested in `expo/lib/crashReport.ts`. **Not every
"doesn't open" is a crash**: an open-ended gate holding the loading screen
(fonts, `getSession()`) looks identical from outside, and an update carries
persisted AsyncStorage state a fresh install does not — so both gates now have
a timeout and a `catch`. `expo/LAUNCH_SAFETY_REFERENCE.md` §7 is the diagnosis
procedure; start there rather than at the rule.

The fourth report was the first with an **actual crash log**, and it changed
the answer (`LAUNCH_SAFETY_REFERENCE.md` §8). The app was not dying during
bundle evaluation at all: it had mounted, and a native module raised an
Objective-C exception in a `void` TurboModule method 315 ms in. React Native
converts that exception to a JS error *on the module's own dispatch queue*,
which corrupts the Hermes heap and kills the JS thread — so the visible crash
(a `GCScope` segfault inside `String.replace`) is downstream of the real
event. The reason three passes over the launch path found nothing: **the
launch path contained code that is not in this repository.** `metro.config.js`
wrapped Metro in `withRorkMetro`, whose Babel transformer string-rewrote
`app/_layout.tsx` at build time to mount a PostHog analytics provider *above*
`AppErrorBoundary`, out of a dependency pinned to `latest` (§5b). That
transformer is now switched off — its resolver half, which supplies the web
polyfills, is kept — and the SDK version is pinned. **Verify the launch path
against the bundle, not the source**: `bun run bundle:ios` and grep the
output. CI now typechecks and bundles on every push, because a root layout
that did not parse had reached `main` and four merges passed over it.

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
  Frontmatter holds the planning fields (title, hashtags, the two per-platform
  post links) and the metrics (views, saves, engagement_rate, etc. — the
  `*_rate` fields are always recomputed, never stale); body holds the
  script/caption/takeaway. `engagement_rate` prefers the platform's own
  `engagements` (interactions) total when it's been entered and only falls back
  to summing likes+comments+saves+shares when it hasn't.
- The dashboard's **Content plan** grid mirrors the Content Planning sheet's
  columns and is editable cell-by-cell: each cell PATCHes one field through
  `admin/src/lib/content/patchPost.ts`, so an edit can never clobber a field the
  editor didn't know about. Computed rates stay read-only, and metrics are
  refused on a Scheduled post (whose metrics are never persisted) instead of
  being accepted and dropped. See `content/README.md` → "The content plan table".
- `content/scripts/*.md` — one file per **POV script**, the flagship pillar's own
  pipeline at `/content/scripts` (distinct from the general Scriptor at
  `/content/scriptor`, which persists nothing). Frontmatter holds `pov_type`
  (solo/social), `status` (idea → drafted → ready_to_film → filmed → posted),
  `feature_shown` (a **closed** vocabulary — the post store's free-text
  spellings are coerced onto it — because the rotation rule needs a fixed set,
  not `live map` vs `live_map`), the chosen `hook`, and
  `linked_post`; the body holds Hook Options (discarded variants kept),
  Script, On-Screen Text, Visual Direction, Filming Checklist and Notes.
  Every prose edit snapshots the previous file into
  `content/scripts/_history/{id}/`. Like the rest of the dashboard it needs **no
  API key**: the checks (feature rotation, hook repetition, the Social density
  gate, the checklist, the performance loop back from `linked_post`) are pure
  computation in `admin/src/lib/content/scriptRules.ts` /
  `scriptPerformance.ts`, and anything generative is a copy-prompt built by
  `scriptPrompts.ts` with a paste-back that parses the reply into sections.
  Full spec in `content/README.md` → "POV script files".
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
