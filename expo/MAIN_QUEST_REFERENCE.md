# The First Mile — the main quest a new driver walks

An eight-step guided chain, run **once per account, ever**, that teaches the
app by making a driver use it. It renders **above** the daily quests on the
Quests tab and puts a notification on the map (the home screen) until it is
finished, then disappears entirely.

This is not a second daily-quest system. `DAILY_QUEST_SYSTEM.md` describes a
procedural generator producing three fresh quests every 24 hours from a
template catalogue; this is eight fixed steps in one fixed order with no
generator, no expiry and no repetition. The two share exactly one thing —
`_apply_quest_xp`, the server-side leveller — so `user_xp` keeps a single
writer and a single curve.

---

## 1. The chain

| # | Step | What it asks | XP | Verified by |
|---|------|--------------|----|-------------|
| 1 | **First Ignition** | Record your first drive | 100 | trigger on `trips` |
| 2 | **Check the Damage** | Open your finished trip and read the stats | 50 | **client** |
| 3 | **Mark Your Territory** | Save your first place | 75 | trigger on `saved_places` |
| 4 | **Know Your Rank** | Open your rank screen | 50 | **client** |
| 5 | **Prove It** | Share your first trip card | 100 | **client** |
| 6 | **Not Alone Anymore** | Friend request, or join a convoy | 150 | trigger on `friends` / `party_members` |
| 7 | **Pick a Fight** | Complete your first daily quest | 100 | trigger on `daily_quests` |
| 8 | **Level Up** | Reach Level 2 *and* finish the chain | 250 + badge | trigger on `user_xp` |

875 XP total. Step 6 is **optional** (§4). Step 8 grants the
**First Mile Complete** badge.

### Files

| File | Role |
|------|------|
| `constants/mainQuests.ts` | The catalogue — ids, copy, XP, icons, which steps are client-reported. Pure, no React. |
| `lib/mainQuest.ts` | The rules — what step to point at, the progress counts, the homepage-nudge condition, the capstone gate. Pure, tested. |
| `lib/__tests__/mainQuest.test.ts` | Pins all of the above, including the XP values the SQL has to match. |
| `database_migration_main_quests.sql` | Ledger table, RLS, XP mirror, the completion function, the client RPC and its whitelist, six triggers, the free first drive, and the backfill. |
| `hooks/useMainQuestStore.ts` | Loads the ledger, keeps it live over realtime, exposes `completeStep`. |
| `components/MainQuestChain.tsx` | The chain, rendered above the daily quests. |
| `components/MainQuestNudge.tsx` | The map's notification card. |

---

## 2. Why the catalogue is TypeScript and not a table

`daily_quests` is generated from `quest_templates` because there has to be a
fresh, non-repeating set every day forever. This is the opposite case: eight
fixed steps, one order, once per account. A template table would buy nothing
and cost a migration every time a line of copy changed.

So the database stores **only which steps a driver has finished** —
`user_main_quests (user_id, step_id, xp_awarded, completed_at)`, append-only,
primary-keyed on the pair. Everything else is derived on the client from the
catalogue.

The one duplicated fact is the XP per step, mirrored in
`main_quest_step_xp()`, because the server has to be the thing that grants
it. **The two must be changed together**; the test file pins the TypeScript
side, and nothing can pin the SQL side from there.

---

## 3. Two classes of step, and the one honest compromise

`DAILY_QUEST_SYSTEM.md` §1 states the rule that quests are "auto-completed —
never self-marked", enforced by there being no client UPDATE policy and no
self-mark RPC. **Five of these eight hold to that exactly.** They are driven
by triggers on real rows and the client is not involved at all.

**Three of them cannot be.** "Open your finished trip and look at the
stats", "open your rank screen" and "share your trip card" are the driver
*looking at something*. No row is written when you read a screen, so there
is nothing for a trigger to fire on. Those three are `verifiedBy: "client"`
and are completed through `complete_main_quest_step(p_step_id)`.

