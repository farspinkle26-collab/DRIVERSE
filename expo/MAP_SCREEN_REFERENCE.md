# Map — Phase 3 rebuild

`app/(tabs)/map.tsx` is the third screen onto the Phase 1 token system,
after the Drive Hub. It is also the largest and the riskiest: routing, live
GPS trip recording, map gesture handling and real-time presence markers all
live on it. This pass is a **re-skin, not a rewrite** — every handler, ref,
effect and piece of derived state below the styling layer is the original.

Companion to `DESIGN_SYSTEM_AUDIT.md` (which measured the debt — this file
was 876 of the ~4,100 values) and `DRIVE_HUB_REFERENCE.md` (which set the
pattern). Read those first; this document only records what is specific to
the map.

---

## 1. What changed, file by file

| File | Change |
|---|---|
| `app/(tabs)/map.tsx` | Rewritten styling layer. All 2,271 lines of `StyleSheet` replaced; markers, sheets, HUD panels and controls rebuilt on the tokens. |
| `components/MapGlyphs.tsx` | **New.** Every icon that lands on the map surface, hand-drawn at one stroke weight. |
| `components/PlacesLayer.tsx` | Rebuilt: cut-corner filter chips, token markers, token callout, token submit flow. |
| `constants/placesCategories.ts` | Dropped `PLACE_CATEGORY_COLORS`; category is now shape, not hue. |
| `components/RoutePreview.tsx` | Route trace onto flat `racingRed`; gradient and the teal/pink end dots removed. |
| `components/CutCorner.tsx` | +1 additive button variant (`ghost`) — see D-2. |
| `lib/placesApi.ts` | Two error strings rewritten to the voice rules. |
| `assets/images/map-icons/*.png` | **Deleted** (7 files, 122 kB). Superseded by `MapGlyphs`. |

A later pass (§10) changed what the markers *are* rather than how they look:

| File | Change |
|---|---|
| `supabase/functions/_shared/overpass.ts` | Taxonomy 4 → 9 categories; `node` → `nwr` + `out center`; per-category unnamed fallback. |
| `constants/placesCategories.ts` | The one taxonomy. Pure data — no React imports, so it can be unit-tested and read from non-render code. |
| `components/MapGlyphs.tsx` | +`ParkingGlyph`, +`HeadingChevron`, +`PLACE_CATEGORY_GLYPHS` (the category→glyph binding, moved off the data module). |
| `lib/mapClustering.ts` | **New.** Grid clustering, two modes. 18 tests. |
| `lib/mapFilters.ts` | **New.** Filter state + its storage migration. 13 tests. |
| `hooks/useMapFilters.ts` | **New.** React/AsyncStorage wrapper over the above. |
| `hooks/usePlaces.ts` | Single-category → all-categories fetch, with a client-side bucket cache. |
| `components/PlacesLayer.tsx` | `PlacesFilterBar` and `PlacesMarkers` **deleted** — POIs render once, in `map.tsx`. |
| `database_migration_places_taxonomy.sql` | **New.** Widens the `places` category constraint; clears the stale cache. |

Measured on the screen after the pass:

| | Before | After |
|---|---:|---:|
| Hardcoded hex / `rgba()` in `map.tsx` | 395 | 9 (all documented, §4) |
| `fontWeight` declarations | 103 | 0 |
| `shadowColor` / `elevation` blocks | 64 | 0 |
| `fontFamily` declarations | 0 | every text style |
| Distinct icon stroke weights | 5 (2, 2.2, 2.5, 3, 3.5) | 2 (see D-1) |

---

## 2. The icon set

`components/MapGlyphs.tsx` exists because the map was carrying **four**
icon languages simultaneously:

1. lucide outline icons at `strokeWidth` 2.2 on the landmark markers,
2. lucide's implicit default (2) on the Places layer,
3. `MapPin` — lucide's generic map pin — standing in as the *category*
   glyph for "hangout", which says "somewhere", not "a place drivers park
   up",
