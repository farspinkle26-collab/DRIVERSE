# Share card reference

What the "Share" action produces, what the driver can change about it before
posting, and where each piece lives. Read this before touching
`components/ShareableCard.tsx`, `components/ShareCardModal.tsx`,
`components/TripMapSnapshot.tsx`, `components/SpeedTrace.tsx` or
`lib/speedTrace.ts`.

The trip card is the one that matters — it is the only one a driver produces
several times a week — so most of this file is about that variant. The rank,
quest and showcase variants share the frame, the branding and the export
geometry and are otherwise unchanged.

---

## 1. What the card has to be

A share card is a **record of a real drive**, presented cleanly. It is not an
ad for the app, and it must not look like something a template generator
produced. Concretely, the things that keep it on the right side of that line:

- **Every number on it is measured.** Distance, time, average, top speed and
  the score all come from the stored trip row through `lib/tripStats.ts`. The
  card formats; it does not compute anything it could get wrong.
- **It is dated.** `formatShareStamp` puts an absolute `03 AUG 2026 · 16:17`
  in the eyebrow. Deliberately not the Drive Hub's relative "Today, 16:17" — an
  exported image outlives the day it was made, and a card posted Tuesday and
  read Friday would be claiming Friday. An absolute stamp is also most of what
  makes a card read as *logged* rather than *generated*.
- **One thing is the hero.** Distance, at 52pt mono. The score is a chip beside
  it, not a fourth equal number; time / average / top sit in a hairline-divided
  row underneath. A 2×2 grid of four identically-sized numbers is the layout
  this replaced, and it is the most template-looking arrangement available.
- **Red stays an accent.** The route trace, the top-speed readout and the
  finish dot. The score chip joins them only at 90+, the same rule
  `TripCard` follows.
- **Nothing on it is a placeholder.** `lib/tripEndpoints.ts` keeps
  "Current Location → Dropped Pin" off the card (Point A → Point B instead);
  `CarStrip` drops a spec it does not know rather than printing "Custom".

Geometry is unchanged: a 360×640 design canvas, rescaled by
`react-native-view-shot` to a 1080×1920 PNG on capture. What you see in the
preview is exactly what is posted.

---

## 2. The composition controls

Above the action bar, trip cards only. Three controls, and each exists for a
reason a driver would recognise.

| Control | Values | Default |
| --- | --- | --- |
| **Route** | Map / Trace / Off | Map |
| **Speed heat** | on / off | on |
| **Car** | on / off | on |

- **Route: Map** draws a still of the real map (Mapbox tiles on the native map
  surface, dark), with the route over it. **Trace** draws the route shape alone
  on the card's own black. **Off** removes it entirely, and the distance
  readout grows to fill the space so a stats-only card still has a centre of
  gravity rather than a hole.

  Trace and Off are not decoration options. A map of a drive that starts at
  your house is a map of your house; a driver who wants to post the numbers
  should not have to publish the geography to do it.

- **Speed heat** colours the route by how fast the car was moving (§3). Off
  gives one flat `racingRed` line.

- **Car** shows the garage car the drive was logged in — photo where the garage
  has one, colour swatch where it does not, never a generic car icon.

Each control disables itself rather than lying: Map is unavailable when there
is no Mapbox token or on web (`canSnapshotMap()`), Speed heat is unavailable
when there is no usable profile, Car is unavailable when the trip has no
`car_id` or the car has since been deleted. Choices live for the length of the
session and are not persisted — this is a per-post decision, not a setting.

---

## 3. The speed heatmap

`lib/speedTrace.ts`, pure and tested in `lib/__tests__/speedTrace.test.ts`.

**The ramp** is four stops ending on `racingRed` (`SPEED_HEAT_STOPS`). It is a
deliberate exception to the six-colour palette and is quarantined in that one
file, the same way `constants/mapCategoryColors.ts` is. The cold end is a dark
ember, **not black**: a segment where the driver was stopped still has to be
visible against `voidBlack` or the trace develops holes at every traffic light.

**The domain** is `0 → this drive's top speed`, not min → max. "Half the ramp"
has to mean "half the top speed", or a drive that never dropped below 90 would
paint its slowest stretch the same colour as a jam.

**Where the speeds come from** — two sources, in order of trust:

1. `trips.speed_profile` — one whole km/h per polyline point, comma-separated,
   written by the recorder from real fix timestamps. Added by
   `database_migration_trip_speed_profile.sql`.
2. **Derived from the geometry**, for every drive recorded before that column
   existed — which is every drive currently in the table. The recorder samples
   on a ~1 Hz timer and `simplifyPath` thins by a constant index step, so
   consecutive stored points are separated by roughly equal *time* and segment
   length is proportional to speed. That gives the right shape at the wrong
   scale, so the derived profile is rescaled onto the two speeds the row does
   store exactly (`top_speed_kmh`, falling back to `avg_speed_kmh` when the
   stored top is inconsistent with it).

`speedProfileForTrip` reports which source it used. A stored profile is only
accepted when its length matches the polyline exactly — a profile off by one
point paints the fast stretch onto the wrong corner, so a mismatch falls
through to the derived path rather than guessing at an alignment.

**Segmenting.** `heatSegments` groups consecutive points into runs that
quantise to the same colour band (`HEAT_BUCKETS = 12`), overlapping by one
point so the line has no gaps at the joins. The SVG trace could colour every
segment individually; the map cannot, because each run becomes a native
`<Polyline>` and 400 of those is a stutter on a mid-range Android and a
snapshot that takes seconds.

**The legend** (`SpeedLegend`) is not optional garnish. Without "0 → 143" under
the gradient the colours are decoration; with it they are data.

