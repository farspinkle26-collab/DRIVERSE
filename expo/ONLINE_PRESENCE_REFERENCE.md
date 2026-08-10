# Online presence — how drivers see each other on the map

`hooks/useOnlineUsers.ts` is what puts other drivers' markers on
`app/(tabs)/map.tsx`. This file records how it works and, more importantly,
what it does when the live connection is not there — because that case used to
be invisible.

---

## 1. The bug this design exists to prevent

Two phones, two accounts, parked next to each other. Both showed **"VISIBILITY
ON"**. Neither showed the other. Nothing was logged, nothing was retried, and
nothing in the UI hinted at a fault — the banner read *"No other drivers near
you yet"*, which is the same sentence it shows on an empty road.

The cause is structural, not a typo: the map had exactly **one** source of
other drivers, a Supabase Realtime Presence websocket, and every failure of
that socket was swallowed.

- `.subscribe()`'s status callback only handled `SUBSCRIBED`. `CHANNEL_ERROR`,
  `TIMED_OUT` and `CLOSED` fell on the floor.
- `setIsOnline(true)` ran unconditionally, so the banner claimed the driver
  was on the map whether or not the join ever landed.
- `channel.track()` returns `'ok' | 'timed out' | 'error'` rather than
  throwing. The result was discarded, so a joined-but-wedged channel — you
  are on the map to yourself and to nobody else — looked identical to success.
- The upsert to `user_locations` was wrapped in `try {} catch {}` with a
  `// Silent` comment. An RLS or schema failure there is precisely "no other
  device can find me", and it was unobservable.
- Backgrounding the app dropped the socket and stopped the broadcast
  interval. Nothing woke either one back up.

A websocket is the first thing to die on a phone: captive portals, carrier
NAT, backgrounding, a Supabase project with Realtime paused or over quota. The
design below assumes it *will* fail and stays useful when it does.

---

## 2. Two paths, both always running

| | Path 1 — presence | Path 2 — directory |
|---|---|---|
| Transport | Realtime websocket, channel `online-players` | plain HTTP (PostgREST) |
| Read | `channel.presenceState()` on sync/join/leave | poll `user_locations` every 10 s |
| Write | `channel.track(payload)` every 4 s | `upsert` into `user_locations` every 4 s |
| Latency | instant | up to one poll interval |
| Carries identity? | yes — name/level/avatar ride in the payload | no — resolved from `profiles` + `user_xp` |

Path 2 is not redundancy for its own sake. It is the difference between "a few
seconds late" and "silently broken", and it costs one indexed query per ten
seconds. `user_locations` was already being written on every tick; it simply
was never read back by anyone.

Both lists are folded by `mergeOnlineUsers` (`hooks/onlineUsersMerge.ts`,
unit-tested in `hooks/__tests__/`):

- keyed by `user_id`, so a driver visible on both paths appears **once**;
- the newer `updated_at` wins — presence normally, but right after a rejoin
  the polled row can genuinely be ahead, and preferring presence blindly would
  snap the marker backwards;
- anything older than `STALE_AFTER_MS` (90 s) is dropped on both paths, so a
  killed app leaves the map instead of sitting there as a marker nobody can
  reach.

### Identity on the fallback path

A `user_locations` row is coordinates and nothing else, so drivers found that
way would otherwise all render as "Driver · Lv. 1". `resolveProfiles` reads
`profiles(name, avatar)` and `user_xp(level)` for exactly the ids it hasn't
seen in the last five minutes, and caches them. That is what keeps the marker,
the name plate, the level badge and the driver sheet (which opens
`/user/[id]`) correct no matter which path a driver arrived on.

---

## 3. Connection state

`useOnlineUsers` exposes `connection`, and the map banner reads it:

| | meaning | banner |
|---|---|---|
| `offline` | visibility off | "VISIBILITY OFF" |
| `connecting` | presence channel joining | — |
| `live` | joined; other drivers arrive instantly | "No other drivers near you yet" |
| `degraded` | socket down, retrying; the sweep is carrying the map | "Reconnecting to the live map…" |

