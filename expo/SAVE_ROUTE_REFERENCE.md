# Saving and sharing a drive

Covers `components/SaveRouteModal.tsx`, the `saveRoute` path in
`hooks/useRoutesStore.ts`, the automatic `trips` write in
`app/(tabs)/map.tsx`, and the shared guards in `lib/routeDraft.ts`.

Companion to `MAP_SCREEN_REFERENCE.md` (the screen that launches all of
this) and `DESIGN_SYSTEM_AUDIT.md` (which had the sheet at 92 values of
token debt — this pass is that debt paid).

---

## 1. The two writes, and why they are separate

Finishing a drive produces **two** database rows, and they are not the same
thing:

| | Written when | Table | Driver-visible as |
|---|---|---|---|
| **Trip** | automatically, the moment END DRIVE is pressed | `trips` | the Drive Hub log, XP, the trip detail screen |
| **Route** | only if the driver presses SAVE and confirms the sheet | `saved_routes` | the driver's route library, the public route feed, kudos and comments |

A trip is a log entry. A route is something the driver chose to keep and
publish, which is why it takes a name, a description, an activity type and a
visibility — and why it is capped (10 on Regular, unlimited on Platinum,
enforced in the store *and* by a Postgres trigger; see
`PLATINUM_REFERENCE.md`).

**Sharing needs neither.** `ShareCardModal` renders `ShareableCard` from the
trip that is already in memory. This is the whole reason SHARE is not gated
on SAVE any more.

---

## 2. Why saves used to fail invisibly

Four separate faults stacked into one symptom — "the Save button does
nothing":

1. **A thrown error was never caught.** `saveRoute` awaited Supabase without
   a `try`, and the sheet's `handleSave` did the same. Anything that threw
   rather than resolving with `{ error }` — no network, an expired session,
   a client misconfiguration — escaped both. `setSaving(false)` was never
   reached, so the button sat on its spinner forever with nothing said.
2. **The error text was below the fold.** It rendered as the last child of
   the scroll content, underneath three visibility rows. The driver pressing
   a pinned footer button was never looking at it.
3. **Non-finite metrics were sent as-is.** PostgREST serialises the insert
   body as JSON, where `NaN` and `Infinity` are not representable. An
   average speed computed over a zero-length window, or a top speed that
   never got a second GPS fix, turned a saveable drive into a rejected
   request.
4. **The sheet never reset.** It is mounted for the life of the map screen
   and only toggled by `visible`, so `useState(defaultTitle)` ran once. A
   second drive opened the sheet holding the *first* drive's title, and a
   `saving` flag left true by fault 1 stayed true.

Fixes, in order: `try`/`catch` in both places with `finally { setSaving }`;
the error moved into the pinned footer directly above the button, with
`accessibilityLiveRegion`; `sanitizeMetric` / `sanitizeCount` on every
numeric column; a `useEffect` on `visible` that resets every field.

The `trips` write had its own version of the same problem — a failure was
`console.error`'d and nothing else, so the summary card said the drive was
recorded while nothing had been stored. It now sets `tripSaveError`, which
the summary card renders. It also now sends `route_polyline`, which it had
been dropping on the floor; that is why saved trips came back as stat rows
with no map on them.

`lib/routeDraft.ts` holds the pure half of all of this — the sanitisers, the
draft validation, and `describeSaveFailure`, which turns a Supabase error, a
thrown `Error` or a bare string into one sentence a driver can act on.
Tested directly in `lib/__tests__/routeDraft.test.ts`.

---

## 2a. The migration trap

Neither table this feature writes to exists in
`database_setup_complete.sql`. Despite the name, that script stops at the
company/tow/chat era — it has no `trips`, no `car_collections`, no
`saved_routes`. A project stood up from it alone answers **every** save with
`relation "public.saved_routes" does not exist`, and before this pass that
message went nowhere: the sheet showed no error and the trip write only
reached the console. "We cannot save trips or routes" looks exactly like a
client bug and is not one.

