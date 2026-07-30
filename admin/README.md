# Driveverse Admin Dashboard

A **read-only** internal analytics dashboard for Driveverse. It queries the
existing Supabase backend directly — no separate data pipeline — and computes
every metric from freshly-fetched rows.

- **Stack:** Next.js (App Router, TypeScript) · Tailwind CSS · `@supabase/supabase-js` · Recharts · deploys to Vercel.
- **Access:** the entire app is gated behind a single shared password (middleware).
- **Scope:** it only ever issues `SELECT`s. There is no write path anywhere in this app.

> ⚠️ **The shared password is a stop-gap for the founding team only.** Move to
> real per-user auth with roles (e.g. Supabase Auth restricted to an allow-list)
> before giving access to anyone else.

---

## Why the service-role key

Every user-data table in Driveverse enforces row-level security scoped to
`auth.uid()` (a user can only read their own trips, messages, quests, etc.). An
anon-key client therefore **cannot** aggregate across all users. The dashboard
runs all queries in **server code** using the **service-role key** (which
bypasses RLS) and only sends computed aggregates to the browser. The key is
never exposed client-side.

**Recommended hardening:** create a dedicated read-only Postgres role with
`BYPASSRLS` + `SELECT`-only grants and use its key instead of the full
service-role key. Drop that key into `SUPABASE_SERVICE_ROLE_KEY` — nothing else
changes.

---

## Environment variables

Set these locally in `.env.local` (see `.env.example`) and in **Vercel →
Project Settings → Environment Variables**. **Never commit real values.**

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (same backend as the mobile app). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role **or** dedicated read-only key. Server-only. |
| `ADMIN_PASSWORD` | The single shared password that gates the dashboard. |
| `ADMIN_SESSION_SECRET` | Random string used to sign the session cookie. |

All four are read only in server code (`src/lib/env.ts` is `server-only`).

---

## Local development

```bash
cd admin
cp .env.example .env.local   # fill in real values
npm install
npm run dev                  # http://localhost:3000  → redirects to /login
```

## Deploy to Vercel

1. Import the repo into Vercel and set the **Root Directory** to `admin/`.
2. Framework preset: **Next.js** (auto-detected). Build command / output are default.
3. Add the four environment variables above (Production + Preview).
4. Deploy. Visit the URL → you'll be redirected to `/login`.

Because the pages are `force-dynamic`, they always fetch fresh data on load; the
per-section **Refresh** button re-runs the fetch on demand. (No cron logic lives
in the app — a scheduled refresh can be layered on later via a Claude Code
Routine or a Vercel Cron that hits a revalidation endpoint.)

---

## Sections

1. **Overview** — users, DAU/WAU/MAU, retention, trips, XP, active events/convoys + DAU time series.
2. **User Analytics** — cumulative growth, role & verification breakdowns, recent-signups table.
3. **Trip Analytics** — distance/duration/speed, trips-per-day, top destinations.
4. **Quest & XP** — completion by difficulty/category, most/least-completed, rank-tier histogram.
5. **Events & Convoys** — events by type, attendance, convoy sizes, top organizers.
6. **Community & Chat** — direct vs group messages, engagement ratio, chat-by-context.
7. **Places** — OSM vs user-submitted by category, submissions, moderation status.
8. **Garage** — total/avg cars, most common makes & models.
9. **Monetization** — Phase 2 placeholders wired to `payment_transactions` ("not yet live").

Every chart/table has a date-range control where the query supports it, empty
states for sparse data, and a manual refresh.

---

## Content dashboard (`/content`)

A second route in this same app (same auth gate, same deploy) for **organic
marketing** (Instagram + TikTok short-form). Unlike the Supabase sections above,
its data source is a **git-committed Markdown store** at the repo root
(`../content/`), not the database — see `content/README.md` for the full schema,
the manual-ingestion limitation, the enrichment/learning pipeline, and how to
schedule runs.

