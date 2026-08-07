# Convoy reference

A convoy is a small group of drivers who ride together: matching rings on
everyone's map, one shared group chat, and one shared destination set by the
leader. This file covers what it is made of, what was broken, and how to check
it on a device.

Related: `database_migration_parties.sql` (the tables),
`database_migration_community_v2.sql` (open-join, capacity, group chat),
`database_migration_platinum.sql` (the tier cap),
`database_migration_convoy_shared_nav.sql` (the repair, open invites, shared
navigation — the one to run).

---

## 1. What a convoy is made of

| Piece | Where |
| --- | --- |
| `parties` | one row per convoy: leader, name, colour, visibility, capacity, **and the shared destination** |
| `party_members` | roster, `status` of `invited` / `accepted`, `role` of `leader` / `member` |
| `group_conversations` + `group_conversation_members` | the convoy's chat, opened by a trigger on `parties` |
| `hooks/usePartyStore.ts` | the client's whole convoy surface, mounted globally in `app/_layout.tsx` |
| `lib/convoyNav.ts` | pure rules for the shared destination |
| `lib/convoyErrors.ts` | pure mapping from a Postgres error to something a driver can act on |
| `app/convoy.tsx` | roster, invites, destination card |
| `app/convoy/[id].tsx` | a convoy you are browsing but not in |
| `app/(tabs)/map.tsx` | convoy pins, the destination flag, the follow banner |

A driver is in **one** convoy at a time. That is enforced by a partial unique
index, not by the client:

```sql
CREATE UNIQUE INDEX idx_party_members_one_active
  ON party_members(user_id) WHERE status = 'accepted';
```

An `invited` row is exempt, so a driver can hold invites from several convoys
and pick one. Accepting a second raises `23505`, which the client reports as
"Leave your current convoy first" rather than as a failure.

---

## 2. Why "Couldn't create convoy. Please try again." happened

Three separate causes, all permanent, all reported with the same alert — and
"try again" could not fix any of them. All three were reproduced against a
real Postgres before being fixed.

**a. The client wrote columns the database didn't have.** `visibility`,
`description` and `max_members` arrive in `database_migration_community_v2.sql`,
not in the parties migration. Against a database that had one and not the
other, every create died before reaching a single trigger:

```
ERROR: column "visibility" of relation "parties" does not exist
```

PostgREST reports that as `PGRST204`. The store turned it into `false`, and
`false` became "Please try again."

**b. RLS policies on `party_members` that query `party_members`.** Evaluating
the policy re-enters the policy, and Postgres refuses the whole statement:

```
ERROR: infinite recursion detected in policy for relation "party_members"
```

The insert into `parties` survives this; the **read-back** does not, and
`.insert(…).select().single()` always reads back. `parties`' own SELECT policy
also queried `party_members`, so both halves recursed.
`database_migration_fix_convoy_rls_recursion.sql` fixed this; the fix is
repeated in the new migration so one file is enough.

**c. The driver was already in a convoy.** The auto-seat trigger hits the
one-active index and takes the whole create down with it. Same alert. This one
is not a bug — but it was indistinguishable from the two that are.

### The repair

`create_convoy()` — a `SECURITY DEFINER` function that inserts the party and
seats the leader in one statement. Running as the function owner takes the
leader's own seat out of RLS entirely, so cause (b) cannot return through a
policy edit. Causes (a) and (c) are now *named*: `lib/convoyErrors.ts` maps
every code to copy that says what happened and who can fix it, and the client
falls back to the old direct INSERT when the RPC isn't deployed, so an
un-migrated database degrades to the old behaviour instead of a broken screen.

**The rule this leaves behind:** a convoy write never reports `false`. Every
path returns a `ConvoyResult` carrying the real cause, and the raw Postgres
message survives to the phone — because on a store build it is the only copy
of the cause that exists.

---

## 3. Inviting anyone

An invite used to require an accepted `friends` row, checked on the client
*and* in the RLS policy. That made the most natural invite in the product —
the driver you can see two streets away on the map — the one that always
failed, with an error blaming the invitee for not being a friend.

Now: **anyone in the convoy may invite any driver**, and the invite is always
written as `status = 'invited'`. A member cannot seat someone directly as
`accepted`; that decision stays with the invitee.

- `invite_to_convoy(user_id)` — the write. Checks membership, self-invite,
  duplicates, and capacity (accepted **plus** outstanding invites, so a leader
  learns the ceiling when they invite, not when the third driver accepts).
- `search_convoy_invitees(query, limit)` — the picker. Exists for one field
  the client cannot compute: whether a driver is already in someone else's
  convoy, since those `party_members` rows aren't visible to it. Shown as
  "Already in a convoy" *before* the invite goes out.

What this trades: any convoy member can put a pending invite in front of any
driver. Same exposure a friend request already has, and the invite carries no
location, no contact detail and no obligation.

Capacity still follows the **organiser's** tier — Regular 2, Platinum 8 — so a
driver blocked from joining someone else's full convoy is never shown the
paywall. Upgrading wouldn't let them in.

---

## 4. Shared navigation

When the leader taps **Route**, the convoy is going there.

- Written to `parties.dest_lat` / `dest_lng` / `dest_name` / `dest_set_by` /
  `dest_set_at` through `set_convoy_destination()`, which refuses anyone who
  isn't the leader. Denormalised onto the convoy because there is exactly one
  destination per convoy, it is replaced rather than appended to, and it has
  to arrive on the row members already subscribe to.
- Published **at the tap**, not when Mapbox returns directions: the
  destination is what the convoy needs and it is already known.
- Cleared by `clearRoute()` — the leader stopping is the convoy arriving.

