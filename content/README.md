# Driveverse content store

This directory is the **git-committed data store** for the content-performance
dashboard at `/content` in the admin app (`admin/`). It is plain files on
purpose: every post, the account snapshot, and the learned playbook live in
version control alongside the code, so history is auditable and diffs are human
-readable.

```
content/
  posts/*.md              one Markdown file per post (frontmatter + body sections)
  scripts/*.md            one Markdown file per POV script — see /content/scripts
  scripts/_history/{id}/  previous versions of that script's body, newest last
  account.json            per-platform followers + 30-day funnel + demographics
  what-works.md           learned playbook (machine section fenced; prose is yours)
  marketing/schedule.json product build order, weekly content calendar, 4-week
                          rollout plan, and the results log — see /marketing
                          in the admin app
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
permalink: string         # generic single link; back-filled from the platform link below
title: string             # planning-sheet "Judul Content"
date: YYYY-MM-DD          # scheduled: future post date. published: when it went live.
time: "HH:MM"
weekday: string
pillar: garagey | pov_daily | fake_scripted_pov | ai_supercars | tips_tricks
format: string            # "Jenis Konten": "car showcase", "reels", "listicle", "ai render"
feature_shown: string     # "live map", "trip card", "garage card", "none", …
hashtags: string          # planning-sheet "Hashtag" — the raw line, as posted
link_instagram: string    # planning-sheet "Link Post Instagram"
link_tiktok: string       # planning-sheet "Link Post TikTok"
duration_seconds: number
views: number
reach: number
likes: number
comments_total: number
comments_seeded: number            # the 3–4 seeded "Driveverse?" comments
comments_organic_pickup: number    # REAL unprompted "what app is this?" asks
saves: number
shares: number
engagements: number       # the platform's own interactions total; 0 = not reported
avg_watch_time: number
new_follows: number
save_rate: number         # computed: saves / views
engagement_rate: number   # computed: interactions / views (see below)
hold_rate: number         # computed: avg_watch_time / duration_seconds
---
```

**`engagement_rate` has two numerators.** Instagram and TikTok each report one
"interactions" total that does not always equal likes+comments+saves+shares —
it counts things we don't track per post. When `engagements` is filled in, it's
the truer numerator and it wins; when it's 0 the rate falls back to summing the
components. Either way the rate is computed, never read from the file.

A piece is usually cross-posted, so the two `link_*` fields hold one URL each,
mirroring the planning sheet's two link columns. `permalink` stays the generic
single link the post detail page and the ingest source speak: when it's empty on
write it's back-filled from whichever `link_*` matches the row's `platform`, and
on read a legacy file that only has `permalink` surfaces it in that same column.

`status: scheduled` posts omit every metrics field entirely (nothing to report
yet) — only the planning fields (`status`/`platform`/`post_id`/`permalink`/
`title`/`date`/`time`/`weekday`/`pillar`/`format`/`feature_shown`/`hashtags`/
`link_instagram`/`link_tiktok`) are written. The dashboard never counts a
Scheduled post into views/saves/engagement aggregates; it only shows up in the
Overview "Upcoming" list until it's edited to `status: published` (via the
Edit Post form, the table's Status cell, or `/content/ingest`), at which point
real metrics can be added. Entering a metric on a Scheduled post is rejected
rather than accepted-then-dropped.

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

## The content plan table

`/content` → Overview → **Content plan** is the editable grid over these files.
Its columns and their order follow the Content Planning sheet — No, Tanggal
Publish, Platform, Judul Content, Caption, Hashtag, Jenis Konten, Link Post
Instagram, Link Post TikTok, Status — with the four per-post numbers (views,
likes, comments, engagements) inline-editable beside them. Everything else the
store holds (saves, reach, shares, follows, seeded/organic, duration, watch
time, the rates) is on the same rows, hidden by default behind **Columns**.

Every cell writes through `PATCH /api/content/posts/[slug]` with just the one
field it owns (`admin/src/lib/content/patchPost.ts` validates and applies it).
That matters: a cell edit can't clobber a field the editor never knew about, the
way rebuilding the whole post from a form payload would. Commits on Enter or
blur, reverts on Escape.

Two things are deliberately **not** editable in the grid:

- **The `*_rate` columns.** They're computed from the counters on every read and
  write — a rate you can hand-edit is a rate that can disagree with its own
  numerator.
- **Metrics on a Scheduled post.** Those fields are never persisted for a
  scheduled row, so accepting a number there would silently drop it. The cell
  shows a dash until Status is flipped to Published; the API rejects it as a
  backstop.

New rows come from **+ Add post** (the same form, which also takes the planning
fields), and the grid exports to CSV with whatever columns are visible.

## POV script files (`scripts/*.md`)

POV is the flagship pillar, so it has its own pipeline at `/content/scripts` in
the admin app — separate from the general Scriptor (`/content/scriptor`), which
generates one-off scripts for any pillar and persists nothing. A POV script is a
document with a life: it starts as an idea, gets drafted and refined, gets filmed
from, and ends up linked to the post it became.

