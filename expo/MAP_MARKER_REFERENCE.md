# Map markers — the rebuild

Companion to `MAP_SCREEN_REFERENCE.md`, which re-skinned the map screen onto
the Phase 1 tokens. This pass changes what the markers *mean*: nine POI
categories instead of four, per-category colour, working persisted filters,
clustering, and a heading indicator on live drivers.

Read `MAP_SCREEN_REFERENCE.md` first. This file only records what is new,
and — more importantly — the three places where this work knowingly departs
from a decision that document made.

---

## 1. What changed, file by file

| File | Change |
|---|---|
| `constants/mapLayers.ts` | **New.** The layer vocabulary: nine categories + `events` + `users`, their order, labels and descriptions. No React, no glyphs, so the filter rule can be unit-tested. |
| `constants/mapCategoryColors.ts` | **New, and quarantined.** Ten category hues. See §2. |
| `constants/placesCategories.ts` | Reduced to the glyph binding; re-exports the vocabulary so existing imports keep working. |
| `components/MapGlyphs.tsx` | +`ParkingGlyph` (the one genuinely missing category icon), +`HeadingChevron`. |
| `hooks/mapFiltersState.ts` | **New.** The pure filter rule. `isLayerVisible` is the single predicate the whole map renders through. |
| `hooks/useMapFilters.ts` | **New.** AsyncStorage-backed store around that rule. |
| `lib/mapClustering.ts` | **New.** Grid clustering, per-category by default. |
| `hooks/usePlaces.ts` | Single category → a set of categories, fetched in parallel, partial failure tolerated. |
| `lib/placesApi.ts` | +`fetchNearbyPlacesMany`. |
| `supabase/functions/_shared/overpass.ts` | Four categories → nine; `node` → `nw` + `out center`; type-namespaced ids; category-aware fallback names. |
| `components/PlacesLayer.tsx` | Multi-select chips; markers rebuilt as badge + name + distance, clustered. |
| `components/CutCorner.tsx` | `CutCornerChip` gained an optional `accessibilityRole` so a chip can be a checkbox. Additive. |
| `constants/theme.ts` | `mapLabelShadow` promoted out of `map.tsx` — two files need it now. |
| `app/(tabs)/map.tsx` | One category vocabulary instead of two; filters wired to the store; Places layer entry point restored; privacy sheet added; heading chevron on driver markers. |
| `app/_layout.tsx` | Mounts `MapFiltersContext`. |

Tests: 139 passing, up from 105. The new ones are `mapFiltersState.test.ts`
(17) and `mapClustering.test.ts` (17).

---

## 2. Category colour — a documented decision, reversed

`MAP_SCREEN_REFERENCE.md` §2 and its checklist item 10 say **category is
shape, state is colour**, and the Phase 3 pass deleted both
`PLACE_CATEGORY_COLORS` and a seven-hue `CAT_COLORS` map to get there.

This pass puts colour back, on an explicit instruction to try it and judge
it on screen. The conflict was raised before any of it was built.

**What is being traded.** The palette is six values; there are now ten more
in `mapCategoryColors.ts`. That file exists specifically so the experiment
is one file to delete rather than ten hues to unpick from the token system.
Nothing outside the map surface imports it.

**What was kept, and why it matters.** Two rules from the old system
survived, because without them the coloured version does not work:

1. **The glyphs still carry the category on their own.** No category is
   identified by hue alone. The layer stays readable in greyscale and for a
   colourblind driver — which matters more here than usual, because the
   warm end of the set (`restaurant` 17°, `cafe` 33°, `gas_station` 47°) is
   crowded and is separated on luminance, not hue.
2. **Selection is still `racingRed`, and no category is.** Nothing sits
   between hue 340° and 10°. "The one you tapped" can never read as "this is
   a restaurant".

**Constraints the ten hues are built on** (full detail in the file header):
mid-luminance so they survive the light/dark tile toggle; all above ~0.20
relative luminance so a single dark ink works on every badge.

**To revert:** delete `constants/mapCategoryColors.ts`, and the `tint` /
`CATEGORY_COLORS` lookups in `PlacesLayer.tsx` and `map.tsx` go back to
`carbonSurface` + `textPrimary`.

---

## 3. Filters actually filter

The rebuild's second non-negotiable. The premise it was written against —
that the panel rendered a toggled-looking checkbox over markers that still
drew — was **not true of the landmark layer**, which already gated on
`visibleCats`. It *was* true of everything else about the feature:

