# Profile + tab bar — Phase 4 rebuild

`components/ProfileScreen.tsx` is the fourth screen onto the Phase 1 token
system, after the Drive Hub and the Map. It is the same file for the
signed-in driver (`app/(tabs)/profile.tsx`) and for anyone else
(`app/user/[id].tsx`), so one pass covers both.

This commit also rebuilds `app/(tabs)/_layout.tsx` and the three tab glyphs
in `components/TabIcons.tsx`. That was not scope creep: the tab bar renders
over the map, the Drive Hub and the profile alike, and both
`DRIVE_HUB_REFERENCE.md` §5 and `MAP_SCREEN_REFERENCE.md` §7 flagged it as
the single most off-brief surface left in the app.

Read `DESIGN_SYSTEM_AUDIT.md`, `DRIVE_HUB_REFERENCE.md` and
`MAP_SCREEN_REFERENCE.md` first; this file only records what is specific to
the profile.

---

## 1. What changed, file by file

| File | Change |
|---|---|
| `components/ProfileScreen.tsx` | Rewritten styling layer. Every `StyleSheet` value replaced; the Trips tab now renders `TripCard`. |
| `app/(tabs)/_layout.tsx` | Rewritten. `expo-blur`, the orange glow shadow and the elevation stack are gone; the bar is a cut-corner carbon surface. |
| `components/TabIcons.tsx` | The three primary glyphs redrawn without gradients, at one stroke weight. Legacy icons untouched. |
| `components/CutCorner.tsx` | **+`CutCornerChip`** (and `chipContentColor`), extracted from the Map's Places filter bar. Additive. |
| `components/PlacesLayer.tsx` | `PlacesFilterBar` and `CategoryPicker` now render the shared chip instead of their own copy. No visual change. |

Measured on the profile after the pass:

| | Before | After |
|---|---:|---:|
| Hardcoded hex / `rgba()` in `ProfileScreen.tsx` | 287 (25 distinct hues) | 2 — D-3's live dot and the modal scrim |
| `fontWeight` declarations | 69 | 0 |
| `<LinearGradient>` elements in `ProfileScreen.tsx` | 13 | 0 |
| `<LinearGradient>` defs in `TabIcons.tsx` | 7 | 0 |
| `shadowColor` / `elevation` in the tab bar | 4 | 0 |
| `BlurView` | 1 | 0 |
| `fontFamily` declarations | 0 | every text style |
| Lines in `ProfileScreen.tsx` | 1,814 | 2,674 |

The file got longer, not shorter, and that is the expected shape of this
change: 287 inline literals collapse into token references that are named
rather than short, four sub-components were pulled out of inline JSX, and
every deviation now carries the comment explaining it.

