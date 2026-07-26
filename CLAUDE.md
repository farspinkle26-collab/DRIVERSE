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
  AI-showcase cost gate. See `expo/database_migration_platinum.sql` and
  `expo/PLATINUM_REFERENCE.md`.
- `saved_places`, `ai_showcases` — Platinum-era tables (bookmarked places with
  a Regular cap; the AI-showcase generation ledger that bounds monthly spend).

Other schema areas, one migration file per feature (self-descriptive names):
community v2, daily quests, realtime events, garage + public profiles, online
users presence, OSM places, parties/convoys, platinum, profile v2, saved
routes, trip names, trip privacy. `expo/database_setup_complete.sql` is a consolidated
setup script. `expo/supabase/functions` holds Supabase Edge Functions.

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