- Preferences reset on every app launch.
- There was no `parking` layer at all.
- The OSM Places layer had its own separate, single-select category picker
  that the Filters panel did not touch.
- The Places layer had no entry point, so none of it was reachable anyway
  (`MAP_SCREEN_REFERENCE.md` §8).

All four are fixed. The structure that makes it hard to regress:

**One predicate.** `isLayerVisible(state, layer)` in `mapFiltersState.ts`.
Every marker render site asks it; nothing draws without asking. It is pure
and unit-tested.

**One vocabulary.** Landmarks and Places used to carry different ids for the
same things (`spbu`/`carwash`/`charging` against
`gas_station`/`car_wash`/`ev_charger`). That is why one panel could not
cover both. There is now one set of ids in `constants/mapLayers.ts` and both
sources speak it.

**One store.** The filter chips over the Places layer and the tick boxes in
the panel write the same state, so they cannot disagree.

**Hidden means not fetched.** `activeCategories` feeds the Overpass request,
so unticking a category stops its network traffic too. With nine categories
live that is the difference between one round trip and nine.

**The acceptance test is automated.** The brief asks for "turn one category
off, confirm only that category vanishes" — run per category. That is
`isolating a layer hides only that layer` in
`hooks/__tests__/mapFiltersState.test.ts`, executed for all eleven layers on
every run. What the test *cannot* prove is that each render site actually
calls the predicate; that is a greppable one-line contract and still wants a
device pass (§7).

---

## 4. Clustering

`react-native-maps` has no clustering — the `ShapeSource cluster` property
the brief specifies belongs to `@rnmapbox/maps`, which this app does not use
(§6). Grouping happens in JS before anything reaches the map, which is the
right place anyway: the cost being avoided is not "drawing 400 symbols" but
"laying out and rasterising 400 view trees", because each marker is a React
view Android snapshots into a bitmap.

**Grid, not distance-based.** O(n) with no distance matrix, and stable under
panning — a marker's cell depends only on its own coordinate and the zoom,
so dragging half a screen does not reshuffle the groupings. Agglomerative
clustering re-seeds from what is in view and makes clusters visibly jump.

**Per-category by default.** A cluster is always "5 cafes", never "5
things". A mixed cluster has no honest colour — with category colours
carrying the meaning of a marker, a cafe + car park + charger cluster could
only draw neutral, throwing away the signal at exactly the zoom where the
map is busiest. It is also not actionable: "7 places here" answers no
question a driver has.

The cost is real: at a dense city zoom this can leave up to one cluster per
category per cell where global clustering leaves one. `mode: "global"` is
implemented and tested, so switching is a one-line change.

**Threshold:** clustering is off below `latitudeDelta` 0.02 (~2 km of
visible height). Zoomed in that far, collapsing two cafes on the same street
into a "2" is worse than a little overlap.

---

## 5. Driver markers

The rank colour comes from `RankFrameRing`, which resolves through
`constants/ranks.ts` — the same source of truth as the Profile Frame system,
per the brief. No second colour mapping was created. Level badges were
already `textStyle("dataSm")`, i.e. JetBrains Mono.

**Heading chevron.** `HeadingChevron`, rotated to the driver's last reported
bearing, pinned inside the ring box (absolutely-positioned children with
negative offsets get clipped out of the native marker snapshot). The
rotation is on a wrapping `View`, not the `Marker`'s `rotation` prop, which
would spin the name label too.

A heading of exactly 0 is treated as "no bearing yet", not due north:
`useOnlineUsers` defaults a null heading to 0, so every parked driver would
otherwise sprout a north-pointing arrow. A driver genuinely heading due
north loses the chevron — a 1-in-360 cosmetic miss against a wrong arrow on
every stationary marker.

**The "You" marker stays red.** The reference design shows green; green
collides with rank tier 2, *Street Explorer* (`#4F9E5A`, levels 10–19), one
of the most populated tiers. The driver's own marker keeps `DriverMark` — a
red chevron in a bearing ring — and is separated from other drivers by
*form*, not hue. No rank tier uses `racingRed`.

**No animation on markers.** Unchanged, and now for a third reason on top of
the two in `rankFrames.ts`: a clustered marker set re-lays-out on every
region change.

---

## 6. The renderer the brief assumed does not exist

The brief specifies `@rnmapbox/maps` throughout — `ShapeSource`,
`SymbolLayer`, `addImage`, layer `filter` expressions, built-in clustering.
**That package is not a dependency.** The app renders on
`react-native-maps` 1.20.1: no style layers, no image registry, no filter
expressions. Markers are React views snapshotted to bitmaps.