What protects them:

- The RPC **whitelists exactly those three ids in SQL**. Passing
  `first_drive` or `reach_level_2` returns `false` and writes nothing —
  verified against a real Postgres, not assumed.
- It takes **no uid parameter**; it uses `auth.uid()`, so a driver cannot
  complete a step for somebody else.
- The ledger's primary key makes it **idempotent** — a step already done
  grants nothing a second time.

What is genuinely exposed, stated plainly: a modified client could grant
itself those three steps without doing them. That is **200 XP, once per
account, un-farmable** — against a single daily quest that pays 10,000. The
chain cannot be replayed, so the exposure does not scale. Refusing to ship
the tutorial over that would be the wrong trade; pretending it is zero would
be worse.

---

## 4. Step 6 is optional, and why

"Send a friend request or join a convoy" is the one step whose completion
depends on **another person existing**. A driver opening this app in a city
where nobody else has it cannot finish it at any price, and a chain that
dead-ends on an empty map punishes exactly the early adopters it should be
courting.

So it is in the list, it pays its 150 XP when it happens, and it is excluded
from `REQUIRED_STEP_IDS` — the capstone does not wait for it. The UI never
points at it as "next" either (`mainQuestState` skips it when choosing the
current step), so the homepage never nags about something that may be
impossible.

The trigger is also **deliberately looser than the daily quests'
`make_friend`**: a *pending* friend request already counts for the sender.
A new driver reaching out should not have their tutorial held hostage by
whether the other person has opened the app yet.

### The convoy half shipped wrong the first time

The friends half of this step is correctly loose (a pending request already
counts); the convoy half was **too loose in the opposite direction**, and it
shipped that way — caught by re-reading `hooks/usePartyStore.ts` against the
migration rather than trusting the migration in isolation.

`party_members` rows arrive in three shapes: a leader is auto-seated and
`joinParty` (a public convoy, no invite) both `INSERT` straight to
`'accepted'`; `invite_to_convoy` `INSERT`s at `'invited'`, and `acceptInvite`
is a separate `UPDATE` that moves it to `'accepted'`. The first trigger was
`AFTER INSERT` only, with no status check — so it credited the *invitee* the
moment someone else invited them, before they had done anything, including
declining. Being invited is not joining, and the trigger never re-fired on
the actual accept because it wasn't watching `UPDATE` at all.

Fixed to fire on `INSERT OR UPDATE` and gate on `new.status = 'accepted'`
either way. Verified against all four real paths on a local Postgres: the
leader auto-seat and `joinParty` still credit immediately (direct insert at
`'accepted'`); an invite alone credits nobody; accepting credits the
invitee at that point, not before; declining (delete while still
`'invited'`) never credits at all.

---

## 5. The capstone's gate — the subtle one

**`xpForLevel(1)` is 100 (`lib/xpMath.ts`) and step 1 pays exactly 100.**

So "reach Level 2" is satisfied the instant a driver records their first
drive — six steps before they have opened a trip detail screen, saved a
place or completed a daily quest. Left as a pure level check, the payoff
step would fire *first*, and every step it is supposed to reward would land
after its own reward. The chain would be over before it started.

Level 2 is therefore a **floor, not the condition**. The capstone completes
when the level is reached **and every required step is done**
(`main_quest_capstone_ready()`, mirrored client-side by `capstoneUnlocked()`
so the UI can explain the wait). By the time a driver gets there they are
well past Level 2, which is the honest reading of "the payoff step" anyway.

`_complete_main_quest_step` re-checks the gate after *any* step lands, so
finishing the last required step fires the capstone in the same transaction
rather than waiting for the next XP change.

**Verified**: a test driver recorded one drive, hit Level 2, and the capstone
was correctly withheld with `chain_ok = false`; it fired the moment the
sixth required step landed, granting the badge and 250 XP.

---

## 6. The First Ignition drive is free

