# Drive Hub — Phase 2 reference implementation

`app/(tabs)/drive.tsx` is the first screen rebuilt entirely on the Phase 1
token system (`constants/theme.ts`, `components/CutCorner.tsx`, the
Rajdhani / Inter / JetBrains Mono faces). It is the pattern the remaining
screens copy, so this document records **what the pattern is**, **every
deviation from the tokens and why**, and **the self-critique against the
brief**.

Companion to `DESIGN_SYSTEM_AUDIT.md`, which measured the debt. This one
spends it.

---

## 1. What was built, and where the screen came from

There was no single Trips screen to redesign. The pieces were spread over
two places:

| Piece | Lived in | Now |
|---|---|---|
| Trip cards (route code, distance, duration, avg speed, XP, mini map) | `components/ProfileScreen.tsx`, Trips tab | `components/TripCard.tsx`, rendered by the Drive Hub |
| Drive "hub" (feature grid + daily quests) | `app/(tabs)/drive.tsx` | Same file, restyled, demoted below the trip log |
| Stat counts (Cars / Friends / Trips / Streak) | `ProfileScreen`, as a 4-cell row | `components/HubStatStrip.tsx`, 5 cells incl. Alerts |

So the Drive tab became the Trips/Drive Hub: **trip log first**, quests and
explore behind a view switch. The profile's own Trips tab is untouched in
this phase and still runs the old styling — it should be pointed at
`TripCard` when `ProfileScreen` gets its pass.

New files:

```
app/(tabs)/drive.tsx        rewritten — screen
components/TripCard.tsx     trip card (the reference card)
components/HubStatStrip.tsx Cars/Drivers/Trips/Alerts/Streak
components/RouteLine.tsx    self-drawing route trace
hooks/useDriveHub.ts        one query for the whole screen
hooks/useReducedMotion.ts   OS reduce-motion flag
lib/tripStats.ts            formatters + derived drive score
components/CutCorner.tsx    +1 additive prop (see D-5)
```

---

## 2. The pattern to copy

**Every number is JetBrains Mono.** Distance, duration, average speed,
score, XP, and the five header counts all render through `dataLg` (one per
card, the hero) or `dataSm` (everything else). Units are *not* part of the
readout — `formatDistance()` returns `{ value, unit }` so `km`, `km/h` and
`h:m:s` render in Inter/`caption`/`textSecondary` beside the mono value.
That is what keeps a column of stacked cards aligned.

**Type roles are strict.** Rajdhani for the screen title, card headers,
tile titles and button labels. Inter for timestamps, place names, unit
suffixes and body copy. Nothing on this screen sets `fontWeight` — weight
comes from the face, per the token file.

**One cut corner, one direction.** Every brand surface on the screen cuts
`topRight` at `cut.md` (14): trip cards, quest cards, explore tiles, the
stat strip, badges, buttons. Utility surfaces (the route-trace frame, the
progress track, dividers) stay plain rectangles. A cut that always lands in
the same corner reads as a motif; a cut that moves reads as an accident.

**Separation is hairlines and surface steps, never shadows.** The screen
contains zero `shadowColor`, `elevation` and zero gradients.

**Spacing is the 4pt scale, no exceptions.** Screen-edge margin
`spacingLg` (16), gap between stacked cards `spacingLg` (16), gap between
blocks `spacingXl` (24), card padding `spacingLg` (16) on all four sides,
internal card gap `spacingMd` (12). Every layout size that is not a spacing
value is a multiple of one (trace height 96 = 4 × 24; tile height 128 =
4 × 32).

**Red budget.** Per viewport: the primary action (NEW TRIP), the active
view rule, and a non-zero Alerts count. Per card: the route-code badge, the
route trace with its end marker, and — only at score ≥ 90 — the score
badge. Everything else is `textPrimary` or `textSecondary`.

**One motion moment.** The route trace draws itself once on mount over
`duration.slow` (320 ms), linear, and stops. Nothing loops, bounces or
reacts to hover. Verified end-to-end: sampled `stroke-dashoffset` falls
326 → 0 across ~13 frames with motion allowed, and is 0 on first paint with
`prefers-reduced-motion: reduce`.

---

## 3. Deviations from the Phase 1 tokens

Each one is a decision later phases should copy rather than re-litigate.