4. seven pre-rendered neon PNG badges whose glow was baked into the bitmap,
   so they could not be restyled, could not take a state colour, and forced
   a per-marker image-load gate (`loadedBadgeIds`) to stop Android
   snapshotting a half-decoded image into the marker view.

Eleven glyphs are now drawn by hand: cafe, food, fuel, workshop, hangout,
shopping, car wash, charging, parking, event, driver. Plus four non-category
marks: `DestinationMark`, `DriverMark`, `HeadingChevron`, `VisibilityGlyph`.

All of them use `strokeLinecap="square"` and `strokeLinejoin="miter"`.
lucide's family is round-capped and round-joined, which reads as the
opposite of the corner cut and the 1px hairlines; mitred joins put the icons
in the same register as everything else on the screen.

Deleting the bitmaps also deleted the load-gating: SVG lays out
synchronously, so `SettledMarker`'s grace period alone now covers the
Android snapshot. The gate is still in place for **online driver avatars**,
which are genuinely network images.

**Category is shape. State is colour.** That is the rule that lets eleven
map layers live inside a six-value palette. A marker is
`carbonSurface` + `hairline` normally, `racingRed` + black glyph when
selected. Nothing is coloured to say *what* it is.

---

## 3. The red budget

`theme.ts` says "at most one red element in a viewport". The Drive Hub
restated that for a scrolling list (D-4). The map needs its own restatement,
because it has five distinct modes:

| Mode | Red elements |
|---|---|
| **Idle** | DRIVE (the primary action) + the Live Feed dot |
| **Drop-pin armed** | the hint's border and reticle + DRIVE's active outline — the same action, twice |
| **Route ready** | the route polyline + START NAVIGATION |
| **Recording** | the recorded trace + END DRIVE + the live turn instruction + the speed-limit sign's regulatory ring |
| **Trip summary** | SAVE & SHARE ROUTE |

**Rule: one red action, plus red for live data (the route, the trace, the
current instruction), plus one small live-state mark.** Everything else is
`textPrimary` / `textSecondary` / `hairline`.

Three places where the first screenshot pass showed that budget broken, and
what fixed it:

- **The Filters popover rendered nine red tick boxes.** Every layer is on by
  default, so the accent covered the whole panel. The tick and the map-style
  toggle are now `textPrimary` fills with `voidBlack` marks. Red does not
  appear in that popover at all.
- **The driving HUD had six red elements** — END DRIVE, PAUSE, PHOTO, the
  speedometer ring, the turn instruction, and the turn progress bar. PAUSE
  and PHOTO became `ghost` (D-2), the speedometer took a hairline, and the
  progress bar went `textPrimary`. END DRIVE is now unmistakably the
  loudest thing on screen, which for a control you press while moving is the
  point.
- **The trip summary had a full-width red level-up banner beside the red
  primary action.** The banner is now a hairline outline; the copy carries
  the news.

---

## 4. Deviations from the tokens

Each is a decision to copy, not re-litigate.

**D-1 — Two icon stroke weights, not one.**
`MAP_GLYPH_STROKE` = 2 for anything drawn on the map surface;
`CHROME_ICON_STROKE` = 1.5 for the screen's chrome, matching the Drive Hub.
Map glyphs sit on photographic tiles rather than a flat surface and need the
extra weight; chrome icons sit next to 1px hairlines and would out-weigh
them at 2. **Two weights, each with a rule.** The screen previously had five
weights and no rule.

**D-2 — `CutCornerButton` gained a `ghost` variant.**
Additive; `primary` and `outline` are unchanged. `outline` is a *red*
outline, so a row of three outline buttons puts three red controls in one
viewport. `ghost` is the neutral secondary: `carbonSurface` fill, hairline
border, `textPrimary` label. Used by PAUSE and PHOTO in the driving HUD.

**D-3 — The speed-limit sign keeps a white disc and a black numeral.**
It is a reproduction of a regulatory road sign, not a UI surface, and a
driver has to read it as one. Restyling it into the palette would make it
stop working. This is the only element on the screen with literal `#FFFFFF`
and `#000000`. The red annulus is `colors.racingRed`, which is close enough
to the real thing to be honest.