Step 1's copy promises the tutorial drive does not count against the Regular
tier's 5 drives a month, so **both halves of that cap** had to agree with it:
`drive_quota()` (what the client reads) and `enforce_drive_limit()` (the
trigger). Changing only one produces the worst possible version — a driver
told they have 5 left and refused at 5.

The rule is exact rather than approximated: `main_quest_free_drives(uid)`
returns 1 when the driver's **earliest-ever trip falls inside the current
month**, 0 otherwise. It stops applying by itself next month, because their
first trip is no longer in the window.

Measured on a real Postgres: 1 trip taken → `used 0, remaining 5`; 6 trips
taken → `used 5, remaining 0`; the 7th refused by the trigger. Both halves
agree at every point.

> ⚠ **Lockstep with `database_migration_drive_limit.sql`.** That file also
> defines `drive_quota` and `enforce_drive_limit`, without the discount.
> Whichever file runs last wins. **Re-running the drive-limit migration after
> this one silently removes the free first drive** — re-run this one after
> it. Same trap `platinum_limit()` already carries between the drive-limit
> and platinum migrations.

---

## 7. Existing drivers (the backfill)

Somebody with two hundred trips should not be asked to "record your first
drive". §9 of the migration credits, from rows the database already has,
every step whose evidence exists — `first_drive`, `mark_territory`,
`not_alone`, `first_daily_quest`.

Those rows are written with **`xp_awarded = 0` and no call to
`_apply_quest_xp`**: paying out retroactively would hand a long-standing
driver the whole chain's XP for work they did before the chain existed. They
get the ticks, not the back pay.

The three client-reported steps are **not** backfilled. No row anywhere says
whether someone has opened their rank screen, and guessing would be inventing
history. An existing driver picks those three up the next time they do the
thing, which takes about a minute.

---

## 8. The homepage notification

`components/MainQuestNudge.tsx`, in the map's bottom-left column above the
Live Feed. Shows the current step, `n/8`, and taps through to the Quests tab
(`/(tabs)/drive?view=quests`, with an `at` nonce because the Drive Hub stays
mounted and an unchanged param would be a no-op on a second tap).

It hides itself in three cases, and the third is the one that matters:

1. the chain is finished,
2. the driver is signed out,
3. **progress has not loaded yet.**

(3) needs to be its own condition rather than inferred: before the first
fetch resolves, "no completed steps" and "brand-new account" are the same
empty array, so a nudge driven off the array alone would flash on every cold
start for a driver who finished the chain months ago. `shouldNudge` takes
`loaded` explicitly for exactly this.

There is deliberately **no dismiss control**. The thing it points at is
finishable in a few minutes and then gone for good; a dismiss would only
create a way to lose the tutorial permanently by accident.

### The step ran, the screen didn't know — the exact risk flagged in advance

The device pass called out one unverified risk above anything else: "the
chain only updates live if the `user_main_quests` subscription is
delivering." It was the first thing that broke. Reported as: a driver saved
a territory pin, and the First Mile still showed step 3 undone.

The trigger fired and the ledger row was written — this was never a trigger
bug. `hooks/useMainQuestStore.ts` subscribes to `postgres_changes` on
`user_main_quests`, and Supabase only pushes those events for tables
explicitly added to the `supabase_realtime` publication. The migration
never did that. Every other realtime-backed table in this app has the
matching `ALTER PUBLICATION supabase_realtime ADD TABLE …` somewhere —
`daily_quests` / `user_quest_stats` / `user_badges` / `user_xp`
(`database_migration_daily_quests.sql` §16), `direct_messages` / `friends`
(`database_migration_profile_v2.sql`) — and `user_main_quests` was the one
left out.

The failure mode this produces is worse than a normal missed update: the
client's *only* refresh path besides realtime is `MainQuestProvider`'s
mount effect, and that provider is mounted once at the app root and never
remounts on navigation. So progress a driver just made looked permanently
stuck — not stale for a few seconds, stuck until the app was force-quit and
relaunched — because there was never going to be a second chance for the
client to ask again.