**D-1 — View-switch labels are outside the type scale.**
Rajdhani SemiBold 13/16, `letterSpacing: 1`. `displayMd` (20) is a section
header, and `body` (Inter 15) is the wrong family for signage. Precedent:
`CutCornerButton` already sizes its own label (13/15/17). **Rule: controls
size their own labels; content never does.** If a third control needs this,
promote it to a `controlLabel` token.

**D-2 — Icon stroke weight 1.5, which is not a token.**
lucide defaults to 2, which at 12–16pt next to a 1px hairline reads heavier
than the borders around it. Every icon on this screen passes
`strokeWidth={ICON_STROKE}` (exported from `TripCard.tsx`). **Recommend
promoting it to `borderWidth.icon = 1.5` in `theme.ts`** so it stops living
in a component.

**D-3 — Icon sizes are taken from the spacing scale.**
12, 16 (`spacingLg`), 24 (`spacingXl`). `theme.ts` has no size scale; the
app currently uses 27 distinct icon sizes. Reusing spacing values is the
cheapest way to stop that spread.

**D-4 — Red is budgeted per card, not per viewport.**
`theme.ts` says "at most one red element in a viewport". A scrolling list of
cards cannot honour that literally — three cards would mean two of them go
grey, which reads as a bug. Restated: **one red identity mark per card plus
its data trace; screen chrome gets one more (the primary action).**

**D-5 — `CutCornerBadge` gained a `textColor` prop.**
Additive, default behaviour unchanged. The badge previously drove border and
text from one `color`, so a neutral hairline outline forced a hairline-
coloured, invisible label — which is exactly what the score badge below 90
did until the screenshot audit caught it.

**D-6 — The drive score is derived, not stored.**
`trips` has no score column. The live "smooth drive" score on the map screen
is computed from GPS speed deltas and thrown away when recording stops, so
it cannot be reproduced for a past trip. `driveScoreBreakdown()` in
`lib/tripStats.ts` derives 0–100 from persisted columns: peak-vs-average
spread (≤30), duration vs the routing estimate (≤20), top speed over
120 km/h (≤20). Stable across devices and sessions. **If a real score is
ever persisted, swap the implementation — not the call sites.**

**D-7 — The card shows a route trace, not a map preview.**
The old card mounted a `react-native-maps` instance per row. That is a map
per row on scroll, and it drags a provider's palette (green parks, blue
water) into a six-value palette. `RouteLine` draws the recorded polyline as
SVG over two hairline axes. Fallback when no polyline was recorded: the
origin/destination pair; if neither, the caption "No route trace recorded".

**D-8 — Explore tiles lost their photographic backgrounds.**
React Native has no `clip-path`, so a full-bleed bitmap squares off the very
corner the shape exists to cut. Photos stay in `assets/images/features` for
plain-rectangle surfaces (trip detail, event headers). **Rule: cut-corner
surfaces are flat fills only.**

**D-9 — Duration renders as a clock (`2:04:22`), not `2h 4m`.**
Letters inside a mono readout break column alignment across stacked cards.
The unit label `h:m:s` carries the meaning, in Inter.

**D-10 — The header strip counts use `dataSm`, not `dataLg`.**
One `dataLg` per card keeps distance as the loudest number on the screen. A
strip of five 28pt counts would out-shout the trips they describe.

**D-11 — Timestamps are absolute (`Yesterday, 21:12`), not relative.**
A trip log is a record. "3 hours ago" is right for a feed, wrong for a log.

**D-12 — Motion easing is `Easing.linear`; `theme.ts` has no easing token.**
A plotter trace moves at constant speed. Add an easing token when a second
animation needs one.

---

## 4. Icon audit (as requested)

State of the icon set across `app/` and `components/`:

| Finding | Count | Verdict |
|---|---:|---|
| Distinct explicit `strokeWidth` values | 9 (1.4, 1.5, 1.6, 2, 2.2, 2.3, 2.4, 2.5, 2.6) | **Mismatch** — no rule, values picked per call site |
| Icons on lucide's implicit default (2) | the large majority of 230+ sized usages | Inconsistent with the 1px hairline system |
| Map POI icons | 20 at `strokeWidth 2.2` | **Mismatch** — heavier than everything else |
| Distinct icon `size` values | 27 (11 → 132) | **Mismatch** — 16/18/20/14/13 all in use for the same job |
| `components/TabIcons.tsx` | 3 internal mismatches | `DriveIcon` inner circle at 1.5 vs 2 on its siblings; `WalletIcon` detail at 1.5; `InsuranceIcon` check at 2.5 |
| `components/TabIcons.tsx` fills | 3 `LinearGradient` defs, legacy orange `#FF6B35`/`#FF8A50`/`#FF3B6F` | **Off-palette and off-brief** — the only gradients still rendering next to this screen |