**D-4 — `PLAYER_COLORS` stays a six-hue set, re-picked.**
`DESIGN_SYSTEM_AUDIT` §3c blesses this as the one legitimate multi-hue case:
convoy members must be distinguishable at a glance while driving, and a name
label does not do that. The audit's instruction was to re-pick "in a
motorsport register (livery colours, not pastels)", so the old neon set
(cyan / lilac / peach / pink / butter / mint) became six liveries: silver,
works gold, racing green, works blue, gulf orange, maroon. **None of them is
red** — red is the accent, and a driver marker is not an accent.

**D-5 — Marker geometry is fixed pixels, not spacing tokens.**
`poiMarkerWrap` (110), `poiBadgeBox` (66), `playerRingBox` (46),
`eventMarkerWrap` (52), `carMarkerBox` (40×46) and the badge sizes are
literal numbers. Android draws custom marker views by snapshotting them into
a bitmap, and a size change after capture is what produced the
"icons cropped to half size" bug fixed in #37. These bounds must not move
when the content inside them grows on select. Every one is still a multiple
of 2.

**D-6 — Text on the map surface keeps a shadow.**
Marker names, distances and chrome button captions sit directly on map tiles
with no surface behind them, and disappear over light tiles. `mapLabelShadow`
is a legibility device, not an elevation one — it is the only `textShadow` on
the screen, and there are zero `shadowColor` / `elevation` blocks.

**D-7 — The visibility switch keeps `radius.circle`.**
A switch is one of the few controls whose meaning comes from its shape; a
squared-off switch reads as a progress bar. Same exemption avatars get.

**D-8 — The destination is a reticle, not a pin.**
A teardrop pin is what every map provider's default looks like, which is
exactly the "AI-templated" read the brief is trying to remove.
`DestinationMark` is a crosshair ring — and the driver's own marker is a
chevron in a bearing ring, replacing a `#4285F4` Google-blue arrow that was
both off-palette and borrowed from another product.

**D-9 — The route line is one colour, and progress is opacity.**
Was yellow-behind / red-ahead. Now the whole route is `racingRed`: the part
still to drive is the faint casing (`alpha(racingRed, 0.28)`), the part
already driven is solid. That is exactly what `components/RouteLine.tsx`
does on a trip card — ghost path under a solid trace — so a route looks the
same live on the map and afterwards in the log. It also drops from four
polylines per route to two, and from three per recorded path to two.

**D-10 — HUD panel offsets are named constants, not the spacing scale.**
Floating panels overlap rather than stack, so they cannot inherit their
position from a layout. `PLACES_STATUS_OFFSET`, `TURN_CARD_OFFSET`,
`NEARBY_CARD_OFFSET`, `ACHIEVEMENT_STACK_OFFSET`, `BOTTOM_STACK_OFFSET`,
`DROP_PIN_HINT_OFFSET`, `LANDMARK_STATUS_OFFSET`, `FILTERS_POPOVER_OFFSET`,
`TAB_BAR_CLEARANCE` — each is built from spacing tokens and carries its
computed value in a comment.

**D-11 — Weather is monochrome.**
Six conditions carried six pastel colours (`#CFE2FF`, `#7FB2F2`, `#9AA4BC`,
`#B9C2D8`, `#F2C94C`, `#FFD75E`). All six now draw in `textSecondary`; the
shape carries the condition. Weather is supporting information in a 16pt
pill and was spending five palette slots.

**D-13 — Markers are clustered in JS, not by the map engine.**
`react-native-maps` renders whatever `<Marker>` children it is given and has
no clustering of its own, so the reduction happens in `lib/mapClustering.ts`
before the list reaches the map. Grid bucketing rather than a distance-based
clusterer: it is one O(n) pass with no sort, and it is *stable*, so markers
do not reshuffle when unrelated state changes. See §10c for the two modes.

