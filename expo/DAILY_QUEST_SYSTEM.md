# Driveverse — Daily Quest System

A **procedural, rule-based** daily-quest engine (no AI). Every 24 hours each
user gets **3 quests — 1 Easy, 1 Medium, 1 Hard** — generated from a catalogue
of parametric **templates**.

Two principles define the system:

1. **Universal / global.** Quests are worldwide by design. They describe generic
   goals — *drive N km*, *drive N m*, *reach N km/h*, *make a new friend*, *take
   a photo* — with no dependency on any specific, country-bound location. There
   are deliberately **no place-based quests** ("visit a café", "visit a mall")
   — the app has no reliable places API to verify a visit against, so that
   objective type doesn't exist. One catalogue serves every user on Earth. The
   "quest day" rolls over at **UTC** midnight so everyone refreshes at the same
   instant.
2. **Auto-completed — never self-marked.** A quest cannot be marked done by the
   user. It finishes **only when its real indicator/calculation reaches the
   target**: distance actually driven, a top speed actually reached, friends
   actually made. Rewards (XP, coins, streak, badges) are granted automatically
   at that moment.

Templates × numeric parameter ranges × time windows produce a large space of
distinct quests without any generative model or location database.

---

## 1. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (Expo / React Native)                                          │
│                                                                        │
│  app/(tabs)/drive.tsx  ──uses──►  hooks/useQuestStore.ts               │
│   (Quests tab UI — no                │  • ensure_daily_quests (RPC)     │
│    "mark complete" button)           │  • record_quest_event   (RPC)    │
│  lib/questEngine.ts  ◄──types────────┘  • realtime subscription        │
│   (shared model, reward mirror,         (daily_quests, stats, badges,  │
│    objective + event registry)           user_xp)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                     │ Supabase JS
┌───────────────────────────────────▼────────────────────────────────────┐
│  Supabase / Postgres  (authoritative backend)                          │
│                                                                        │
│  Catalogue tables     quest_templates · badges  (points_of_interest    │
│                       is optional / unused by the universal set)       │
│  Instance tables      daily_quests · user_quest_stats · user_badges    │
│                                                                        │
│  Functions            ensure_daily_quests()   ← rule-based generator   │
│                       record_quest_event()    ← the ONLY progress path │
│                       _finish_quest()         ← internal auto-complete  │
│                       _apply_quest_xp()       ← server-side levelling   │
│                       award_badges()          ← milestone unlocks       │
│                       expire_stale_quests()   ← pg_cron daily refresh   │
│  Triggers             saved_routes / trips  → drive_distance progress   │
│                                              → reach_speed progress      │
│                       friends (accepted)    → make_friend progress      │
└────────────────────────────────────────────────────────────────────────┘
```

**Why the backend owns progress + completion:** clients can *read* their quests
but there is no UPDATE policy and no self-mark RPC. Progress is written only by
`SECURITY DEFINER` indicator functions, so a quest can never be faked done — it
completes strictly when a real signal meets the target.

---

## 2. Files

| File | Role |
|------|------|
| `database_migration_daily_quests.sql` | Schema, RLS, seed data, generator, indicator/auto-complete functions, triggers, cron. Idempotent — run in the Supabase SQL Editor. |
| `lib/questEngine.ts` | Shared TypeScript model: domain types, difficulty tiers, reward-formula mirror, objective + **event** registry, place-category labels, presentation helpers. |
| `hooks/useQuestStore.ts` | `QuestsProvider` / `useQuests()` — loads today's quests, generates lazily, and exposes `recordEvent` (+ `recordDrive` / `recordPlaceVisit` / `recordPhoto`) as the indicator intake. No manual claim. |
| `hooks/useXPStore.ts` | Reads `user_xp` and subscribes to it via realtime, so server-granted quest XP appears without a client-side apply. |
| `app/(tabs)/drive.tsx` | Quests tab — renders live quests with progress, rewards, and an **"Auto-tracks"** status instead of a claim button. |

---

## 3. Universal quest catalogue

Objectives (`objective_type`) and the real indicator that drives each
(`EVENT_FOR_OBJECTIVE` in `questEngine.ts`):

| Objective | Meaning | Indicator event | Example |
|-----------|---------|-----------------|---------|
| `drive_distance` | Drive N km or N m | `drive_distance` (km; converted to m if the quest's unit is `m`) | "Drive 10 km today" / "Drive 500 m to get moving" |
| `night_drive` | Distance, night-flavoured | `drive_distance` (km) | "Long Haul — 60 km" |
| `reach_speed` | Reach a top speed of N km/h | `reach_speed` (km/h — tracks the best speed seen, not a sum) | "Reach 80 km/h today" |
| `make_friend` | Make N new friends | `make_friend` (+1) | "Make a new friend" |

These three are the *only* objectives the catalogue seeds or the generator
will select — see §10. `photo_capture` still exists in `questEngine.ts`'s
type union and `useQuestStore.ts`'s `recordPhoto()` (neither is wired to any
UI flow — nothing calls `recordPhoto`), but no template produces one, so it
is dead capability, not a live objective.

There are deliberately **no place-based objectives** ("visit a café", "visit a
mall") — the app has no reliable places API to verify a visit against.

The `points_of_interest` table and the `poi_category` / `place_label` /
`{place}` template plumbing remain in the schema for an optional future
location-specific pack, but nothing in the current universal catalogue uses
them.

---

## 4. Generation (`ensure_daily_quests`)

Called lazily by the client when the Quests tab opens. `lat`/`lng` are accepted
only for backward compatibility and are not used (quests are location-agnostic).

1. **Resolve context** — user id, the UTC quest day + time bucket, player level
   from `user_xp`.
2. **Expire** any quests past `expires_at` (self-heals the daily refresh).
3. **Short-circuit** if 3 non-expired quests already exist.
4. **Per difficulty**, pick a template via weighted-random, excluding templates
   seen in the last 7 days (anti-repetition, with fallback), roll a target in
   `[param_min, param_max]` snapped to `param_step`, substitute placeholders,
   compute rewards (`base(difficulty) × reward_multiplier × levelBonus`), and
   insert. `objective_category` records the place kind the indicator must match.

---

## 5. Progress & auto-completion (`record_quest_event`)

`record_quest_event(p_event_type, p_amount, p_category)` is the single progress
path. It advances every active quest whose objective matches the event, and any
quest that reaches its target is completed by `_finish_quest`, which atomically:

- flips the quest to `completed`,
- grants coins, updates streak + counters,
- grants **XP server-side** via `_apply_quest_xp` (same curve as
  `useXPStore.ts`: `xpForLevel(L) = round(100 · 1.6^(L-1))`),
- unlocks any earned badges (`award_badges`, plus template badges).

It is idempotent and cheating-resistant: no client UPDATE policy exists and the
legacy `complete_quest` / `update_quest_progress` functions are dropped.

### Where indicators come from

- **Distance** — a DB trigger on `saved_routes` and `trips` fires
  `drive_distance` with the real `distance_km` the moment a drive is recorded.
  Fully automatic; no client call.
- **Top speed** — the same trigger fires `reach_speed` with the real
  `top_speed_kmh` from the same row. Fully automatic.
- **Friends** — a DB trigger on `friends` fires `make_friend` for both users when
  a friendship becomes `accepted`. Fully automatic.

All three of the catalogue's objectives are now trigger-driven — nothing calls
`record_quest_event` from the client for any live objective. `recordDrive` /
`recordSpeed` remain on the hook as manual escape hatches (harmless, since the
triggers already cover the real path); `recordPhoto` still exists too, but
`photo_capture` is retired from the catalogue (§10) — calling it advances
nothing, because no quest is ever generated for it to advance.

```ts
const {
  quests, activeQuests, allDone,
  coins, streak, badges, earnedBadgeIds,
  generateQuests,     // force (re)generate today's set
  recordEvent,        // recordEvent(eventType, amount?)
  recordDrive,        // recordDrive(km)      → drive_distance (manual; the trigger already covers this)
  recordSpeed,        // recordSpeed(kmh)     → reach_speed (manual; the trigger already covers this)
} = useQuests();
```

Because completion is server-side, quests finish and reward the user even if the
Quests tab is closed; realtime pushes the updated quest, stats, and XP to the UI.

---

## 6. Rewards, progression & badges

- **XP** — granted server-side into `user_xp`; the client XP store mirrors it via
  realtime (single source of truth).
- **Coins** — soft currency in `user_quest_stats.coins`.
- **Streak** — consecutive UTC days with ≥1 completion.
- **Badges** — re-evaluated after every completion; templates may also grant a
  guaranteed badge. Includes a social badge for the new friend quests.

---

## 7. 24-hour refresh

1. **Lazy self-heal** — `ensure_daily_quests` expires stale quests and generates
   a fresh set on the user's first open after UTC midnight.
2. **Scheduled sweep** — `expire_stale_quests()` via `pg_cron` at `05 0 * * *`
   UTC prunes and expires, so returning users always start clean. Optional; the
   lazy path covers refresh on its own.

---

## 8. Extending the system

Adding a new quest type is **additive**:

1. **New mechanic** — insert `quest_templates` rows with a new `objective_type`,
   register it in `OBJECTIVES` and `EVENT_FOR_OBJECTIVE` in `questEngine.ts`, and
   route its event in `record_quest_event`. Wire the indicator (a client call or
   a DB trigger on the real table).
2. **New badges** — insert `badges` rows; `award_badges` evaluates them.
3. **Seasonal / event quests** — set `required_event` on templates and pass the
   matching `p_event` to `ensure_daily_quests`.
4. **Place-based quests** — deliberately not supported yet; the
   `points_of_interest` table and the `poi_category` / `place_label` / `{place}`
   template plumbing are still in the schema for when a real places API exists.

---

## 9. Setup

1. Run `expo/database_migration_daily_quests.sql` in the Supabase SQL Editor
   (idempotent — safe to re-run). It also removes the old self-mark API and
   Indonesia-only sample data.
2. *(Optional)* enable `pg_cron` for the scheduled sweep.
3. The client is already wired: `QuestsProvider` is mounted in `app/_layout.tsx`
   (inside `XPProvider`), and the **Drive → Quests** tab shows live, auto-tracking
   quests. All three remaining objectives — distance, top speed, friends — progress
   automatically via DB triggers; no client call is needed for any of them (see §5).

---

## 10. Legacy place-category quests reached some databases outside this file (7 Aug 2026)

Reported as: the Quests tab showing "Grab a Bite — Stop by a restaurant and
refuel" and "Mall Run — Visit a shopping mall today", neither of which
appears anywhere in this repository — `grep` for either string turns up
nothing, in this file or any other.

Driveverse was bootstrapped from a template project ("Created by Rork" in
the repo description), and quest rows like these reached some databases as
seed data from that scaffold, under ids this migration's own cleanup
sections (16b, 17) had no way to name — those sections delete by a
*guessed* list of ids from this file's own history, which can only ever
cover templates this file itself introduced. A row neither section knows
about survives every re-run indefinitely, and `ensure_daily_quests()`'s
template selection had nothing checking `poi_category` or `objective_type`
before picking — any `is_active` row matching difficulty/level/time/weather
was fair game, template scaffold or not.

Two changes, both in `database_migration_daily_quests.sql`:

- **`ensure_daily_quests()`'s `eligible` CTE** now filters
  `poi_category IS NULL AND objective_type IN ('drive_distance',
  'night_drive', 'reach_speed', 'make_friend')` directly, rather than
  trusting every `is_active` row. This is what actually closes the hole —
  it cannot select a place-category (or photo) row again regardless of
  what is sitting in the table, named however, seeded by whoever.
- **Section 20**, new, deletes any `quest_templates` row by that same
  characteristic rather than by id — catching the untracked scaffold rows
  section 16b/17 couldn't — and expires (not deletes, matching the status
  transition `ensure_daily_quests()` already uses for a quest past its
  `expires_at`) any already-generated `daily_quests` row with the same
  trait, so a quest board showing one of these right now clears the moment
  this file is re-run and the Quests tab is next opened.

`u_easy_photo` (`photo_capture`) is retired in the same pass — not a
place-category quest, but outside the three objectives (distance, speed,
friend) this app is meant to measure without a places API.