The Drive Hub pins **stroke 1.5, sizes 12/16/24, colour `textSecondary`
(or `racingRed` when the cell is an active alert)** and nothing else. The
tab bar was left alone deliberately — see §5.

---

## 5. Self-critique against the brief

Checked against the four questions in the brief, using the exported web
build (390 × 844) and a DOM census of every computed colour, font and SVG
paint on the screen.

**No purple/blue gradients or blur panels crept in — on the screen itself.**
DOM census found zero `linear-gradient` and zero `backdrop-filter` inside
the Drive Hub subtree. Text colours resolve to exactly four palette values
(`textPrimary`, `textSecondary`, `racingRed`, `voidBlack` on red); surfaces
to `voidBlack`, `carbonSurface`, `hairline`, `racingRed`.

**Failing, and visible in the screenshot: the floating tab bar.** It is not
part of this screen — `app/(tabs)/_layout.tsx` renders it over every tab —
but it sits in the same viewport carrying an `expo-blur` panel on iOS, two
drop shadows, an orange glow `rgba(255,107,53,0.45)`, and three gradient
icon fills. Changing it would restyle the map and profile tabs in the same
commit, which is the shell phase's job (audit §8, item 1), so it is flagged
here rather than fixed. **It is the single most off-brief thing in the
screenshot, and it should be phase 3's first commit.**

**Red is used sparingly.** Per viewport in the screenshot: NEW TRIP, the
active view rule, the Alerts count, and per card the route-code badge, the
trace and (at 95) one score badge. Red covers a small fraction of pixels and
never lands on a neutral element. The honest risk is the trace: three cards
in a viewport means three red lines. It survives because the trace is data —
if the list ever gets denser, the trace is the first thing to go
`textSecondary`.

**The corner cut reads as intentional.** Every surface cuts `topRight` at
14pt; nothing cuts a different corner or a different size, and utility
surfaces stay square. Two places where the cut is doing real work: the badge
and the primary button repeat the card's geometry at small scale.

**All numbers are in JetBrains Mono.** Verified programmatically: every
text node matching `^[+-]?[\d.,:]+$` resolves to a `JetBrainsMono_*` family
— 0 exceptions. Visible text on the screen uses only Rajdhani (8 nodes),
Inter (36) and JetBrains Mono (23).

Other things the critique caught and fixed:

- Score badge below 90 rendered its label in `hairline` on `carbonSurface`
  — invisible. Fixed by D-5.
- Explore tile chevrons collided with the cut corner; moved to the label row.
- The empty state had a second NEW TRIP button duplicating the header one;
  removed, so the copy ("Tap New Trip…") points at exactly one control.

Not addressed, deliberately:

- `ProfileScreen`'s Trips tab still renders the old card. Same data, two
  designs, until that file's pass.
- The root `Stack` still paints `#0A0A0F` and the tab navigator `#161628`
  behind scenes; both are one-line changes owned by the shell phase.

---

## 6. Checklist for the next screen

1. Import from `@/constants/theme` — no literals, including opacity
   (`alpha()`).
2. Numbers → `dataLg`/`dataSm`; unit suffix split into Inter/`caption`.
3. Brand surface → `CutCornerSurface`/`Card`/`Button`/`Badge`, cut
   `topRight`, `cut.md`. Utility surface → plain rect.
4. Delete every `fontWeight`, `shadow*`, `elevation`, `LinearGradient` and
   `BlurView` you touch.
5. Icons: stroke 1.5, size 12/16/24, `textSecondary` unless the element is
   genuinely an accent.
6. Screen-edge margin 16, block gap 24, card gap 16, card padding 16.
7. Motion: at most one moment per screen, ≤ 320 ms, gated on
   `useReducedMotion()`.
8. Empty states get a sentence that names the control the user should press.
