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
and a denied location permission. In the dev overlay these read the same way
`[placesApi]` does. Silence in that log is now meaningful.

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