The point of `degraded` is that an empty map now says *which* empty it is.

**Rejoin** is backed off — 2 s, 5 s, 10 s, 20 s, 30 s — and reset on a
successful join. Two guards keep it from eating itself:

- the subscribe callback ignores replies from a channel that has already been
  replaced (`channelRef.current !== channel`), because tearing a channel down
  reports `CLOSED` and that would otherwise read as a live channel dropping;
- `wantOnlineRef` holds the user's *intent*, so a retry that fires after the
  driver hid themselves does not drag them back onto the map.

`track()` is only called while `channel.state === "joined"`. Tracking a
channel that is still joining times out on its own and would trigger a
pointless rejoin; the subscribe callback publishes as soon as the join lands.

**Foreground recovery**: an `AppState` listener calls `refresh()` when the app
becomes active — sweep the directory, rejoin if the channel isn't joined,
re-publish position.

---

## 4. Failure surfaces, deliberately

Every failure now logs under a `[onlineUsers]` prefix: channel status,
`track` status, the `user_locations` upsert, the sweep, the profile lookup,
a denied location permission, and — since §6 — `untrack` status and the
`is_online: false` update on going offline, which were the one pair of calls
in this file still failing silently. In the dev overlay these read the same
way `[placesApi]` does. Silence in that log is now meaningful.

Two schema-tolerance notes:

- `problem_type` / `problem_since` come from
  `database_migration_problem_signal.sql`. A project that hasn't run it
  answers `42703` (undefined column); the hook notices once, drops the two
  columns from both the select and the upsert, and carries on with positions.
- The sweep depends on `database_migration_online_users.sql` having been run
  and on its SELECT policy (`auth.role() = 'authenticated'`). If that policy
  is missing or the table isn't there, the sweep logs and the map falls back
  to presence alone — the previous behaviour, but now with a reason in the log.

---

## 5. Checking it on two devices

1. Both accounts signed in, visibility on, within 90 s of each other.
2. Each should see the other's marker with the right **name, level and
   avatar**, and tapping it opens their profile.
3. Kill Realtime (airplane mode for a few seconds, or pause Realtime in the
   Supabase dashboard): the banner should go to "Reconnecting to the live
   map…" and the markers should keep updating on the ~10 s sweep.
4. `select user_id, is_online, updated_at from user_locations order by
   updated_at desc;` — both devices must have rows ticking every few seconds.
   A device missing from that table is failing to publish, which no amount of
   fixing on the *reading* side will show.

---

## 6. Going offline was not symmetric with going online (7 Aug 2026)

Reported as: A turns visibility off; A correctly sees nobody, but B still
sees A on the map.

**The fallback sweep only ever added drivers, never removed one.**
`fetchDirectory` has always filtered `is_online: true` when *populating* the
map — the fix for "presence is dead, show them anyway" from §1. But nothing
symmetric existed for the opposite direction: if `goOffline`'s
`channel.untrack()` timed out or errored — the exact failure category
`publishPosition`'s `track()` already has to guard against and rejoin on —
the leave broadcast never reached other devices, and their `presenceUsers`
kept A's last-tracked entry exactly as it was. `mergeOnlineUsers` has no
opinion on *why* a presence entry exists, only whether its timestamp is
still fresh (`STALE_AFTER_MS`, 90 s) — so a lost `untrack()` left A visible
to everyone else for up to 90 seconds at minimum, and indefinitely if the
server-side presence state never independently noticed the socket was gone.

Two things made this invisible rather than merely present:

- `goOffline`'s `untrack()` and the `is_online: false` update were both
  wrapped in `catch { /* Silent */ }` — the one pair of calls in this file
  that didn't follow its own "every failure logs" rule (§4). A failure here
  produced no error anywhere, on either device.