Run these, in order, on top of the consolidated script:

```
database_migration_profile_v2.sql      -- trips, car_collections, friends
database_migration_saved_routes.sql    -- saved_routes, kudos, comments, RLS
database_migration_trip_names.sql      -- trips.name
database_migration_trips_privacy.sql   -- trips.is_public + SELECT policy
database_migration_platinum.sql        -- the tier-cap triggers
```

The error is now rendered on the sheet verbatim when it is not one of the
two cases `describeSaveFailure` rewrites, precisely so a missing migration
identifies itself instead of looking like a dead button.

---

## 3. Styling

The sheet is a **form**, so it follows `components/CreateConvoyModal.tsx`,
not the map's cut-corner cards: a plain carbon slab with a hairline top
edge, `radius.sharp` inputs and chips, one `CutCornerButton` for the action.
Nesting the signature shape inside a sheet that is itself a surface is what
turns the cut into wallpaper (`CutCorner.tsx` header comment).

What came off:

| Was | Now |
|---|---|
| `LinearGradient` `#FF6B35 → #FF3B6F` on the action | flat `CutCornerButton`, `corners="topRight"` |
| Five activity chips in five hues (orange / purple / blue / pink / teal) | one neutral chip style; the glyph carries the category, colour carries selection |
| `#FF6B35` radio dots and active borders | `textPrimary` |
| A circular radio | a square mark — the shape policy has no circle outside avatars |
| `borderRadius` 12 / 14 / 16 / 24 | `radius.sharp` |
| Bare `fontSize`/`fontWeight` pairs | `textStyle()` tokens; stats in JetBrains Mono with Inter units |

**Red budget: one element** — the SAVE ROUTE button. That is why neither the
activity chips nor the visibility rows mark themselves in red, even though
`CutCornerChip` (which does) exists and the map uses it for filters. A form
where the selected chip and the submit button are both red has no primary
action.

The stats strip is a **utility** surface — a plain rect at `radius.sharp` on
`voidBlack`, hairline dividers, no cut.

---

## 4. Layout: the footer

The old sheet put the action below an unbounded `ScrollView` inside a
`KeyboardAvoidingView` styled `{ justifyContent: "flex-end" }` with **no
`flex`**. A percentage `maxHeight` needs a parent with a definite height to
resolve against; with none, the sheet grew past the bottom of the screen,
the visibility rows were cut in half and the action overlapped them.

Two changes: `flex: 1` on the wrapper, so `maxHeight: "92%"` is real; and
the action bar lives outside the scroller behind a hairline rule, so it is
always reachable no matter how long the form gets. The error sits in that
same bar.

`CreateConvoyModal` has the same latent `flex` gap and has not been touched
here — it is a shorter form, so it has not overflowed in practice, but it
will if it grows.

---

## 5. Verifying on a device

1. Record a drive of a few hundred metres and press END DRIVE. The summary
   card appears; the Drive Hub should show a new trip **with a route trace**,
   not a blank card.
2. Press SHARE *without* pressing SAVE. The share sheet must open — this is
   the regression this pass exists to prevent.
3. Press SAVE, name the route, press SAVE ROUTE. The sheet closes, the
   summary's Save button reads "Saved", and the route appears in
   `app/routes.tsx`.
4. Turn airplane mode on and press SAVE ROUTE. Expect *"Couldn't reach
   Driveverse…"* above the button within a second — not an endless spinner.
5. With a Regular account holding 10 routes, the sheet shows the cap
   readout before you press anything, and pressing SAVE ROUTE raises the
   paywall rather than failing.
6. Record a second drive and reopen the sheet: the name field must show the
   *new* destination, not the previous one.

---

## 6. Naming the two ends of a drive