Every requirement was met against the renderer that is actually here:

| Brief | Built as |
|---|---|
| `addImage` + `SymbolLayer` per category | Hand-drawn SVG glyphs in React marker views |
| Layer `filter` expression per toggle | `isLayerVisible` gating the render, plus dropping the category from the fetch |
| `ShapeSource` clustering | `lib/mapClustering.ts` |

Switching to `@rnmapbox/maps` would mean rewriting all ~6,400 lines of
`map.tsx` against a different marker, camera and gesture API, and adding a
native module to a Rork-managed Expo build. It was not attempted, and
nothing here forecloses it: the glyphs are SVG (rasterisable for `addImage`),
the filter rule is pure data, and the clustering module has the same
input/output shape as a `ShapeSource` cluster.

---

## 7. Known gaps

**Not verified on a device.** This is the significant one — and when it was
finally run, all four of the bullets below turned out to be blocked behind
three bugs that emptied the layer entirely. **See §10.** The rest of this
section is left as written, because the bullets it lists are still open.

The brief's
acceptance test — toggle each category off, screenshot, confirm only that
category vanished — has been automated at the state layer but **not run on
hardware**. `react-native-maps` has no web renderer in this build (the same
limitation `MAP_SCREEN_REFERENCE.md` §8 records), so no screenshot of an
actual marker over actual tiles was possible here. Specifically unverified:

- Whether ten category hues are distinguishable at 24 px over real tiles —
  the whole point of the colour experiment, and the thing most likely to
  come back "no". The warm ramp (`restaurant` / `cafe` / `gas_station`) is
  the first place to look.
- Whether per-category or global clustering reads better at a dense city
  zoom. Both are implemented; the comparison is a one-line change.
- Marker bitmap bounds on Android with the new two-line label.
- That every render site honours the predicate.

**Visibility is all-or-nothing.** There is no friends-only or convoy-only
option. `useOnlineUsers` broadcasts to one channel every signed-in driver
subscribes to, and `user_locations` is readable by any authenticated user —
scoping it is a schema change (an audience column plus RLS on the read
path), not a UI toggle. The privacy sheet states this plainly rather than
implying a control that does not exist. **Follow-up task.**

**Two POI sources still overlap.** Landmarks (Mapbox geocoding, always on)
and Places (Overpass + community, always on — see §9) can both draw a
marker for the same real-world place. They now share one vocabulary and one
filter, so it is coherent, but the deduplication `mergePlaces` does within
the Places layer does not run across the two.

**`hangout` lost `amenity=restaurant`** to the new `restaurant` category.
Cached Overpass responses keyed on the old tag list will serve the old
grouping until they age out (7 days).

---

## 8. Checklist additions

Everything in `MAP_SCREEN_REFERENCE.md` §9 still applies, plus:

14. There is one layer vocabulary, in `constants/mapLayers.ts`. Do not add a
    category id anywhere else.
15. Nothing renders a marker without asking `isLayerVisible`.
16. A hidden category should cost no network.
17. Category colour is an experiment quarantined in one file. If you find
    yourself importing it outside the map surface, stop.
18. **No marker sets `tracksViewChanges` itself.** Every custom marker goes
    through `components/SettledMarker.tsx`. A constant `false` freezes the
    Android bitmap before the SVG inside it has drawn, and the marker stays
    blank for its whole life — see §10c.
19. **Nothing asks a POI provider for "everything, nationwide".** POIs are
    fetched for the area on screen, bounded by a radius, and refetched when
    the map moves. A geocoder proximity hint is a ranking preference, not a
    filter — see §10a.

---

## 9. The "Places" chrome button is gone

The separate "Places" button in the right-hand chrome column (§1, §7) was
removed. It toggled a second, independent on/off state (`placesLayerOpen`)
for the same layer the Filters popover already gates per-category, which
meant two problems in practice: the layer defaulted to closed so its markers
never appeared until a driver found and tapped that specific button, and the
button's own icon/chip-bar duplicated controls the Filters popover already
had. `PlacesFilterBar` (the top chip row) is gone for the same reason —
`MAP_LAYERS.map(...)` in the Filters popover already lists every one of
these categories with a checkbox.

The Places layer (`PlacesMarkers`, fetched via `usePlaces`) is now mounted
unconditionally once `filtersReady`, exactly like the landmark layer always
was — gated only by `isLayerVisible`/`activeCategories`, never by a second
open/closed flag. Long-press-to-submit and the submit-place FAB are likewise
no longer conditioned on a "layer open" state.