- `mergeOnlineUsers`'s own tests (`hooks/__tests__/onlineUsersMerge.test.ts`)
  pin "no ghosts" only for the *time-based* staleness case — a driver whose
  presence entry has aged past `STALE_AFTER_MS`. Nothing pinned "a driver who
  explicitly went offline, with a presence entry that is still fresh by the
  clock" — which is exactly the case a lost `untrack()` produces, and exactly
  the case the existing test suite had no way to catch.

**The fix has two parts, in `hooks/useOnlineUsers.ts` and
`hooks/onlineUsersMerge.ts`:**

1. `goOffline`'s `untrack()` and `is_online: false` update both log on
   failure now, matching every other call in the file.
2. `fetchDirectory` runs a second query alongside the existing one — rows
   that just flipped to `is_online: false` (the `updated_at` trigger means a
   just-flipped row is the *newest* one, not a stale one, so this always
   catches a go-offline within one ~10 s poll interval on every other
   device) — and calls the new pure `pruneRecentlyOffline` to drop those ids
   out of `presenceUsers` directly. This is the fallback path doing for
   *disappearing* what it already did for *appearing*: `user_locations` is
   the one signal unaffected by presence's own failure mode, so it gets to
   override a stale presence entry instead of only ever supplementing an
   absent one.

Net effect: even in the worst case — `untrack()` silently lost, presence
never independently notices — a driver who turns visibility off is gone from
every other device within one poll interval, not "eventually, maybe." Tested
in `hooks/__tests__/onlineUsersMerge.test.ts`.

---

## 7. Every other driver showed "Lv. 1" (10 Aug 2026)

Reported as: the level under a driver on the map not matching the level that
driver's profile page shows.

Two independent causes, one in the database and one in this file.

### 7a. The database one — an RLS policy, not a bug in this code

`user_xp` is created by `database_migration_profile_v2.sql` with SELECT
restricted to `auth.uid() = user_id` — **your own row only**. Both paths that
resolve another driver's level read that table (`resolveProfiles` on the
fallback path; `goOnline` for the level you broadcast), so on a database where
only that migration has run, the query returns *no row* for anybody else and
the `?? 1` fallback renders every other driver at level 1 — while your own
profile, reading your own row, is correct. Nothing errors; RLS filters rows,
it does not fail loudly.

`database_migration_garage_and_public_profiles.sql` is what opens it:

```sql
CREATE POLICY "XP is viewable by any signed-in driver" ON public.user_xp
  FOR SELECT USING (auth.role() = 'authenticated');
```

Postgres RLS policies are permissive and OR'd together, so the own-row policy
staying in place is harmless. The same migration does this for `profiles`,
`car_collections` and `user_quest_stats` — which is why a database missing it
also shows other drivers as "Driver" with an empty garage. **If levels on the
map are wrong, check this policy before reading any of the code below.**

### 7b. The code one — the broadcast level was read once per session

`goOnline` loaded `profileRef.current.level` from `user_xp` and nothing ever
refreshed it. A driver who levelled up while the app was open kept
broadcasting the level they joined at: their own profile and their own
"You · Lv." label both updated at once (both read the XP store, which the
quest engine's server-side grants reach over realtime), but every *other*
device kept the joined-at value until that driver toggled visibility off and
on.

`useOnlineUsers` now consumes `useXP()` directly — `XPProvider` wraps
`OnlineUsersProvider` in `app/_layout.tsx` — and syncs `profileRef` whenever
the store changes, so the number on the wire is the same one the profile
screen renders. The sync is guarded on the store's `loading` flag, because it
reports level 1 until its first read resolves and writing that over the value
`goOnline` just fetched would trade a stale level for a wrong one.

Note this is the *own-level* path only. Another driver's level still comes
from `resolveProfiles`' five-minute cache (§2), which is a deliberate bound on
how often the map re-reads other people's rows, not a bug.
