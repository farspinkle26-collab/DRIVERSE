# Problem Signal

A driver in trouble raises a **problem signal**; every online driver on the
map sees it in real time. It works the same in a convoy and out of one —
the request was "signal the others in your convoy if you have a problem…
apply this outside a convoy too, so every user on the map can see if we have
a problem." One mechanism covers both, because presence already broadcasts
to everyone.

---

## 1. Why presence, not a new table

Online drivers already share their position over one Supabase Realtime
Presence channel, `online-players` (`hooks/useOnlineUsers.ts`). Every client
on that channel receives every other client's `track()` payload the instant
it changes, with no DB round-trip.

A problem signal is just another field on that payload:

```ts
export type ProblemType = "breakdown" | "accident" | "fuel" | "sos";
export interface ProblemSignal { type: ProblemType; since: string; }
// OnlineUser gains:  problem?: ProblemSignal | null
```

So raising a signal reuses the exact path that already reaches **every**
driver on the map — convoy-mate or stranger. No second channel, no polling,
no "is this person in my convoy?" gate on the broadcast side. Convoy is only
used to *rank* whose problem you're shown first, never to decide who can see
it.

`user_locations` gets two mirror columns (`problem_type`, `problem_since`)
purely for persistence and stale-cleanup, matching how position is already
upserted there. The map never reads them; presence is the source of truth
for what's on screen. See `database_migration_problem_signal.sql`.

---

## 2. The four signals

| Key | Label | Lands on others' screens as |
|---|---|---|
| `breakdown` | Broke down | "<name> broke down" |
| `accident` | Accident | "<name> had an accident" |
| `fuel` | Out of fuel | "<name> is out of fuel" |
| `sos` | Need help | "<name> needs help" |

Four kinds, because each maps to a different sort of help — a tow, the
emergency services, a jerry can, or anyone at all. The set is closed and
enforced by a `CHECK` constraint on the mirror column, so a bad client can't
scribble arbitrary strings other drivers would then render.

The catalogue (`PROBLEM_TYPES` in `app/(tabs)/map.tsx`) is the single source
for the label, the chooser icon, and the alert verb.

---

## 3. Raising and clearing (`useOnlineUsers.ts`)

- `raiseProblem(type)` — stamps `{ type, since: now }` into a ref (so the
  4-second position broadcaster and `goOnline`'s first publish both pick it
  up) and re-publishes immediately. **If you were hidden, it brings you onto
  the map first** — a problem nobody can see helps nobody.
- `clearProblem()` — drops the signal and re-publishes the cleared state.
- `goOffline()` clears any signal: you can't ask for help from a map you've
  stepped off, and a stale "SOS" left hanging would mislead.
- `myProblem` exposes my own live signal to the UI.

---

## 4. On the map (`app/(tabs)/map.tsx`)

**Every marker.** A driver with a signal takes the accent outright: red
ring, red outer ring, a warning-triangle badge (`ProblemGlyph`), and the
signal label under the name. Red overrides the livery/party colour because
distress is more important than an identity hue — and a driver in trouble is
exactly the "live, act on this now" state red is reserved for
(MAP_SCREEN_REFERENCE §3). The ring is **static**, not pulsed: Android
snapshots the marker to a bitmap and would freeze a mid-animation frame
(MAP_SCREEN_REFERENCE D-5), so distress reads the way "live" already does on
event markers — a bold static ring. The signal type is folded into
`settleKey` so the marker re-snapshots when it changes.

**Distress alert banner.** When a driver near you has a signal up, a red
banner leads the top of the screen — convoy-mates first, then nearest —
tappable to open their card. Kept off the driving HUD (`!isRecording`):
while navigating, the marker already carries distress and a top banner would
fight the turn card and the driver's attention.

**Raise / clear control.** A "Signal" button joins Drive / Convoy / Chat in
the idle action stack. Neutral until your own signal is up, then it takes
the accent border and reads "Clear" — the one live-state that earns red
there — so standing it down is one obvious tap. Tapping it when idle opens
the chooser sheet ("What's wrong?" → the four signals).

**Driver card.** When you open a driver who has a signal up, a red distress
notice leads the card, above the routine social actions, so "what they need
and how long it's been" is read first.

---

## 5. What deliberately isn't here

- **No raise-while-driving.** The chooser and Signal button live in the idle
  action stack, not the driving HUD — picking a signal type from a menu
  while actively navigating is the wrong thing to encourage, and the common
  case (you've broken down / run dry / crashed) means you're stopped, not
  recording. Your own signal still stays broadcast while you drive; you just
  raise and clear it from the idle screen.
- **No auto-expiry timer.** A signal clears when the driver clears it or goes
  offline (presence drops it on leave, and `user_locations` stale-cleanup
  sweeps the mirror after 5 minutes). There's no server job aging signals
  out mid-session, because a still-online driver who hasn't stood their
  signal down is, as far as anyone can tell, still in trouble.