- **Tabs:** Overview (stat cards, views/saves time series, sortable post grid),
  Analytics (save rate by pillar, seeded-vs-organic pickup, 30-day funnel,
  weekday×daypart heatmap, demographics), Insights & Strategy (Takeaway feed,
  rendered `what-works.md`, a regenerated "Next 2 Weeks" strategy card).
- **Also:** per-post detail pages, a **Scriptor** (`/content/scriptor`), and a
  manual **ingest** form (`/content/ingest`).
- **POV Scripts** (`/content/scripts`): the flagship pillar's own pipeline —
  a Kanban board (Idea → Drafted → Ready to Film → Filmed → Posted) over
  `content/scripts/*.md`, a per-script editor, and a full-screen teleprompter
  (`/content/scripts/[id]/teleprompter`) for filming off a dash mount. Feature
  rotation, hook repetition, the Solo-vs-Social density gate, the filming
  checklist and the performance loop back from `linked_post` are all computed —
  no API key — and anything generative is a copy-prompt with a paste-back. Full
  spec in `content/README.md` → "POV script files".
- **Pipeline:** `POST /api/content/run` (enrich settled posts + regenerate the
  fenced section of `what-works.md`). Trigger it with `npm run content:run`
  (needs `BASE_URL` + `ADMIN_PASSWORD`).
- **Model calls** are optional: set `ANTHROPIC_API_KEY` to enable
  classification, Takeaways, the strategy narrative, the Scriptor, and vision
  reads; without it the pipeline falls back to deterministic, numbers-grounded
  output. See `.env.example`.

> Because the store lives one level above this app, `next.config.mjs` sets
> `outputFileTracingRoot`/`outputFileTracingIncludes` so the `content/` files are
> bundled into the serverless functions on Vercel. If you deploy with a
> different root, set `CONTENT_DIR` to an absolute path.
>
> **Writes on Vercel** (the Done checkbox, Add/Edit Post, ingest, enrich, run)
> need `GITHUB_TOKEN` + `GITHUB_REPO` set (see `.env.example`) — the deployed
> filesystem is read-only/ephemeral outside `/tmp`, so without those vars a
> plain file write there silently doesn't persist. When set, every write to
> `content/` goes through the GitHub Contents API instead and shows up as a
> commit on `GITHUB_BRANCH`. Local dev never needs this; the checked-out
> filesystem is already writable.

---

## Known data gaps (flagged in-app)

These need a schema/app change before the corresponding metric is exact — each
is surfaced with a banner in the relevant section rather than hidden:

| Gap | Effect | Fix |
|---|---|---|
| No `last_active_at` / session log | DAU/WAU/MAU + retention are **approximated** from activity timestamps (trips, messages, quests), not true app-opens. | Add `profiles.last_active_at` + an activity ping. |
| No XP-event log | "XP awarded this period" is approximated from `trips.xp_earned` + completed quests; totals are exact. | Add an `xp_events` table. |
| No rank-up history | "Avg time-to-rank-up" is **not computable**. | Add a level-change history table. |
| Quest system is daily-only | Completion is reported by **difficulty + category**, not the daily/weekly/seasonal/community/location taxonomy the brief assumed. | Extend the quest engine if those types are wanted. |
| Free-text `make`/`model` | Make/model counts normalise case but can split on typos; the seeded starter car skews the distribution (toggle to exclude it). | Constrain to a picker / normalise. |
| OSM cache is keyed payloads | "Total OSM places" is an **approximation** (deduped from cached Overpass results, overlapping areas repeat places). | Add a normalized OSM place table if exact counts matter. |
| Places auto-approve; no view tracking | Approval rate reads ~100%; "most-viewed places" is **not instrumented**. | Add a moderation queue + place-view events. |
| Guests not tracked | Signup funnel starts at **registered → verified** (no guest stage). | Track guest sessions if the guest→registered step matters. |

The rank ladder has **12** tiers (the brief said 11); all 12 are shown.
