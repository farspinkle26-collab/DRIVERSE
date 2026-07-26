# Driveverse content store

This directory is the **git-committed data store** for the content-performance
dashboard at `/content` in the admin app (`admin/`). It is plain files on
purpose: every post, the account snapshot, and the learned playbook live in
version control alongside the code, so history is auditable and diffs are human
-readable.

```
content/
  posts/*.md        one Markdown file per post (frontmatter + body sections)
  account.json      per-platform followers + 30-day funnel + demographics
  what-works.md     learned playbook (machine section fenced; prose is yours)
```

## Post files (`posts/*.md`)

Frontmatter holds the metrics; the body holds the words. The three `*_rate`
fields are **computed** — they're written for readability but always recomputed
from the raw counters on read/write, so you can't get a stale rate.

```yaml
---
status: scheduled | published   # scheduled = queued, no metrics yet
platform: instagram | tiktok
post_id: string
permalink: string
date: YYYY-MM-DD          # scheduled: future post date. published: when it went live.
time: "HH:MM"
weekday: string
pillar: garagey | pov_daily | fake_scripted_pov | ai_supercars | tips_tricks
format: string            # "car showcase", "narrative", "listicle", "ai render"
feature_shown: string     # "live map", "trip card", "garage card", "none", …
duration_seconds: number
views: number
reach: number
likes: number
comments_total: number
comments_seeded: number            # the 3–4 seeded "Driveverse?" comments
comments_organic_pickup: number    # REAL unprompted "what app is this?" asks
saves: number
shares: number
avg_watch_time: number
new_follows: number
save_rate: number         # computed: saves / views
engagement_rate: number   # computed: (likes+comments+saves+shares) / views
hold_rate: number         # computed: avg_watch_time / duration_seconds
---
```

`status: scheduled` posts omit every metrics field entirely (nothing to report
yet) — only `status`/`platform`/`post_id`/`permalink`/`date`/`time`/`weekday`/
`pillar`/`format`/`feature_shown` are written. The dashboard never counts a
Scheduled post into views/saves/engagement aggregates; it only shows up in the
Overview "Upcoming" list until it's edited to `status: published` (via the
Edit Post form or `/content/ingest`), at which point real metrics can be added.

Optional extension keys (not required):

- `is_repost: true` — excluded from learning aggregates and every ranking.
- `source: trip_card_share` — a user-generated Trip Card share we reposted, vs.
  our own `posted` content.
- `pillar_fit_flag: "..."` — set by the classifier when a post fits no pillar
  cleanly (we never auto-invent a new pillar).
- `enriched_at` — ISO timestamp of the last enrichment run.
- `checked: true` — manual "done" tick, toggled from the checkbox column in
  the posts table / Upcoming list. Purely a personal execution checklist —
  never affects status, metrics, or any ranking/aggregate.

Body sections (level-2 headings; unknown sections round-trip untouched):

```
## Script                 (as written)
## Delivered Transcript
## On-Screen Text
## Caption
## Takeaway               (auto-generated once metrics settle)
## Retention              (manual/vision read of the retention graph, if any)
```

## The five pillars

| id | what it is | job |
|---|---|---|
| `garagey` | Pokédex-style car showcase — our proven format (2×/week) | growth |
| `pov_daily` | everyday first-person driving/ownership POV | growth |
| `fake_scripted_pov` | scripted comedic skit in POV form | growth |
| `ai_supercars` | AI/deepfake supercar renders — **reach-only, no app shown** | reach |
| `tips_tricks` | how-to / listicle / feature explainer | growth |

**AI Supercars is judged on reach and follows, never on save rate or organic
pickup** — it plays a different position and the strategy logic knows this.

## Ingestion — manual (current limitation)

There is **no native Instagram/TikTok connector and no connected Supermetrics
MCP** in this environment (Supermetrics exists in the registry but is not
connected). So metrics are entered by hand:

- **UI:** `/content/ingest` — paste a JSON object or the raw text copied from an
  Insights screen (`label: value` per line). A screenshot can be read with the
  vision model; paste the numbers it returns.
- **API:** `POST /api/content/ingest` with `{ "input": <json-or-text> }`.

Ingestion is isolated behind one `IngestSource` interface
(`admin/src/lib/content/ingest.ts`). To wire a real API later — Supermetrics or
a native connector — implement `IngestSource.parse()` against it and return the
normalized `IngestedMetrics`. **Nothing downstream (enrichment, dashboard,
strategy) changes.** A typed `SupermetricsIngestSource` stub is already there,
advertising itself as unavailable with instructions.

## Enrichment (idempotent — safe to rerun)

Per post: classify pillar/format if unset (constrained to the 5 pillars — never
invents one), then — only after metrics settle (views present, post ≥ 2 days
old) — generate a blunt Takeaway anchored to **that pillar's** medians/quartiles
(Garagey is compared to Garagey, not to AI reach posts). Vision reads for
on-screen text and the retention graph accept uploaded frames.

- One post: `POST /api/content/enrich { "slug": "...", "forceTakeaway"?: true,
  "onScreenTextImages"?: [...], "retentionImages"?: [...] }`

## Learning loop → `what-works.md`

`what-works.md` has a machine-managed section fenced by
`<!-- AUTO:START -->` / `<!-- AUTO:END -->`. **Everything outside the fence is
hand-written and never touched by automated writes.** Each run aggregates
(reposts excluded, min-views floor on rankings): save rate + median views by
pillar / format / feature / weekday / platform / daypart, and the key strategic
number — **seeded vs organic pickup by pillar** — then writes a numbers-grounded
analysis ending in 3–5 concrete rules.

## Running the pipeline

`POST /api/content/run` does the whole thing: enrich every settled post +
regenerate the `what-works.md` AUTO section. The "Next 2 Weeks" strategy card is
computed on read (Insights tab), so nothing extra is persisted.

**Manual run command** (from `admin/`):

```bash
BASE_URL=https://your-admin-url ADMIN_PASSWORD=... npm run content:run
```

**Scheduled runs (Claude Code Routines).** Routines are available in this
environment. Once the app is deployed and reachable, wire a recurring run with
the `create_trigger` tool — a fresh-session Routine whose prompt runs the
command a few times daily, e.g.:

```
name:    Driveverse content pipeline
cron:    0 */8 * * *      # every 8 hours
prompt:  In the DRIVERSE repo, run `cd admin && BASE_URL=<url> ADMIN_PASSWORD=<secret> npm run content:run`, then report what changed.
```

Note: **ingestion stays manual** (no connector), so a schedule automates
enrichment + what-works regeneration only — new numbers still get pasted in by
hand first.

## Model calls

Every model-dependent step (classification, Takeaways, the what-works analysis,
the strategy narrative, the Scriptor, vision reads) goes through one adapter
(`admin/src/lib/content/llm.ts`) that calls the Anthropic Messages API and is
gated on `ANTHROPIC_API_KEY`. **Without the key the pipeline still runs** — each
step falls back to deterministic, numbers-grounded output and flags that a model
wasn't used. The Scriptor never fabricates metrics; gaps become `[FILL: …]`.