Fixed with the same `ALTER PUBLICATION` statement, in the same idempotent
`EXCEPTION WHEN duplicate_object` shape §16 already uses. Verified against a
local Postgres with a stub `supabase_realtime` publication: the table is
correctly added, and re-running the migration is still a clean no-op.

### The store-review prompt rides on this chain now

App Store Guideline 5.6.3: the native rating sheet must not fire before the
driver has a real basis to judge the app. It used to fire mid-onboarding,
at the midpoint of `app/customize-profile.tsx`'s account-setup flow —
Apple rejected the app for exactly that. See `lib/storeReview.ts`'s header
for the full account.

It now fires once, the first time a driver has completed
`REVIEW_MILESTONE_STEP_COUNT` (3) First Mile steps —
`hooks/useMainQuestStore.ts` is the one call site, since it already tracks
`state.completed` live. Every First Mile step requires having actually
used a real feature, strictly after onboarding ends, so the milestone
cannot be reached during onboarding or on first launch by construction.
An AsyncStorage flag (`driverse:review-prompted`) makes it fire exactly
once per install rather than re-crossing the threshold on every cold
start once the milestone is behind the driver.

The milestone's XP is granted by the SQL triggers earlier in this
document, with no awareness this prompt exists — the reward is for
reaching the milestone, not for reviewing, and is unconditional on
whether `requestStoreReview()` actually shows anything (the OS may
decline silently; the module may be unlinked; the platform may be web).

---

## 9. Setup

1. Run `database_migration_main_quests.sql` in the Supabase SQL Editor.
   Idempotent — safe to re-run. It must run **after**
   `database_migration_daily_quests.sql` (for `badges` and `_apply_quest_xp`),
   `database_migration_platinum.sql`, and `database_migration_drive_limit.sql`
   (see the lockstep warning in §6).
2. Nothing else. `MainQuestProvider` is already mounted in `app/_layout.tsx`
   inside `QuestsProvider`, and both UI surfaces render themselves away when
   the chain is done.

---

## 10. Verifying it on a device

The whole chain, in order, on a fresh account:

1. **Map** — the First Mile card should be above the Live Feed, reading
   `0 / 8`, "Next: First Ignition". Tap it: the Drive Hub opens on Quests
   with the chain above the daily set.
2. **Record a drive.** Step 1 ticks without you doing anything else; XP goes
   to 100 and the level to 2. The chain should now read `1 / 8` and the
   capstone must still be unticked — that is §5 working.
3. **Open that trip** from the Drive Hub. Step 2 ticks on load. Opening
   *someone else's* shared trip must not tick it.
4. **Save a place** — star a cafe, or long-press the map and name a pin.
   Either satisfies step 3.
5. **Profile → your rank.** Step 4 ticks on arrival.
6. **Share a trip card** (any destination, including Save PNG). Step 5.
   Sharing a *rank* card must not tick it.
7. **Friend request or convoy** — step 6, optional; skip it and the chain
   must still be finishable.
8. **Complete a daily quest** — step 7. The moment it lands, step 8 should
   fire in the same beat: badge granted, chain reads `7 / 8` or `8 / 8`, and
   both the map card and the chain section disappear on the next load.

Server-side checks are listed at the bottom of the migration file (§11
there), including the two calls that must return `false`:

```sql
select public.complete_main_quest_step('first_drive');    -- false
select public.complete_main_quest_step('reach_level_2');  -- false
```

### Not yet verified on a device

Everything above was verified against a local Postgres 16 (triggers, the
whitelist, the capstone gate, the free-drive arithmetic, idempotent re-runs,
and the backfill against a pre-existing database) and by the pure-rule test
suite. **The device pass in §10 has not been run.** The realtime gap this
section used to flag as unverified turned out to be real — see §8's writeup
— and is now fixed, but a full device pass is still owed.