```yaml
---
id: string                       # = the filename without .md (the filename wins)
title: string                    # working title, NOT the video's on-screen text
pov_type: solo | social          # solo = one driver; social = meeting another driver
status: idea | drafted | ready_to_film | filmed | posted
feature_shown: live_map | trip_card | quest_notification | garage | none
hook: string                     # the chosen hook line, short
hook_variants_considered: number # how many alternates were generated
created_date: YYYY-MM-DD
filmed_date: YYYY-MM-DD | null   # back-filled when status reaches filmed/posted
linked_post: string | null       # post slug or permalink, once posted
platform_target: instagram | tiktok | both
---
```

`feature_shown` is a **closed vocabulary** here (unlike the post store's free-text
field): the rotation rule below can only be computed over a fixed set, and free
text would quietly split `live_map` from `live map`. A hand-written file using the
post store's spelling (`"garage card"`, `"quest/xp notification"`) is coerced onto
the nearest id on read.

Body sections (level-2 headings; unknown sections round-trip untouched):

```
## Hook Options        (every variant generated — the discarded ones stay here)
## Script              (the full spoken/visual script)
## On-Screen Text
## Visual Direction    (camera angle, mount position, when the app moment lands)
## Filming Checklist   (markdown task list: - [ ] / - [x])
## Notes
```

### What the dashboard computes (no model, no API key)

Everything "smart" in this section is either pure computation over the files you
already have, or a **Copy Prompt** button you paste into a Claude chat with a
paste-back field for the reply. Each prompt is built by its own function in
`admin/src/lib/content/scriptPrompts.ts`, never inlined into a component, so
wiring a real API key later is a one-line swap per feature and no UI changes.

- **Feature rotation** (`scriptRules.ts` → `featureRotation`). Which screens the
  last 5 scripts used, across both POV types; recommends an unused feature (else
  the least recently used) and warns — never blocks — when your pick repeats the
  immediately preceding script. This is "never the same screen twice running",
  enforced by being impossible to miss at the moment you choose.
- **Hook repetition** (`recentPovHooks`, `similarHooks`). The last 5 POV hooks
  regardless of status, pinned above the editor the whole time you're drafting,
  with a crude shared-word check flagging a draft that's circling one of them.
- **Solo vs Social gating** (`densityGate`). Every Social script carries a banner:
  Social POV needs real density or it's staged. The live driver count comes from
  the `user_locations` presence table using the same 90-second staleness rule the
  app uses (`expo/hooks/onlineUsersMerge.ts`); when the table can't be read the
  banner says so rather than implying a number. It never blocks creation.
- **Filming checklist** (`checklistFor`). Generated from POV type + feature at
  creation. Changing either offers a **Sync** that merges: existing ticks
  survive and hand-added items are kept.
- **Performance loop** (`scriptPerformance.ts`). Once `linked_post` resolves to a
  real post, that post's save rate vs. its **own pillar's** median plus organic
  pickup come back onto the script — and onto its Posted card on the board. A
  linked post that's still Scheduled reports "no metrics yet"; nothing is
  estimated.

### The board, the editor, and filming mode

- `/content/scripts` — the Kanban board (Idea → Drafted → Ready to Film → Filmed
  → Posted). Drag a card to set `status`; the ‹ › buttons on each card do the
  same thing without a mouse. A **List** view over the same filtered set gives
  the standard table (sortable, column toggles, CSV) and the filters —
  POV type, status, feature, platform, date range, text search over
  title/hook/script — apply to both views.
- `/content/scripts/[id]` — the editor. No Save button: every control PATCHes the
  one field it owns (`PATCH /api/content/scripts/[id]`), the same rule the content
  plan grid follows, so two people editing different parts of one script can't
  clobber each other.
- `/content/scripts/[id]/teleprompter` — filming mode. Full-screen, large text,
  auto-scrolling at an adjustable px/second; tap anywhere to start/stop (space,
  ↑/↓ and `R` from a keyboard). It shows **only the spoken lines**: when the
  script quotes its dialogue, only the quoted spans are read, so a bracketed beat
  line stays direction rather than ending up on the prompter. Visual direction,
  on-screen text and outstanding checklist items live in a collapsible reference
  panel outside the scroll — that's read before rolling, not on camera.

### Version history

Every write that moves a **prose** section (Hook Options, Script, On-Screen Text,
Visual Direction, Notes) snapshots the whole previous file into
`scripts/_history/{id}/{YYYYMMDDThhmmssSSSZ}.md` first. Full snapshots, not an
in-file log: the working file stays a document you can film from, a refine stays a
one-file diff, and Restore is a copy rather than a parse of history nested inside
the thing being restored. Restore snapshots the current version too, so reverting
a bad refine is itself revertible.

Ticking a checklist box does **not** snapshot — that's execution state, and one
version per checkbox click would bury the versions that matter. Frontmatter-only
changes (a Kanban drag, linking a post) don't snapshot either.

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