The share card used to read **"Current Location → Dropped Pin"**, with
"Dropped Pin" repeated at 30pt as the headline. Those are not places — they
are the names of the fields, hardcoded as string literals at four separate
call sites in `app/(tabs)/map.tsx` (the trip insert, the route sheet, the
save sheet, the share payload), which is also why they drifted: three of
them said `"Dropped Pin"` and one said `"Dropped pin"`.

Two halves to the fix.

**Resolve the names.** `reverseGeocodePlace` (`lib/mapboxApi.ts`) is a
label-first reverse geocode: it returns the feature's own `text` ("Kopi
Nako") separately from the postal `place_name`, POI-first, and never throws
— a missing token, an offline device or a Mapbox error all resolve to
`null`. The map calls it twice, both fire-and-forget:

- `resolveDroppedPinName` when a pin is dropped. The pin is already selected
  and routable before this returns, so there is no loading state and no
  error path. The reply is discarded unless *that same pin* is still
  selected, so a double tap cannot land the first name on the second pin.
- `resolveOriginName` when recording starts, guarded by `originRequestRef`
  so a late reply from a previous drive cannot stamp its name on this one.

A destination that came from an event or a place marker already has a name
and is never geocoded.

`destinationLabel` (and `destinationStoredName`, its storage twin) is now the
single memo all four call sites read.

**Render whatever came back.** `lib/tripEndpoints.ts` is pure and tested:
`shortPlaceLabel` cuts a full postal string down to the segment a driver
would say out loud, `endpointLabels` supplies the display fallback, and
`shareTripTitle` keeps a placeholder off the headline (a drive with no
destination is a **Free Drive**).

The display fallback is **"Point A → Point B"**. "Starting location →
Destination" was the alternative and loses for the same reason the strings
it replaces do: it describes the form field rather than the drive. A→B reads
as a deliberate label for an unnamed leg, and is short enough never to wrap.

Storage and display differ on purpose. `trips.origin_name` /
`destination_name` fall back to a **coordinate pair**, not to "Point A" — a
row that knows where it was can be named later, a row that says "Unknown"
never can. `endpointLabels` then treats a stored coordinate pair as unnamed
and renders Point A / Point B, so the card never shows raw numbers.

Nothing migrates. Every row written before this change still says "Current
Location" / "Dropped Pin", and `isPlaceholderName` recognises those strings
precisely so the old rows render as Point A → Point B too.

### Verifying

7. Drop a pin on a named place (a café, a mall) and drive to it. The route
   sheet reads "Heading to <that place>", the save sheet pre-fills "Drive to
   <that place>", and the share card's headline and leg line both name it.
8. Drop a pin in the middle of nowhere, or turn the network off before
   dropping it. The card must read **Point A → Point B** — never "Dropped
   Pin", never blank, never raw coordinates.
9. Check `trips` for that drive: `destination_name` holds the coordinate
   pair, so the row is still resolvable later.

---

## 7. The brand mark on the card

`components/DriverseLogo.tsx` draws the lockup as vector — mark in
`react-native-svg`, wordmark in Rajdhani — and `ShareableCard`'s
`BrandCorner` is its first caller.

It replaced an `<Image>` of `assets/images/driverse-logo.png`, which is a
1024×1536 **splash** asset: the logo sits on a blurred photograph inside a
glow. Scaled into the card's 16pt slot that renders as a grey smudge, and
the card compensated by typing the wordmark next to it by hand — misspelled,
as "DRIVEVERSE". The wordmark now reads **DRIVERSE**, matching the logo.

Two reasons it is vector rather than a cleaner PNG. `react-native-view-shot`
captures the card at 3× (360pt → 1080px), and a raster mark is the one
element that would visibly soften there. And the mark's two speed cuts are
punched out with `fillRule="evenodd"` rather than painted in the background
colour, so the logo carries no assumption that it sits on voidBlack.

The geometry is a redraw, not a traced export. If a real vector of the logo
lands in the repo, replace `MARK_PATH` and nothing else changes — every
caller imports the component, not the asset. `LoadingScreen` still uses the
PNG, which is the one place that asset is right.