### Writing the profile

`stopRecording` in `app/(tabs)/map.tsx`. The path and its capture times are
thinned through **the same indices** — `simplifyIndices`, which exists for
exactly this reason — because deriving them separately is how the two silently
drift out of step. The timestamps are pushed to `pathTimesRef` *outside* the
`setRecordedPath` updater: a state updater is not guaranteed to run exactly
once, and a times array one entry longer than the path is a profile that
colours the wrong corner. A length mismatch writes no profile at all and lets
the client derive one.

---

## 4. The map still

`components/TripMapSnapshot.tsx`. Two decisions in here look odd and are both
load-bearing.

**The card contains an `<Image>`, never a `MapView`.** `react-native-view-shot`
rasterises the React Native view tree; a Google map is a native surface whose
pixels live outside that tree, so on Android it captures as a black rectangle.
`MapView.takeSnapshot` asks the map to render *itself* to an image, which is
what the card then draws.

**The map is on screen at 1% opacity, not parked at `left: -9999`.** A map
parked offscreen is free to not render — layout happens, the tile fetch does
not — and the snapshot comes back grey. Near-zero rather than exactly zero
because a fully transparent subtree is what a compositor is most likely to
skip, which is the failure this placement exists to avoid.

**It is mounted outside the `<Modal>`**, as a sibling in the calling screen's
tree with the opaque modal drawn over it. A native map inside a Modal is the
configuration `react-native-maps` is least reliable in on Android.

Timing: `onMapReady` fires when the map is *usable*, not when it has drawn, so
capture waits `SETTLE_MS` (1200 ms), retries once, then gives up and reports
`null`. Every failure path — no tiles, no network, no Play services, the user
dismissing the sheet mid-capture — resolves to `onSnapshot(null)` and the card
keeps its SVG trace. **A share card must never render a hole**, which is also
why the trace is what shows while the snapshot is still coming.

No Google fallback base map: `constants/mapbox.ts` states that every tile comes
from the configured Mapbox account. An unconfigured build does not mount the
stage at all and does not offer Map as a route style, rather than snapshotting
an empty dark rectangle.

Markers go through `SettledMarker` like every other custom marker in the app. A
constant `tracksViewChanges={false}` would freeze Android's bitmap before the
dot has drawn — here that bakes an empty marker into the exported PNG.

---

## 5. Save PNG

`saveCardToPhotos` in `lib/shareCard.ts`. Its own action, next to the share
buttons, because "save the picture" is a different intent from "share the
picture" — Save Image does exist in the OS sheet, but two taps down a list of
apps, worded differently on every device, and on Android depending on which
gallery apps are installed.

Three paths, best first:

1. `expo-media-library` → the camera roll. The real answer.
2. iOS without it → the system "Save to Files" sheet.
3. Anything else → the generic share sheet, reported as `sheet` so the wording
   stays honest.

The library is **lazily required inside the function**, in the same defensive
shape as `react-native-share`. A static import of a package that reaches a
native module runs that lookup at module scope, and the throwing variant of
that lookup has killed this app on open before —
`LAUNCH_SAFETY_REFERENCE.md` §10. `lib/shareCard.ts` is imported from screens
on the launch path.

A save keeps the sheet open (the next thing a driver usually wants is to post
the card they just kept) and the button reads "Saved". A denied photo
permission surfaces as an actionable message, not a silent no-op.

---

## 6. Layout budget

The card is a fixed 360×640, so the trip variant's blocks are sized against it
rather than flexed. Two route heights exist — `ROUTE_HEIGHT_WITH_CAR` (200) and
`ROUTE_HEIGHT_NO_CAR` (244) — because dropping the car strip frees 60pt, and a
card that leaves that as a hole above the brand mark looks like a bug rather
than a choice. `tripVariant`'s gap is `spacingLg`, not the `spacingXl` the
other variants use: every combination of the toggles has been sized at that
value, and the fullest card (map + heat + car) overflows the frame at the
wider gap.

The map still is captured once at `MAP_SNAPSHOT_WIDTH × MAP_SNAPSHOT_HEIGHT`
(the block's exact width, its taller height) and cropped by `resizeMode:
"cover"` in the shorter layout. Re-capturing on every car toggle would be a
second and a half of blank map for a crop nobody can see.

---

## 7. Verifying it on a device

The pure logic is covered by tests. Everything below needs hardware, and none
of it is verified yet:

1. **Map still, Android.** Share a trip with Route = Map. The card should show
   dark map tiles with the coloured route inside ~1.5 s. A black or grey block
   that never resolves means the snapshot is failing — check that a Mapbox
   token is configured, then whether `takeSnapshot` is rejecting.
2. **Map still, iOS.** Same, plus: confirm the exported PNG contains the map,
   not just the preview. Capture and share to Messages, then open the image.
3. **Heat vs flat.** Toggle Speed heat on a drive with a real mix of speeds.
   The motorway stretch should be visibly redder than the town stretch, and the
   legend's right-hand number should equal the TOP readout.
4. **Old rows.** Share a drive recorded before
   `database_migration_trip_speed_profile.sql` ran. The heatmap should still
   have shape (derived), and its peak colour should land on the stored top
   speed.
5. **Route = Off.** The distance readout grows and the card has no gap above
   the brand mark.
6. **Car toggle.** With a photo and without one; with a car since deleted from
   the garage (the toggle should be disabled, not showing an empty strip).
7. **Save PNG** on both platforms, including first-run permission and a denied
   permission.
8. **Overflow.** Longest possible title, longest endpoint names, a 3-digit top
   speed and a car with a long name — nothing should clip or push the brand
   mark off the frame.