---

## 10. The device pass: no custom markers on screen at all

§7 called the device pass the significant gap. It happened, on an Android
handset in Kalibata, Jakarta, and the answer was worse than "the ten hues are
hard to tell apart": **not one custom marker drew.** Google's own baked-in POI
labels were the only things on the tiles, the console carried
`fetchNearbyPlaces failed: FunctionsHttpError`, and the live feed was offering
a "nearest parking" **724 km away**.

Three independent faults, each of which alone empties the layer. None of them
is Expo Go — `react-native-maps`, `react-native-svg` and `expo-location` are
all in the Expo Go runtime, and `app.json` carries a Google Maps key for both
platforms. The same build fails the same way in a dev client.

### 10a. The landmark layer never looked where the driver was

`map.tsx` walked a hardcoded twenty-city `INDONESIAN_CITIES` list on first GPS
fix, ran nine geocoder queries per city, and kept `.slice(0, 200)`. Nine
categories at `limit=10` is up to ninety results *per city*, so the cap was
spent inside the first two or three cities, and nothing ever refetched for
where the driver actually was.

Worse, the queries were wrong in kind. Mapbox Geocoding v5 is a **name**
matcher; `proximity` re-ranks results, it does not restrict them, and a fuzzy
name hit always beats returning nothing. Querying `"parking"` near Jakarta is
how *Paring Raya* — a street 724 km away, one letter off — became the map's
nearest car park.

Now: one fetch centred on the driver, refetched when the map centre moves more
than `LANDMARK_REFETCH_METERS`, with `types=poi` so the geocoder answers with
POIs instead of streets and regions, and a hard `maxDistanceMeters` radius in
`searchPlaces` so a name match in another province can never reach a marker.
The radius is the load-bearing part: `types=poi` narrows the *class* of
answer, only the radius bounds *where* it can be.

### 10b. Nine parallel Overpass queries, from one IP

`fetchNearbyPlacesMany` fired every ticked category at once, on the reasoning
that the wall-clock cost is then one round trip however many boxes are ticked.
That held at four categories and broke at nine. The bottleneck is not the
client: each request becomes an edge-function invocation making its own
Overpass query, all leaving Supabase from **one egress IP**, and
`overpass-api.de` refuses anything past its small per-IP slot count with an
immediate **429** rather than queueing it. Past two or three, extra
parallelism converts into failures, not speed — which surfaced as
`Edge Function returned a non-2xx status code` for whichever categories lost
the race.

Fixed at both ends:

- **Client** (`lib/placesApi.ts`) windows the requests through
  `mapWithConcurrency` (`lib/concurrency.ts`, pure and unit-tested) at three
  at a time, and retries once on 429/5xx. It also reads the real status off
  `error.context`, so the log now says *which* failure it was — 429, 502, 400
  and 404 all need different fixes and were previously indistinguishable.
- **Server** (`_shared/overpass.ts`) retries a retryable status twice per
  endpoint and falls through to the kumi.systems mirror. A 429 is "ask again
  in a moment", not "there are no places here", and turning it straight into a
  502 is what made a ticked category read as a dead feature.

A malformed request (4xx that is not 429) is *not* retried at either end —
it fails the same way at every mirror, and retrying only spends the driver's
time to fail four times instead of once.

### 10c. `tracksViewChanges={false}` froze the marker bitmap before it drew

This one bites only once the other two are fixed, and it is the reason to
distrust "no markers" as a symptom: the markers would have been present,
tappable and blank.

Android does not render a custom marker's React view on the map — it
rasterises the view into a bitmap and draws that. `PlacesMarkers` passed
`tracksViewChanges={false}` as a **constant**, which freezes that bitmap on
the first frame: before `react-native-svg` has painted the glyph and before
the name/distance text has laid out. Tracking never turns back on, so the
empty snapshot is permanent. It is D-5's "icons cropped to half size" in its
worst form.

`SettledMarker` — the wrapper `map.tsx` already used for landmark and driver
markers — has always handled this: track until the content is `ready` and
`settleKey` has held still for 600 ms, then freeze. It now lives in
`components/SettledMarker.tsx` and **both** layers use it. Two marker
wrappers with two different freeze policies is precisely what left one layer
blank while the other was fine.

### What this changes about §7

The colour experiment is still unjudged — nothing was legible enough on
screen to have an opinion about ten hues. Per-category vs global clustering
and marker bitmap bounds with the two-line label are likewise still open. The
device pass has to be re-run now that there is something to look at.