Three rules live in `lib/convoyNav.ts`, pure and tested:

1. **Only the leader writes it.** Enforced again in SQL. Without the client
   half, every member's map would publish its own route on Route and the last
   writer would win.
2. **A write only happens when the destination changed** (25 m). The map
   re-runs its navigation effect on every GPS tick; without this the leader
   would republish about once a second and every member would take a realtime
   event and a full party reload for it.
3. **A destination goes stale after 6 hours.** Nothing clears the row when a
   leader closes the app mid-drive, so a convoy that met up yesterday would
   still be pointed at yesterday's café. Checked on read rather than trusting
   a cleanup that may never run.

On the members' side: a flag marker in the convoy's colour, and a banner that
routes them there on tap. The banner yields to the distress banner — a driver
who needs help outranks knowing where the convoy is going — and is hidden from
the leader, who set it and is already routed to it.

---

## 5. The convoy pin

Convoy-mates are drawn by the same marker as every other online driver, with
three differences (`app/(tabs)/map.tsx`):

- The ring carries the **convoy's colour** instead of the driver's livery, and
  is thicker (`playerRingParty`). It replaces the rank frame in the outer
  slot, because convoy membership is live operational state and rank is
  cosmetic.
- The badge is the convoy mark, or a **crown for the leader**. Worth the extra
  glyph now that shared navigation exists: which driver on this map decides
  where everyone is going matters at a glance.
- The **convoy's name** sits under the driver's name. A ring in an arbitrary
  colour asks the driver to remember what that colour meant; the name doesn't.

A raised problem signal overrides all three — distress wins the marker
outright, and the alert banner still says "Convoy ·" so the relationship isn't
lost.

**Convoy-mates are only visible while you are online.** `useOnlineUsers` only
populates while presence is joined, and going offline is a deliberate "hide
me" that hides others from you too. Changing that is a change to the presence
contract (`ONLINE_PRESENCE_REFERENCE.md`), not to this feature.

---

## 6. Two bugs found by running the migration, not by reading it

Both were invisible in the source and obvious the moment a real Postgres was
put in front of it. Worth repeating the method: build the schema, run the
migrations in order, then *use the feature as each role*.

**The convoy's group chat had the same recursion, unfixed.**
`group_conversation_members` carried the identical self-referencing policy
`party_members` had, and `group_conversations` and `group_messages` both ask
their membership question through it — so all three were unreadable and
`app/convoy/[id].tsx` could never find a convoy's conversation. The convoy fix
never reached them. Same cure: `is_group_conversation_member()`.

**The leader was never in their own convoy's chat.** Two `AFTER INSERT`
triggers hang off `parties`, and Postgres fires them **alphabetically**:
`on_party_created` seats the leader, `party_create_conversation` opens the
conversation. The leader's roster row is therefore written while no
conversation exists, `party_member_sync_conversation` finds none, and the
leader is skipped. Every member who joins *after* creation is added correctly
— which is exactly why it looked like it worked. Fixed by having the
conversation seat whoever is already on the roster when it is created, which
is order-independent, plus a one-time backfill for existing convoys.

---

## 7. How to verify

### Against a database

`database_migration_convoy_shared_nav.sql` is idempotent and self-healing: it
can be run against a database that has every earlier convoy migration or one
that only ever got `database_migration_parties.sql`. Both were tested, as was
running it twice.

Worth re-running as a suite if the policies are ever touched. Scaffold
`auth.users`, `auth.uid()`, the `anon`/`authenticated`/`service_role` roles, a
`supabase_realtime` publication, and `profiles` / `friends` / `user_xp`, then
`SET ROLE authenticated` and `set_config('request.jwt.claim.sub', …)` per
driver. The checks that matter:

1. Reading `party_members` and `parties` does not raise `42P17`.
2. `create_convoy` returns a row and seats the leader as `leader` / `accepted`.
3. A second `create_convoy` from the same driver raises `ALREADY_IN_CONVOY`.
4. `invite_to_convoy` works on a driver with **no** `friends` row.
5. A member calling `set_convoy_destination` raises `NOT_LEADER`; the leader
   succeeds and every member reads the value back.
6. A stranger cannot insert a roster row into an invite-only convoy
   (`new row violates row-level security policy`), but *can* self-seat into a
   public one — that is the open-join path, not a hole.
7. A new convoy's chat has its leader in it.

### On devices

Two accounts, two phones:

- **Create.** A convoy is created and appears immediately with you seated as
  leader. If it fails, the alert now names the cause — a migration message
  means run the SQL, not tap again.
- **Invite a stranger.** Sign in as a driver who is *not* your friend, search
  their name in Invite Drivers, invite. The invite arrives as a notification
  and shows in their Convoy Invites list.
- **Invite from the map.** Tap another driver's marker → Invite to convoy.
  This is the path that used to always fail.
- **Pins.** Both online: each sees the other with the convoy-coloured ring,
  the convoy's name under the marker, and a crown on the leader.
- **Shared navigation.** As leader, drop a pin and tap Route. The member's map
  shows a flag in the convoy colour and a banner naming you and the place;
  tapping it routes them there. Stop the route as leader — the member's banner
  and flag both go.

### Still unverified on device

Written and typechecked, tested in pure form and against a real Postgres, but
not yet run on hardware:

- The convoy destination flag's collision behaviour against dense POI markers.
- Whether the banner's 6-hour staleness window is right in practice, or
  whether a convoy wants it shorter.
- The realtime latency of a destination change with several members on
  mobile data, and whether the fallback poll (`loadParty` on any `parties`
  event) is enough when the websocket is down.