**D-12 — Status colours are gone, not tokenised.**
The screen carried green (online / success / EV), gold (XP / rank), amber
(fuel / warning) and sky blue (profile actions). `DESIGN_SYSTEM_AUDIT` §3d
left this open. This screen resolves it the way the Drive Hub did: **no
status palette.** "Visibility on" is a `textPrimary`-filled switch, not a
green one. XP is a neutral mono readout. The five profile-action rows are
neutral list rows.

---

## 5. Behavioural changes

This was meant to be a pure re-skin. Five things changed anyway, all of them
layout collisions the screenshots exposed. Each is listed so it can be
reverted deliberately rather than discovered.

1. **The Places layer became a mode.** With it open, the greeting/featured
   top chrome and the Live Feed are hidden, and the submit-a-place action
   moves into the bottom-left slot the feed vacates. Previously the filter
   chips rendered *on top of* the greeting card and the callout rendered
   *under* the Drive/Convoy/Chat stack with its close control behind a
   button.
2. **`hudIdle` now also excludes `selectedPlace`,** and the visibility
   banner does too — matching the conditions already there for
   `selectedDestination`, `selectedEvent` and `selectedOnlineUser`. Without
   it, a tapped place fought the same slot.
3. **The filter chip row scrolls horizontally.** Four chips at Rajdhani 12
   overflow a 390pt screen once the chrome column is subtracted, and a
   clipped filter is a filter the driver cannot reach.
4. **The "Nearby" card hides when nothing is in range,** instead of
   rendering a bare header and a chevron.
5. **`PlaceDetailSheet` takes a `bottomInset`** so it clears the floating
   tab bar. It was rendering underneath it.

Nothing else moved. Verified by diff: `startRecording`, `stopRecording`,
`togglePause`, `captureDrivePhoto`, `handleMapPress`, `handleMapLongPress`,
`handleNavigate`, `clearRoute`, `fetchDirections`, the mount-once GPS
watcher, the chase camera, the auto-stop-near-destination check, the route
split index, `SettledMarker`, and every `MapView` gesture prop
(`zoomEnabled` / `scrollEnabled` / `pitchEnabled` / `rotateEnabled` /
`onPress` / `onLongPress` / `onRegionChangeComplete`) are byte-identical.

Where `TouchableOpacity` became `Pressable`, an explicit `pressed` opacity
was added — `Pressable` has no built-in feedback, and losing the press
response on a control you tap while driving would be a real regression.

---

## 6. Error and empty states

Rewritten to the voice rule: **say what happened, then say what fixes it.**
"Route Unavailable" told the driver nothing they could act on.

| Was | Now |
|---|---|
| *Route Unavailable* — "Mapbox access token is missing, so a route can't be calculated." | *Routing is switched off in this build* — "…Update to the latest version from the store — if the newest version does the same, send us the build number from Profile → About." |
| *Route Unavailable* — "No driving route could be found to this destination." | *No road route to that point* — "…it may be offshore, inside a closed area, or on the far side of a water crossing. Drag the pin onto a road and tap Route again." |
| *Route Unavailable* — "Couldn't reach Mapbox. Check your connection and try again." | *Couldn't reach the routing service* — "The request to Mapbox didn't get through, so there's no route yet. Check your connection and tap Route again." |
| "Location permission needed" | "Location is off for Driveverse, so the map can't follow you. Turn it on in your device Settings, then tap Retry." |
| "Could not get location" | "No GPS fix yet — the map is showing a default view. Move somewhere with a clearer view of the sky and tap Retry." |
| *Location Needed* — "We can't find your current location yet…" | *No GPS fix yet* — "A route starts from where you are… wait for the driver marker to appear, then tap Route again." |
| *Sign In Required* — "Create an account to start driving" | *Drives need an account* — "A drive is recorded to your trip log and awards XP, so it can't start while signed out. Sign in from the banner above the tab bar, then tap DRIVE again." |
| *Cancel Event* — "Cancel "X" for everyone?" | *Cancel this event?* — "…will be removed from the map and everyone who joined will be told it's off. This can't be undone." |
| "Couldn't load nearby places, try again." | "Nearby places didn't load — the request to the places service failed. Pan the map to retry this area." |
| "No activity yet — create an event and get the city moving." | "Nothing is running near you yet. Tap Event on the right to put the first one on the map." |

