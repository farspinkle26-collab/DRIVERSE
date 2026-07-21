# Driveverse — Daily Quest System

A **procedural, rule-based** daily-quest engine (no AI). Every 24 hours each
user gets **3 quests — 1 Easy, 1 Medium, 1 Hard** — generated from a catalogue
of parametric **templates**.

Two principles define the system:

1. **Universal / global.** Quests are worldwide by design. They describe generic
   goals — *reach/drive N km*, *visit a café*, *visit a mall*, *make a new
   friend*, *take a photo* — using generic **place categories** ("a café", "a
   shopping mall") rather than any specific, country-bound location. One
   catalogue serves every user on Earth. The "quest day" rolls over at **UTC**
   midnight so everyone refreshes at the same instant.
2. **Auto-completed — never self-marked.** A quest cannot be marked done by the
   user. It finishes **only when its real indicator/calculation reaches the
   target**: distance actually driven, friends actually made, places actually
   visited. Rewards (XP, coins, streak, badges) are granted automatically at
   that moment.

Templates × numeric parameter ranges × place categories × time windows produce a
very large space of distinct quests without any generative model or location
database.

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
| `drive_distance` | Reach/drive N km | `drive_distance` (km) | "Drive 10 km today" |
| `night_drive` | Distance, night-flavoured | `drive_distance` (km) | "Long Haul — 60 km" |
| `visit_place` | Visit a place of a category | `visit_place` (+1, category) | "Visit a café" |
| `visit_places` | Visit N different places | `visit_place` (+1, category) | "Café Hop — 3 cafés" |
| `make_friend` | Make N new friends | `make_friend` (+1) | "Make a new friend" |
| `photo_capture` | Take N photos | `photo_capture` (+N) | "Snap 2 photos" |

**Place categories** are generic and worldwide: `cafe`, `restaurant`, `mall`,
`park`, `gym`, `viewpoint`, `landmark`, `fuel`, `ev_station`, `workshop`, `any`.
Templates render them into a friendly phrase via `{place}` (e.g. "a café", "a
shopping mall") — no specific named location is ever required.

The `points_of_interest` table remains for optional future location-specific
packs but is **not used** by the universal set, and its old Indonesia-only sample
rows are removed by the migration.

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
- **Friends** — a DB trigger on `friends` fires `make_friend` for both users when
  a friendship becomes `accepted`. Fully automatic.
- **Place visits / photos** — the client calls `record_quest_event` (via
  `useQuests().recordPlaceVisit(category)` / `recordPhoto(n)`) from a genuine
  check-in or capture action.

```ts
const {
  quests, activeQuests, allDone,
  coins, streak, badges, earnedBadgeIds,
  generateQuests,     // force (re)generate today's set
  recordEvent,        // recordEvent(eventType, amount?, category?)
  recordDrive,        // recordDrive(km)      → drive_distance
  recordPlaceVisit,   // recordPlaceVisit(category) → visit_place (+1)
  recordPhoto,        // recordPhoto(count)   → photo_capture
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
2. **New place category** — just use it in a template's `poi_category` /
   `place_label`; add a label/colour in `PLACE_CATEGORY_LABELS` /
   `PLACE_CATEGORY_COLORS`.
3. **New badges** — insert `badges` rows; `award_badges` evaluates them.
4. **Seasonal / event quests** — set `required_event` on templates and pass the
   matching `p_event` to `ensure_daily_quests`.

---

## 9. Setup

1. Run `expo/database_migration_daily_quests.sql` in the Supabase SQL Editor
   (idempotent — safe to re-run). It also removes the old self-mark API and
   Indonesia-only sample data.
2. *(Optional)* enable `pg_cron` for the scheduled sweep.
3. The client is already wired: `QuestsProvider` is mounted in `app/_layout.tsx`
   (inside `XPProvider`), and the **Drive → Quests** tab shows live, auto-tracking
   quests. Call `recordPlaceVisit` / `recordPhoto` from your check-in and camera
   flows; distance and friends progress automatically via triggers.