The screen also stopped importing `react-native-maps`, `MapboxTileLayer`,
`expo-linear-gradient`, `lib/polyline` and `constants/mapStyles`: the Trips
tab's bespoke `TripMiniMap` was replaced by `TripCard`, which draws its
route with `RouteLine`. `DRIVE_HUB_REFERENCE.md` §1 asked for exactly that
("the profile's own Trips tab … should be pointed at `TripCard` when
`ProfileScreen` gets its pass").

---

## 2. The pattern, applied

**Layout and section order are the reference screenshots'.** This is a
re-skin. Every loader, handler, effect, subscription and piece of derived
state below the styling layer is the original, verified by diff:
`loadTargetProfile`, `loadCars`, `loadTrips`, `loadFriends`, `loadInboxes`,
`loadFriendState`, `loadAll`, the realtime DM channel, `handleAddCar`,
`handleDeleteCar`, `handleSetPrimary`, `handleToggleTripVisibility`,
`runGeneration`, `handlePayPremium` and the four friend-request handlers
are unchanged.

**Every number is JetBrains Mono.** The level badge, `LEVEL n`,
`993 / 1049 XP`, the four stat values, the car spec line
(`BMW · 2024 · 300 HP`), per-car distance / avg / XP, `Lv 10`, inbox
timestamps and the unread counts. Units split into Inter beside the value,
per the Drive Hub, so a column of readouts stays aligned.

**The spec line is mono because it is a readout, not prose.** `make · year
· hp` is three data fields with separators — the same shape as the trip
card's stats row.

**One cut corner, one direction.** `topRight` at `cut.md` (14) on brand
surfaces: the rank card, stat cards, car cards, rank progress, the feed
columns, the sheets, the tab bar. `cut.sm` (12) on the chips and buttons
that already carry it. Utility surfaces stay plain rectangles at
`radius.sharp`: the location/vehicle tags, chrome buttons, progress tracks,
text inputs, the settings rows, the driver-row action buttons.

**Settings is a list, not a stack of cards.** Hairline dividers, `body`
labels in `textPrimary`, chevrons in `textSecondary`, all five icons at
stroke 1.5 in `textSecondary`. The previous version had a per-row card and
five different icon colours (blue, gold, gold, grey, grey).

**Spacing is the 4pt scale.** Screen gutter 16, block gap 16, card padding
16, internal card gap 12. The two layout numbers that are not spacing
tokens — the rank card's 108 and the featured image's 176 — are noted in
§4.

---

## 3. The red budget

`theme.ts` says "at most one red element in a viewport". The profile does
not meet that, and the deviation is deliberate — it is the one place the
brief overrides the token file, so it is written down rather than left to
be rediscovered.

Red in the header viewport: the level badge, the rank label under the name,
the XP fill, the active tab chip, the car card's edge accent, and the
featured car's primary action. Six.

The reason: on the Drive Hub and the Map, red marks *the one thing to
press*. On the profile there is no such thing — the page is a status
readout, and red is carrying the **progression system** (level, rank, XP,
the car you are showing off) rather than an action. Each of those five is
specified by the design brief this pass implements. Two things were pulled
back to keep it from going further:

- **The avatar ring is a hairline, not red.** It was an orange gradient.
  The level badge sits on it and is already the red mark there.
- **The Friends tab's FIND button is `ghost`.** With the FRIENDS chip
  active, a red FIND put two red slabs in one row and neither read as the
  accent.
- **The "Add a car" prompt takes red on its icon only,** not its border or
  fill, so it does not compete with the featured card below it.

Rule for this screen, if a sixth red thing is proposed: **red marks
progression state and the single primary action. Nothing else.**

---

## 4. Deviations from the tokens

**D-1 — Rank Progress is kept alongside the header's Current Rank card.**
Two rank surfaces on one page is a real redundancy and it was raised before
building. They were kept because they answer different questions — the
header says *what you are*, the mid-page card says *how far to the next
one* — but they are now unmistakably ranked. The header card is the primary
surface: `carbonSurface` fill, a 54pt badge, the rank name in Rajdhani
`textPrimary`. Rank Progress is secondary: **no fill** (`voidBlack` on
`voidBlack`, hairline only), a 40pt badge, caption-sized name. If the
duplication is ever cut, the mid-page card is the one to remove.

**D-2 — `CutCornerChip` contradicts the header comment in `CutCorner.tsx`,
narrowly.** That comment says chips stay plain rectangles. For a *tag* — an
inert label attached to a value, like the location pill — that still holds,
and those tags are plain rects here. A filter chip is a different object: a
control the user presses, in the same family as the buttons, and the Map
already established it as a brand surface (`MAP_SCREEN_REFERENCE` §7). The
component's docblock states the distinction so the next screen does not
have to re-derive it. The profile's tab selector and the Map's Places
filter bar are now literally the same component.

**D-3 — The live dot stays green (`#22C55E`).** `MAP_SCREEN_REFERENCE` D-12
deleted the status palette, and this is the one exception the brief asked
to keep. A live-activity dot is a real-time state indicator, not a brand
surface, and it is 8×8 — it spends no layout and reads instantly. It is the
only non-palette colour on the screen. The other status colours the profile
used to carry (gold for XP and premium, blue for messages, green for
friend-accept, yellow for pending) are all gone: the premium star and the
PREMIUM tag are `textPrimary` / `textSecondary`, and friend state is a
neutral hairline row.

**D-4 — Two layout numbers are literal, not tokens.** The Current Rank card
is `width: 108` and the featured car image is `height: 176` (4 × 44). Both
are aspect/fit constraints on artwork rather than spacing, and both are
multiples of 4. Everything else on the screen resolves to a spacing token
or a multiple of one.

**D-5 — The tab bar's active indicator keeps `radius.circle`.** The bar
itself takes the cut, but the active mark is a disc behind a glyph — one of
the genuinely circular things `theme.ts` allows, the same exemption the
map's visibility switch got (D-7 there). A squared active mark on a 44pt
slot read as a second, competing card.

**D-6 — The tab bar's backdrop is a solid `voidBlack` band.** It was
`expo-blur` on iOS and `rgba(22,22,40,0.9)` on Android — two different
looks for the same control. There is no blur token, and the bar has to stop
scrolling content showing through it, so it is a surface step. Both
platforms now match.

**D-7 — Help & Support has no destination.** The row was already inert
before this pass (`TouchableOpacity` with no `onPress`), and there is no
`/help` route. `SettingRow`'s `onPress` is optional so the row stays
exactly as inert as it was, rather than being wired to a route that would
404.

---

## 5. Behavioural changes

This was meant to be a pure re-skin. Four things changed anyway:

1. **The Trips tab renders `TripCard`.** Its trip cards previously had
   their own layout and their own live `MapView` per row. The card now
   matches the Drive Hub exactly and draws its route with `RouteLine`.
   Cheaper, and there is no longer a styling break between the two places a
   trip appears.
2. **The secondary garage card gained a delete control.** Removing a
   non-primary car was previously a long-press with no affordance. It is
   now a trash icon beside the set-primary control, matching the featured
   card.
3. **Empty and error copy was rewritten to the voice rule** — say what
   happened, then name the control that fixes it. See §6.
4. **`handleAddCar` writes `colors.racingRed` as a new car's colour**
   instead of the legacy `#FF6B35`. The field is still stored; nothing on
   the profile reads it for styling any more (the edge accent is always
   `racingRed`), but leaving new rows seeded with the old orange would keep
   re-introducing it elsewhere.

Where `TouchableOpacity` became `Pressable`, an explicit `pressed` opacity
was added — `Pressable` has no built-in feedback
(`MAP_SCREEN_REFERENCE` §9.13).

---

## 6. Error and empty states

| Was | Now |
|---|---|
| *Join the Drive* — "Sign up to track your rides, collect cars, earn XP, and connect with fellow drivers." | *Join the drive* — "A profile holds your garage, your trip log and your XP, so it needs an account. Tap Sign In below, or create one from the sign-in screen." |
| *No cars yet* — "Add your first ride to the garage" | *No cars yet* — "Your garage is empty. Tap Add a car below to put your first ride in it." |
| *No trips recorded* — "Start recording a drive to see it here" | *No trips recorded* — "Nothing has been logged yet. Tap DRIVE on the map to record your first one." |
| *No friends yet* — "Search for drivers and add them" | *No friends yet* — "Nobody is on your list yet. Search a driver's name above and tap Find to send a request." |
| "No pending friend requests" | *Nothing waiting* — "No driver has asked to connect yet. Find people from the Friends tab on your profile." |
| "No nearby activity" | "No nearby activity yet." |
| "No messages yet" | "No messages yet." |
| Trip fallback name: "Unknown" | "Unnamed drive" (matches `TripCard`'s `tripTitle`) |

---

## 7. Self-critique against the brief

Method: `expo export -p web`, served with an SPA fallback and driven with
Playwright at 390 × 844 @2x, through the Garage, Trips and Friends tabs,
the mid-page scroll and the notifications sheet. Each frame censused for
computed font family, text colour, `linear-gradient`, `backdrop-filter` and
`box-shadow`. Data was supplied by a throwaway fixture build; the fixture
was reverted before commit.

**Typography is clean.** Every text node on the page resolves to
`Rajdhani_600SemiBold` (17), `Inter_400Regular` (33),
`JetBrainsMono_400Regular` (6), `JetBrainsMono_500Medium` (18) or
`JetBrainsMono_700Bold` (4). The census finds exactly one non-brand-font
node in the document and it is the `<noscript>` fallback in `index.html`,
outside the app — the same single hit the map pass found.

**Every number is JetBrains Mono.** The census lists the mono nodes
explicitly: `6`, `LEVEL 6`, `993 / 1049 XP`, `2`, `0`, `20`, `1`, `BMW ·
2024 · 300 HP`, `1,284`, `47`, `2,574`, `Toyota · 2022 · 232 HP`, `412`,
`39`, `810`, `Lv 10`, `2d`, and both chrome counts. No number renders in
Inter or Rajdhani.

**Zero gradients, zero shadows, zero blur.** `box-shadow` count 0,
`backdrop-filter` count 0. The three non-`none` `background-image` values
are all `url(...)` rank-badge art, which is illustration and stays.

**The colour census is the palette, exactly.** Five text colours across the
whole page: `rgb(11,12,16)` voidBlack, `rgb(38,39,46)` hairline,
`rgb(138,140,150)` textSecondary, `rgb(242,243,245)` textPrimary,
`rgb(255,46,55)` racingRed. Nothing else, plus the `<noscript>` black.

**The tab bar measures correctly.** The surface is 156 × 52 and the active
disc is 44 × 44 inset 4 on every side — the disc fills the bar without
overflowing it, which was the first thing the screenshots were checked for.

Things the screenshot pass caught and fixed:

- **"Street Explorer" truncated to "Street Expl…"** in the Rank Progress
  card's next-rank column — the one piece of information that card exists
  to show. Column widened to 88 and the name allowed two lines.
- **The featured car's silhouette was invisible.** It draws in `hairline`
  and was additionally at `opacity: 0.6`, which on `voidBlack` is nothing.
  The extra opacity is gone.
- **A red FIND button beside the active red FRIENDS chip** (§3).

Still imperfect, and visible in the screenshots:

- **The Live Feed column stretches to the Inbox's height** and leaves dead
  space under its empty-state line when the inbox has two rows. Making the
  columns independent would break their shared baseline, which is worse;
  left as is.
- **"You've earned 2,574 XP" truncates to "You've earned 25…"** in the
  Inbox preview. It is a preview line and truncation is its normal
  behaviour, but this particular row is generated rather than user content,
  so it could be shortened at the source.
- **Settings' last row keeps its bottom divider,** so the list ends on a
  rule rather than on content. Matches the previous behaviour; a
  `:last-child` equivalent would be a one-line change if it should go.

---

## 8. Known gaps

**`app/messages/`, `app/ranks.tsx`, `app/convoy.tsx` and
`app/terms-and-conditions.tsx` are still on the legacy styling.** All four
are reachable directly from the Settings list, so there is a visible style
break one tap off this screen. `ranks.tsx` is the sharpest of them — the
profile now has three entry points into it.

**`components/RankBadge.tsx` still uses `LinearGradient`** for tiers with
no bespoke art, and a `glow` prop. The profile only ever renders tiers that
*have* art (an `<Image>`), so no gradient reaches this screen, but the
component itself has not had a pass.

**The web export cannot verify native behaviour.** The safe-area insets,
the Android status bar and `Modal`'s native sheet animation are all
approximated by react-native-web. Layout, type, colour and shape are
verified; the sheets should be checked on a device.

---

## 9. Checklist additions for the next screen

Everything in `DRIVE_HUB_REFERENCE.md` §6 and `MAP_SCREEN_REFERENCE.md` §9
still applies, plus:

14. A single-select control is `CutCornerChip`. Do not write another one.
15. A tag (inert label on a value) is a plain rect; a chip (a control) takes
    the cut. If it is pressable, it is a chip.
16. A data line with separators — `make · year · hp` — is mono, not body
    copy. "Is this a readout?" not "is this a number?"
17. If a screen shows the same entity twice, rank the two surfaces
    explicitly: one filled, one outline-only. Do not give both the same
    weight and hope the position carries it.
