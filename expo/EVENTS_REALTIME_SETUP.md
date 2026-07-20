# Event Building & Online Realtime Player Locations

This system lets players **create events on the map** (meetups, convoys, cruises, track days), **join/leave them in realtime**, and see **every online player's live position** — all powered by the existing Supabase connection.

## 1. Database setup (one time)

Open your **Supabase SQL Editor** and run:

```
database_migration_events_realtime.sql
```

This creates:

| Object | Purpose |
|---|---|
| `events` table | User-created map events (title, type, pin location, start/end time, capacity, status) |
| `event_participants` table | Who joined which event, host vs member |
| RLS policies | Anyone authenticated can view; only owners can create/update/cancel their events; users manage only their own participation |
| `event_add_host` trigger | Event creator is automatically added as `host` participant |
| `event_check_capacity` trigger | Rejects joins past `max_participants` (0 = unlimited) at the database level |
| `refresh_event_statuses()` RPC | Rolls `upcoming → active → completed` based on time; called opportunistically by the app |
| Realtime publication | `events` + `event_participants` added to `supabase_realtime` so every client updates live |
| `user_locations` safeguards | Re-creates the location table + policies if the earlier migration wasn't run |

The migration is idempotent — safe to re-run.

> If you ran `database_migration_online_users.sql` before, nothing conflicts; the location section is a no-op.

## 2. How Event Building works

- **Create:** Tap the flag button on the map → tap anywhere to drop the event pin → the Create Event sheet opens (name, description, type, start time, max drivers) → **Create Event**.
- **Discover:** All upcoming/active events appear as glowing typed markers with a live participant-count badge. Events that are currently running show a pulsing **LIVE** ring/pill.
- **Join / Leave:** Tap a marker → event card shows host, time, and participants → Join (blocked when full), Leave, or — as host — Cancel for everyone.
- **Navigate:** The **Route** button on the event card draws a driving route to the event pin using the existing navigation system.
- **Realtime:** `postgres_changes` subscriptions on `events` and `event_participants` mean creations, joins, leaves, and cancellations appear on every online device within a second — no refresh needed. A 60s timer additionally re-derives live/expired states.

Code: `hooks/useEventsStore.ts` (data + realtime), `components/CreateEventModal.tsx` (builder UI), `app/(tabs)/map.tsx` (markers + event card).

## 3. How Online Realtime Player Locations work

`hooks/useOnlineUsers.ts` was upgraded from "refetch the table on every DB change" to **Supabase Realtime Presence**:

1. When a player taps **Go Online**, the app joins the shared `online-players` presence channel keyed by their user id, carrying `{name, level, latitude, longitude, heading}`.
2. Every ~4 seconds the app reads GPS and calls `channel.track(...)` — the new position fans out to all connected clients instantly over the websocket, with **zero database reads**.
3. Each client rebuilds its player list from `presenceState()` on every `sync`/`join`/`leave` event, so markers move live and players disappear the moment they go offline or lose connection (presence handles dropped connections automatically).
4. Positions are still upserted to `user_locations` in the background for persistence, and `is_online=false` is written on Go Offline. The existing `cleanup_stale_locations()` function remains valid.

The public API (`onlineUsers`, `isOnline`, `goOnline`, `goOffline`) is unchanged, so the existing map UI (Go Online card, player markers, add-friend card) works as before — just faster.

## 4. Optional: scheduled maintenance

For automatic status rollover without client traffic, schedule with `pg_cron` in Supabase:

```sql
SELECT cron.schedule('refresh-events', '*/5 * * * *', $$SELECT public.refresh_event_statuses()$$);
SELECT cron.schedule('cleanup-locations', '*/5 * * * *', $$SELECT public.cleanup_stale_locations()$$);
```