Every one names the control the driver should press. The search empty state
is new: it explains *why* nothing matched ("landmarks load per city") rather
than just reporting zero results.

---

## 7. Self-critique against the brief

Method: exported web build at 390 × 844 @2x, driven with Playwright through
the idle map, the Filters popover, the search overlay, drop-pin mode, the
Places layer, the driving HUD, the route card and the trip summary. Each
frame censused for computed font family, text colour, background colour,
`linear-gradient`, `backdrop-filter` and `box-shadow`.

**Typography is clean.** Every visible text node resolves to
`Rajdhani_600SemiBold`, `Inter_400Regular`, `Inter_500Medium`,
`JetBrainsMono_500Medium` or `JetBrainsMono_700Bold`. The census finds
exactly one non-brand-font node in the whole document, and it is the
`<noscript>` fallback in `index.html` — outside the app.

**Every number is JetBrains Mono, and no number contains a letter.** The
driving stats row, the speedometer, the trip summary, the route card, the
place callout coordinates, marker distances, the XP badges — all mono, with
the unit split into Inter beside the value. The ETA needed a new
`splitDuration()` for this: `routeInfo.durationMin` is a formatted string
like `"28 min"`, and letters inside a mono readout break column alignment
(DRIVE_HUB D-9).

**No gradients, no blur, no shadows — on the screen.** The census finds zero
`linear-gradient` and zero `backdrop-filter` in the map subtree, and zero
`box-shadow` other than the two described below.

**Still failing, and visible in every screenshot: the tab bar.** The two
remaining `box-shadow`s, an orange glow `rgba(255,107,53,0.45)`, an
`expo-blur` panel on iOS and three gradient icon fills all come from
`app/(tabs)/_layout.tsx` and `components/TabIcons.tsx`. It renders over the
map, the Drive Hub and the profile alike, so changing it restyles three
screens in one commit. **This is the second phase running that has flagged
it** (DRIVE_HUB_REFERENCE §5) and it is now the single most off-brief thing
in the app. It should be the next commit.

**The corner cut reads as intentional.** Every brand surface cuts
`topRight`: sheets, cards, chips, markers, badges, buttons, the greeting
card, the speedometer, the Drive button. Utility surfaces stay square —
progress tracks, the search field, the segmented control, chrome buttons,
list rows, the trace frame. Nothing cuts a different corner.

Things the screenshot pass caught and fixed, beyond the red-budget items in
§3:

- The landmark-loading pill spanned the full screen width and ran under both
  the greeting card and the chrome column. Now gutter-constrained and
  dropped below the top chrome.
- The Live Feed and the Chat button were being overlapped by the visibility
  banner; the bottom stack moved from 168 to 192 and the banner copy was cut
  to two lines.
- The drop-pin hint landed on the greeting card and the My Location button.
- The trip summary's close control sat next to its title instead of at the
  far right (`sheetTitle` → `sheetTitleFlex`).
- The visibility switch knob filled its track exactly, so the track was
  invisible.
- The Places error read "…try again. Pan the map to try that area again."

---

## 8. Known gaps

**The Places layer has no entry point.** `setPlacesLayerOpen` is never
called anywhere in the app: the "Places" map button was added in #88 and
removed again in #89 (`ca7ec1d`). Every other part of the feature is live —
the fetch effects, the markers, the long-press-to-submit, the FAB, the
category filters. The layer is fully restyled and was screenshot-verified
through a throwaway build that forces the state open, but **in the shipping
build no user can reach it.** Restoring the button is a one-line change; it
was not made here because removing it was a deliberate product decision two
commits ago, not an oversight to fix inside a re-skin.

