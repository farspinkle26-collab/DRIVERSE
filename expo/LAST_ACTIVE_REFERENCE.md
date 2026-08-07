# Last Active

`profiles.last_active_at` records when each driver last had the app open. It
exists so the admin dashboard's DAU/WAU/MAU stop being inferred from what
drivers produced and start being measured from when they were here.

---

## 1. What was wrong with the inference

The dashboard's "active" was, and for some numbers still is, a union of
activity timestamps: a `trips` row, a `direct_messages` row, a `daily_quests`
row. That counts a driver who **did something**. It cannot see a driver who
opened the app, looked at who was on the map, and closed it again — which is
the single most common session this app has.

So the reported DAU was not "approximately DAU". It was a different quantity —
daily *producing* users — sitting under a DAU label, and it undercounts by an
unknown factor that changes as features are added. `admin/README.md` had it in
the "known data gaps" table with the fix written next to it; this is that fix.

---

## 2. One timestamp, and what it therefore cannot answer

`last_active_at` holds **the most recent** ping per user. Nothing else.

- **Exact:** "how many users were here in the last 24 hours / 7 days / 30
  days" — a rolling window over one column.
- **Not derivable:** "how many users were here on the 3rd", and therefore the
  DAU day-by-day chart and the D1/D7/D30 retention cohorts, which need the set
  of days a user was active. Those still run on the trip/message/quest proxy
  and are still labelled approximate. Making *them* exact needs an event log,
  which is a bigger change and is not this one.

The Overview banner says which of its numbers is which, and the measured cards
carry no period-over-period arrow — an earlier window cannot be recovered from
a single stored timestamp, and an invented arrow next to an exact number is
worse than no arrow.

**NULL means unknown, not inactive.** Rows that predate the column and were not
caught by the backfill stay NULL forever. Everything that reads this column
excludes NULL rather than treating it as very old; `activeUsersMeasured` in
`admin/src/lib/metrics.ts` is the only place that decides this, and its tests
pin it.

---

## 3. Two write paths

Mirroring how presence already works — a live path and a fallback, so one
failing degrades the number instead of zeroing it.

1. **`touch_last_active()`**, the RPC. `hooks/useLastActivePing.ts` calls it on
   mount once a session exists, on every AppState transition back to `active`,
   and on a heartbeat while the app stays open. Mount is the ping that makes
   "opened it and did nothing" countable; foreground catches a phone that sat
   in a pocket for six hours; the heartbeat means a 40-minute drive is recorded
   as ending when it ended.
2. **The `user_locations` trigger.** Anyone visible on the live map is by
   definition here, so their position upsert touches the column too. This is
   what keeps the number roughly right on builds that shipped before the ping,
   or if the RPC is failing.

Both are throttled to **5 minutes, in SQL** — not only in the client. The
client throttle saves a round trip; the SQL throttle is what protects the
table, because `user_locations` is upserted every ~10 seconds per online driver
and a build that shipped with the wrong interval cannot be recalled. In the
steady state a ping costs one indexed primary-key probe and no write.

---

## 4. Launch safety

`hooks/useLastActivePing.ts` is reachable from `app/_layout.tsx`, so it obeys
`LAUNCH_SAFETY_REFERENCE.md` §1: nothing runs at module scope, no native module
is looked up, and it imports only what the launch path already carries
(`lib/supabase`, `hooks/useAuthStore`). It is mounted as `<LastActivePing />`
inside `AuthContext` and renders nothing.

Every failure path is swallowed. This is a metric; it must never be the reason
a driver's app misbehaves. Two failures are distinguished, because they want
opposite handling:

- **Transient** (network, timeout) — the throttle is cleared so the next
  trigger retries immediately rather than waiting out five minutes on a request
  that never landed.
- **Missing RPC** (`PGRST202`) — the migration has not been run against this
  project. It will fail identically forever, so the ping disables itself for the
  life of the process after one warning. The next launch tries again.

`isMissingRpc` and `shouldPing` are pure and tested in `lib/lastActive.ts` /
`lib/__tests__/lastActive.test.ts`.

---

## 5. Running it

`expo/database_migration_last_active.sql`, in the Supabase SQL editor. It is
additive and re-runnable: the column, an index, the RPC, the trigger, and a
backfill.

The **backfill** seeds the column from the activity that already exists —
`trips`, `daily_quests`, `direct_messages`, `user_locations`, each guarded by
`to_regclass` because this repo has no single migration history and a given
database may not have all of them. That is the same evidence the approximation
uses, collapsed to one timestamp per user: a strict lower bound on when each
driver was last here, superseded by their first real ping. Without it the
dashboard reads near-zero for a month while pings accumulate, which looks like
an outage.

The dashboard does not require the migration to have been run. `getProfiles`
asks for the column and, if that fails, refetches without it and reads NULL —
otherwise an unknown column would fail the whole SELECT and blank every section
of the dashboard, not just this metric.

---

## 6. Verifying it

1. **The RPC.** In the SQL editor, as an authenticated user:
   `SELECT public.touch_last_active();` — returns a timestamp. Call it again
   within five minutes: the same timestamp comes back, unchanged. That is the
   throttle working, not a failure.
2. **The ping.** Open the app signed in, then
   `SELECT last_active_at FROM profiles WHERE id = '<uid>';`. Background the app
   for a minute, foreground it, wait past the interval, and check it advances.
3. **The fallback.** With the app on the map screen, confirm the timestamp keeps
   advancing at roughly the throttle interval even if the RPC is revoked.
4. **The dashboard.** `/` shows the measured banner and the DAU/WAU/MAU cards
   read "last 24h / 7d / 30d"; `/users` shows the Last active column and the
   Active (24h) / (7d) / Ever seen / Never seen cards.

Unverified on device at the time of writing: all of the above. The SQL, the
throttle rule and the metric are covered by tests and by the migration's own
guards; the ping's behaviour across a real backgrounded iOS/Android session is
not.
