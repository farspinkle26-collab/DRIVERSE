# Driveverse — Daily Quest System

A **procedural, rule-based** daily-quest engine (no AI). Every 24 hours each
user gets **3 personalised quests — 1 Easy, 1 Medium, 1 Hard** — generated
from a catalogue of parametric **templates** combined with a **Point-of-Interest
(POI) database**. Templates × POIs × numeric parameter ranges × time windows
produce **millions of distinct quest combinations** without any generative model.

Rewards are **XP, coins, badges, and streak progression**. Generation runs
**server-side in Postgres** so it is atomic, scalable to millions of users, and
schedulable with `pg_cron`.

---

## 1. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (Expo / React Native)                                          │
│                                                                        │
│  app/(tabs)/drive.tsx  ──uses──►  hooks/useQuestStore.ts               │
│   (Quests tab UI)                   │  • ensure_daily_quests (RPC)      │
│                                     │  • complete_quest       (RPC)     │
│  lib/questEngine.ts  ◄──types───────┘  • update_quest_progress(RPC)     │
│   (shared model, reward mirror,        • realtime subscription         │
│    objective registry, formatting)                                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                     │ Supabase JS
┌───────────────────────────────────▼────────────────────────────────────┐
│  Supabase / Postgres  (authoritative backend)                          │
│                                                                        │
│  Catalogue tables     quest_templates · points_of_interest · badges    │
│  Instance tables      daily_quests · user_quest_stats · user_badges    │
│                                                                        │
│  Functions            ensure_daily_quests()   ← rule-based generator   │
│                       complete_quest()        ← claim / rewards        │
│                       update_quest_progress() ← incremental progress   │
│                       award_badges()          ← milestone unlocks      │
│                       expire_stale_quests()   ← pg_cron daily refresh  │
└────────────────────────────────────────────────────────────────────────┘
```

**Why generation lives in SQL:** it keeps quest creation atomic (one round-trip,
no race between three inserts), lets a single `pg_cron` schedule cover every
user, and scales horizontally with the database. The TypeScript layer owns only
*types* and *presentation*, so the two never drift on business rules.

---

## 2. Files

| File | Role |
|------|------|
| `database_migration_daily_quests.sql` | Schema, RLS, seed data, generation + reward functions, cron. Run once in the Supabase SQL Editor. |
| `lib/questEngine.ts` | Shared TypeScript model: domain types, difficulty tiers, reward-formula mirror, objective-type registry, presentation helpers. |
| `hooks/useQuestStore.ts` | `QuestsProvider` / `useQuests()` context hook — loads today's quests, generates lazily with live location, tracks progress/claims, coins/streak/badges, realtime. |
| `app/(tabs)/drive.tsx` | Quests tab — renders live quests with progress, rewards, difficulty pills, claim buttons, coins & streak. |

---

## 3. Database schema

### Catalogue (read-only to clients)
- **`quest_templates`** — parametric blueprints. Key columns:
  - `difficulty`, `category`, `objective_type`
  - `title_template` / `description_template` with placeholders
    `{target}`, `{unit}`, `{poi}`, `{category}`, `{window}`
  - `poi_category` (NULL = no POI, `'any'` = any POI)
  - `param_min` / `param_max` / `param_step` / `unit` — the rolled numeric target
  - Eligibility: `min_level`, `max_level`, `time_windows[]`, `weather`, `required_event`
  - `reward_multiplier`, `badge_id`, `weight` (weighted-random selection), `is_active`
- **`points_of_interest`** — `landmark | cafe | viewpoint | route | workshop | fuel | ev_station`, with `latitude/longitude`, `city`, `min_level`, `weight`.
- **`badges`** — unlock criteria: `total_completed | streak | difficulty_completed | category_completed | coins_earned | manual`.

### Per-user instance tables
- **`daily_quests`** — one generated quest per `(user_id, quest_date, difficulty)`.
  Stores rendered `title`/`description`, `target`/`progress`, `xp_reward`/`coin_reward`,
  `status` (`active | completed | expired`), `expires_at`, and a
  `generation_context` snapshot (level, time bucket, weather, event, POI distance).
- **`user_quest_stats`** — `coins`, `total_completed`, `current_streak`,
  `longest_streak`, `last_completed_date`, and a `counters` JSONB of
  per-difficulty / per-category tallies (drives badge criteria).
- **`user_badges`** — badges a user has unlocked.

All per-user tables are protected by **Row Level Security** (owner-scoped);
catalogue tables are world-readable; all writes flow through `SECURITY DEFINER`
functions.

---

## 4. Generation algorithm (`ensure_daily_quests`)

Signature: `ensure_daily_quests(p_lat, p_lng, p_weather, p_event)` → the day's quests.

Called lazily by the client when the Quests tab opens (passing the device's live
coordinates and optional weather/event tags). Steps:

1. **Resolve context** — user id (`auth.uid()`), the *quest day* and *time-of-day
   bucket* in `Asia/Jakarta`, and the **player level** from `user_xp`.
2. **Expire** any of the user's quests past `expires_at` (self-heals the 24h
   refresh even if the cron job never runs).
3. **Short-circuit** — if 3 non-expired quests already exist for today, return them.
4. **For each difficulty** (easy, medium, hard) generate one quest:
   - **Template pick** — filter `quest_templates` by difficulty, level range,
     current time window, and optional weather/event. Remove templates the user
     saw in the last **7 days** (anti-repetition); if that empties the pool, fall
     back to the full eligible set. Draw one via **weighted-random**
     (`ORDER BY -ln(random())/weight`).
   - **POI pick** (if the template needs one) — filter POIs by required category
     and level, compute **haversine distance** to the user, exclude POIs used in
     the last **5 days**, prefer those within **40 km**, take the nearest 8, then
     pick one at (weighted) random. Falls back gracefully when location is absent
     or nothing is nearby.
   - **Roll target** — a value in `[param_min, param_max]` snapped to `param_step`.
   - **Render** — substitute placeholders into title/description.
   - **Rewards** — `base(difficulty) × reward_multiplier × levelBonus`, where
     `levelBonus = 1 + min(level,100)·0.01` (mirrored in `questEngine.ts`).
   - **Insert** with `ON CONFLICT (user_id, quest_date, difficulty) DO NOTHING`.

The algorithm considers every factor the brief asks for: **player level, current
location, nearby POIs, previously served templates/locations, time of day**, and
optional **weather** and **special events**.

### Scale

With ~20 templates per difficulty, ~25 POIs, several numeric parameter values per
template, and 5 time buckets, the reachable combination space is already in the
**hundreds of thousands per difficulty** and grows multiplicatively as templates
and POIs are added — comfortably into the millions. Seasonal/event templates
(gated by `required_event`) layer on top without touching generation code.

---

## 5. Rewards, progression & badges

- **XP** — returned by `complete_quest` and applied through the existing
  `useXPStore` / `user_xp` pipeline, so levelling has a single source of truth.
- **Coins** — a soft game currency granted atomically in `complete_quest`
  (`user_quest_stats.coins`).
- **Streak** — consecutive days with ≥1 completion; `current_streak` /
  `longest_streak` maintained on completion.
- **Badges** — `award_badges` re-checks every criterion after each completion and
  unlocks any newly-earned badge; templates may also grant a guaranteed badge.

`complete_quest` is **idempotent** — claiming an already-completed quest awards
nothing and returns `awarded = false`, so double-taps and retries are safe.

---

## 6. 24-hour refresh

Two mechanisms keep quests fresh every day:

1. **Lazy self-heal** — `ensure_daily_quests` expires stale quests and generates a
   new set on the user's first open after the daily boundary. This needs the
   user's live location, so it is the primary path.
2. **Scheduled sweep** — `expire_stale_quests()` (via `pg_cron` at `05 17 * * *`
   UTC = just after Jakarta midnight) flips yesterday's quests to `expired` and
   prunes rows older than 30 days, so returning users always start clean.

If `pg_cron` isn't enabled the system still works — the lazy path covers refresh;
the cron is an optimisation.

---

## 7. Extending the system (future quest types & seasons)

Adding a new quest type is **additive**:

1. **New mechanic** — insert `quest_templates` rows with a new `objective_type`,
   then register that type in `OBJECTIVES` in `lib/questEngine.ts` so the UI can
   render its progress. No generator changes.
2. **New locations** — insert `points_of_interest` rows; templates referencing
   that category pick them up immediately.
3. **New badges** — insert `badges` rows; `award_badges` evaluates them
   automatically.
4. **Seasonal / event quests** — set `required_event` on templates and pass the
   matching `p_event` tag (e.g. `'independence_day'`, `'night_rally'`) from the
   client when the event is live. Use `weather` similarly for weather-gated quests.

---

## 8. Setup

1. Open the Supabase **SQL Editor** and run
   `expo/database_migration_daily_quests.sql` (idempotent — safe to re-run).
2. *(Optional)* enable the `pg_cron` extension for the scheduled sweep; the
   migration registers the job automatically when the extension is present.
3. The client is already wired: `QuestsProvider` is mounted in
   `app/_layout.tsx` (inside `XPProvider`), and the **Drive → Quests** tab shows
   the live daily quests.

### Client usage

```ts
const {
  quests, activeQuests, allDone,
  coins, streak, badges, earnedBadgeIds,
  generateQuests,      // force (re)generate today's set
  updateProgress,      // updateProgress(questId, progress)
  completeQuest,       // completeQuest(questId) → { result, error }
} = useQuests();
```

`updateProgress` is the hook game systems call as the player drives / checks in
at POIs (distance tracker, POI arrival, photo capture, event join). When a
quest's progress reaches its target, the UI surfaces **Claim Reward**, which
calls `completeQuest` to grant XP, coins, and any earned badges.