**`components/SaveRouteModal.tsx` is still on the legacy styling.** It is
launched by "Save & Share Route" on the trip summary, so there is a visible
style break at that boundary. 92 values; its own pass.

**The map tiles could not be verified visually.** `react-native-maps` has no
web renderer in this build, so every screenshot shows the chrome over a
black map. The overlay layout, type, colour and shape are all verified; what
the markers and the route polyline look like *against actual tiles* is not,
and should be checked on a device before this ships.

**`app/nearby-places.tsx` and `app/route/[id].tsx`** both render map content
and are still legacy. They are reachable from this screen.

---

## 9. Checklist additions for the next screen

Everything in `DRIVE_HUB_REFERENCE.md` §6 still applies, plus:

9. Icons on a map surface are stroke 2; icons in chrome are stroke 1.5.
   Nothing else.
10. Category is shape, state is colour. Do not add a hue per category.
11. Floating panels that overlap need named offset constants with their
    computed value in a comment — the spacing scale cannot express a
    position that is not part of a layout.
12. Anything a native map snapshots into a bitmap needs fixed outer bounds.
    Do not tokenise marker geometry.
13. `Pressable` has no press feedback. If you replace a `TouchableOpacity`,
    add the `pressed` style back.
14. One taxonomy per concept. If two files can disagree about what a
    category is called, they eventually will (§10a).
15. A filter toggle must not trigger a fetch. Fetch everything the panel
    can offer, filter at render — otherwise "instant" is a lie the first
    time the network is slow.
16. Data modules stay free of React imports. `constants/placesCategories.ts`
    is shared with the edge functions and unit-tested; the category→glyph
    binding lives in `components/MapGlyphs.tsx` instead.

---

## 10. Marker taxonomy pass

A later, separate pass — not part of the re-skin. It rebuilt what the
markers *are* rather than how they look, against a reference design that
showed nine POI categories, a Filters panel with real per-category state,
clustered markers, driver headings and a persistent status card.

### 10a. One taxonomy, not two

The screen was carrying two category systems for the same nine things:

| | `LandmarkCategory` | `PlaceCategory` |
|---|---|---|
| Lived in | `app/(tabs)/map.tsx` | `constants/placesCategories.ts` |
| Ids | cafe / restaurant / spbu / shopping / carwash / charging / workshop | cafe / gas_station / workshop / hangout |
| Source | Mapbox Geocoding keyword search | Overpass, behind `/places-nearby` |
| Cache | none | 7-day server-side, ~1km buckets |
| Community submissions | no | yes |
| Reachable in the shipping build | yes | **no** (§8) |

So the ids a driver actually saw came from the path with no cache, no
community layer and no backend contract — and the path with all three was
dark. They are merged onto the Overpass ids.

What that deleted: `fetchAllIndonesiaCafes`, which ran seven keyword
searches against Mapbox Geocoding for each of 24 hardcoded Indonesian
cities on every cold start — **168 requests to fill a list capped at 200
markers for the entire country**, which meant a driver outside those 24
cities saw nothing near them. It is nine cached requests around wherever
the driver is (`hooks/usePlaces.ts`).

The nine categories, and the OSM tags they map to
(`supabase/functions/_shared/overpass.ts`):

| Category | OSM tag(s) |
|---|---|
| `gas_station` | `amenity=fuel` |
| `ev_charger` | `amenity=charging_station` |
| `parking` | `amenity=parking` |
| `workshop` | `shop=car_repair` |
| `car_wash` | `shop=car_wash` |
| `cafe` | `amenity=cafe` |
| `restaurant` | `amenity=restaurant` |
| `shopping` | `shop=mall`, `shop=department_store` |
| `hangout` | `amenity=bar`, `amenity=fast_food`, `leisure=park` |

`restaurant` was inside the `hangout` umbrella and is now its own
filterable category, which is also what stops `hangout` being the densest
layer on the map by a wide margin.

