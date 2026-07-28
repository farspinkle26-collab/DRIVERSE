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

Ten glyphs are now drawn by hand: cafe, food, fuel, workshop, hangout,
shopping, car wash, charging, event, driver. Plus three non-category marks:
`DestinationMark`, `DriverMark`, `VisibilityGlyph`.

All of them use `strokeLinecap="square"` and `strokeLinejoin="miter"`.
lucide's family is round-capped and round-joined, which reads as the
opposite of the corner cut and the 1px hairlines; mitred joins put the icons
in the same register as everything else on the screen.

Deleting the bitmaps also deleted the load-gating: SVG lays out
synchronously, so `SettledMarker`'s grace period alone now covers the
Android snapshot. The gate is still in place for **online driver avatars**,
which are genuinely network images.

**Category is shape. State is colour.** That is the rule that lets eleven
map categories live inside a six-value palette. A marker is
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
| **Trip summary** | SAVE (SHARE beside it is `ghost`) |

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

A sixth changed later, in the save-route pass — it is a behaviour change,
not a layout collision, so it is listed separately:

6. **SHARE on the trip summary is no longer gated on SAVE.** It was
   `disabled={savedRouteId == null}`, which tied the growth loop to a
   database write: any save failure — offline, expired session, route
   library full — silently took sharing away too, and the two failures
   looked identical from the driver's seat. `ShareCardModal` renders from
   the in-memory trip and never needed the row. SAVE still flips to a
   locked-in "Saved" state, so which of the two has happened is still
   visible. See `SAVE_ROUTE_REFERENCE.md`.

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