Two query changes came with it. The Overpass query moved from `node` to
`nwr` + `out center`, because malls, car parks and car washes are mapped as
areas far more often than as points and `node` alone missed most of them;
and unnamed results fall back to what the thing *is* ("Car park") rather
than "Unnamed", because most parking bays and charging points carry no
`name` tag at all. `database_migration_places_taxonomy.sql` widens the
`places` check constraint and clears the cache, whose payloads are
undercounted under the old node-only query.

### 10b. What the reference design asked for, and what it got

**The palette was not adopted.** The reference colours a badge per
category — purple shopping, orange cafe/fuel, blue parking, green EV,
red/pink car wash — which is exactly the `CAT_COLORS`/`PLACE_CATEGORY_COLORS`
maps §2 deleted, and exactly what checklist rule 10 forbids. Two of its
hues also collide directly: car-wash red/pink against `racingRed`'s accent
budget (§3), and a green "You" marker against Street Explorer's `#4F9E5A`,
which would make the driver's own marker read as a rank tier. **Confirmed
with the requester before any rendering code was touched.** The reference's
layout, marker anatomy, panel structure and status card were taken; its
hues were not.

Everything else is as specified:

- **Marker anatomy** — icon in a badge, name below, distance below that.
  This was already the shape of `poiMarkerWrap`; it now covers nine
  categories instead of seven and carries the community-submission accent
  outline the Places layer used to own.
- **Driver markers** — the rank colour comes from `frameForLevel()` in
  `constants/rankFrames.ts`, the same table the Profile Frame system reads.
  There is no second rank→colour mapping on this screen. A `HeadingChevron`
  orbits the ring at the driver's bearing, and a driver with no avatar gets
  a car glyph in their rank colour rather than an initial.
- **Filters panel** — nine categories plus events plus other-drivers,
  persisted to AsyncStorage under one key (`lib/mapFilters.ts`).
- **Status card** — "YOU'RE ONLINE", the sentence that says what is shared,
  and a switch that goes offline. Its body opens a visibility sheet.

### 10c. Clustering (D-13)

`react-native-maps` has no clustering, so the marker list is reduced in JS
before it reaches the map (`lib/mapClustering.ts`). Grid bucketing, one
pass, cell size derived from the visible region.

The brief asked which of per-category and global clustering reads better.
Both were built and the answer is *both, by zoom*: per-category keeps the
glyph, so a cluster still says "twelve fuel stations here", and that is
worth more than a bare count through most of the range — but at the far
zoom-out nine categories put nine badges in every cell, which is the case a
bare count handles well. Per-category below `GLOBAL_CLUSTER_DELTA` (~39km
viewport), global above it, individual markers below `CLUSTER_MIN_DELTA`
(~2km viewport). Tapping a cluster fits its members.

**Reduced detail at scale is respected.** Marker rank frames were already
static (`RANK_FRAME_REFERENCE.md`, "the map marker is a special case"), and
nothing added here animates: the heading chevron is a static transform,
bucketed to 15° so a marker re-snapshots on a real change of direction
rather than on GPS jitter.

### 10d. Not done, and why

- **No on-device benchmark.** `lib/mapClustering.ts` is unit-tested — 400
  POIs in a 2km box reduce to under a quarter of the marker count, no item
  is ever lost, clustering is stable under input reordering — but the
  frame-rate measurement the brief asks for needs a device, and there is
  none in this environment. This is the same open item
  `RANK_FRAME_REFERENCE.md` records.
- **No per-audience visibility.** The status card's body opens a sheet that
  states who can see the driver and offers the two controls that exist.
  "Visible to friends only" is not offered because it cannot be enforced:
  position is broadcast on one Supabase Realtime Presence channel
  (`online-players`) that every signed-in client subscribes to, with no
  server-side filter. That is a presence-layer change, not a UI one, and it
  is the follow-up the brief asked to be flagged.
- **Driver markers keep the avatar.** The brief asks for a car symbol on
  driver markers. Where a driver has a photo the photo identifies them
  better than a car does, so the car glyph is the no-avatar fallback rather
  than a replacement. The marker was never a generic pin.
