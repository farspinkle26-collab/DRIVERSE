# Garage gate ("Choose your ride") — Phase 5 rebuild

`app/select-car.tsx` is the fifth screen onto the Phase 1 token system,
after the Drive Hub, the Map, the profile and the tab bar. It is the screen
between opening the app and driving — `app/index.tsx` redirects straight to
it — so it is the first Driveverse surface most sessions see.

Read `DESIGN_SYSTEM_AUDIT.md`, `DRIVE_HUB_REFERENCE.md`,
`MAP_SCREEN_REFERENCE.md` and `PROFILE_SCREEN_REFERENCE.md` first; this file
only records what is specific to the garage gate.

---

## 1. What changed, file by file

| File | Change |
|---|---|
| `app/select-car.tsx` | Rewritten styling layer. Every `StyleSheet` value replaced; the four render states (loading / guest / empty garage / carousel) all rebuilt on the tokens. |
| `components/CutCorner.tsx` | **+`trailingIcon`** on `CutCornerButton`. Additive; every existing call site is unchanged. |

Measured on `app/select-car.tsx` after the pass:

| | Before | After |
|---|---:|---:|
| Hardcoded hex | 74 | 0 |
| Hardcoded `rgba()` | 23 | 0 |
| `fontWeight` declarations | 18 | 0 |
| `<LinearGradient>` elements | 10 | 0 |
| `fontSize` numerics | 24 | 1 — the shared `OVERLINE` literal |
| `borderRadius` numerics | 19 | 0 (6 references, all `radius.*`) |
| `fontFamily` declarations | 1 (`Menlo`/`monospace`) | every text style |
| Lines | 868 | 988 |

The `Menlo`/`monospace` fallback on the licence plate was the **only**
`fontFamily` declaration in the entire app when `DESIGN_SYSTEM_AUDIT.md` was
written (§ line 29). It is gone: the plate is `JetBrainsMono` like every
other readout.

---

## 2. The brief, applied

**Header.** `✦ YOUR GARAGE` is the shared `OVERLINE` (Rajdhani SemiBold 11 /
tracking 1) with the sparkle at `ICON_SM` in `racingRed`. **"Garage Stats"
uses the profile's "See All" convention exactly** — `textStyle("caption")` in
`racingRed`, `accessibilityRole="link"`, `hitSlop`, no pill, no border, no
chevron. It was a bordered translucent pill with its own chevron; the app now
has one link convention and this screen does not invent a second. The
chevron went with the pill for the same reason.

**Title.** `Choose your ride` is `displayXl` (Rajdhani Bold 32) in
`textPrimary`; the welcome line is `body` in `textSecondary`.

**Car card.** `CutCornerSurface`, `carbonSurface` fill, hairline outline,
`topRight` at `cut.md` — the same brand surface as the profile's featured
car. The per-car `LinearGradient` (a colour-derived three-stop wash), the
per-car radial glow and the looping ambient glow behind the carousel are all
gone. `PRIMARY` is a solid `CutCornerBadge` in `racingRed` with `voidBlack`
text, not a full-width orange pill.

**The photo circle stays circular.** `radius.circle` is a photo mask here,
not a shape decision — the same exemption `theme.ts` grants avatars. Its
placeholder is the profile's 64pt `Car` glyph.

**Every number is JetBrains Mono.** Year, licence plate, HP, 0-100, the
drivetrain code, per-car km / XP / avg speed, and all four garage-wide
counts. Units and labels split into Inter/`caption`/`textSecondary` beside
the value, per the Drive Hub, so a row of readouts stays aligned.
`RWD` / `AWD` is mono for the same reason `make · year · hp` is on the
profile: it is a readout, not prose (checklist 16).

**Pagination.** 4pt bars, not dots: inactive `hairline` at 8 wide, active
`racingRed` at 24 wide. No radius — the marks are the one place a pill would
have been most tempting. They are hidden entirely when there is one card.

**CTA.** `CutCornerButton` `primary` `lg`, a solid `racingRed` slab with
`voidBlack` Rajdhani caps. The pink-to-orange gradient (`activeColor` →
`#FF3B6F`) is gone. This is the only new API in the pass: `trailingIcon`,
so the forward chevron sits after the label instead of leading it. The label
carries `flexShrink: 1` and `numberOfLines={1}`, verified against
`DRIVE THE MODEL 3 PERFORMANCE` at 390pt.

**"Manage garage"** is a plain `racingRed` text link with a `racingRed` plus
at `ICON_MD` — no fill, no border, no card.

**Icons.** Every icon on the screen is lucide at `ICON_STROKE` (1.5) and one
of 12 / 16 / 24. Before the pass the screen mixed 12, 14, 16, 18, 20, 40,
48 and 132 at three different weights.

---

## 3. The red budget

`theme.ts` says "at most one red element in a viewport". The carousel
viewport has seven, which is more than the profile's six, and the deviation
is deliberate rather than accidental:

1. the `YOUR GARAGE` overline and its sparkle,
2. the `Garage Stats` link,
3. the `PRIMARY` badge on the focused card,
4. the active pagination mark,
5. the active category chip,
6. the `DRIVE THE …` slab,
7. the `Manage garage` link.

Six of the seven are named by the design brief this pass implements: the
brief asks for a racingRed accent icon, the See All link convention, a
racingRed PRIMARY badge, a racingRed active dot, a bold solid racingRed CTA
and a racingRed text link. The seventh — the active filter chip — is the one
this pass chose, and §4 D-2 says why.

Everything that could be pulled back, was. The card no longer carries a
per-car colour anywhere (§5.1), the menu button is a hairline rect rather
than an accent, the spec icons are `textSecondary`, and the guest and empty
states each hold exactly one red slab plus their escape-hatch link.

Rule for this screen, if an eighth red thing is proposed: **red marks the
primary action, the state of the selection (primary car, active card, active
filter) and the two links. Nothing else.**

---

## 4. Deviations from the tokens and the brief

**D-1 — The corner cut appears on three things, not two.** The brief's
self-check says the cut belongs on the car card and the CTA only. It is also
on the category filter chips, because `PROFILE_SCREEN_REFERENCE` checklist
item 14 says a single-select control **is** `CutCornerChip` and item 15 says
a pressable is a chip — the alternative was writing a second, differently
shaped filter control for one screen. Everything the self-check explicitly
names is honoured: the pagination marks and both text links have no cut, and
so do the spec strip, the garage-stats strip, the menu button, the inputs and
the empty-state mark. If the brief means "only two" literally, the chips are
the one line to change.

**D-2 — The spec strip inside the card is a plain rect.** It is a readout
inside a surface that has already spent the cut, exactly as `HubStatStrip`
spends it once for five cells rather than five times. `radius.sharp`,
hairline outline, hairline dividers.

**D-3 — The card is `minHeight`, not `height`.** The original fixed the card
at `min(CARD_WIDTH × 1.28, 440)`. Cards with recorded drive data overflow
that, and because react-native-web clips a `View`, the first screenshot pass
showed a card whose **name had been clipped out of existence**. A floor of
400 keeps one baseline across the carousel and lets a data-rich card grow
instead of losing content.

**D-4 — Licence plate and drive data were re-laid-out, not re-styled.** The
plate had its own bordered block and the drive data its own three-cell strip;
together with the spec strip that is three stacked readouts and a card taller
than the viewport it has to share with the header, the filter row and the
CTA. The plate joined the identity line (`make · year · plate`, one readout)
and the drive data became one caption line
(`1,284 km · 2,574 XP · 47 km/h avg`, values mono). No information was
dropped.

**D-5 — The looping glow animation is deleted, and the carousel transform is
gated.** The screen ran a 2,200 ms `Animated.loop` behind the cards forever,
against the ≤ 320 ms / one-moment-per-screen rule. The remaining motion is
scroll-linked rather than timed — the card tracks the finger — and it is
switched off under `useReducedMotion()`. The 24pt vertical bob on the
neighbouring cards is gone; scale and opacity carry the focus on their own.

---

## 5. Behavioural changes

This was meant to be a pure re-skin. Three things changed anyway:

1. **The per-car `color` field no longer styles anything.** It drove the card
   gradient, the card glow, the spec icons, the active dot and the CTA
   gradient — that is one user-chosen hue washing five surfaces, which is the
   thing the six-colour palette exists to stop. The column is untouched in
   the database and the profile still stores it; nothing on this screen reads
   it. (The profile made the same call for its car cards —
   `PROFILE_SCREEN_REFERENCE` §5.4.)
2. **Pagination marks are hidden for a single-car garage.** One dot is not
   pagination.
3. **Empty and error copy was rewritten to the voice rule** — say what
   happened, then name the control that fixes it. "No cars in this category
   yet." now continues "Pick All Cars to see the whole garage."

`TouchableOpacity` became `Pressable` throughout, each with an explicit
`pressed` opacity (`MAP_SCREEN_REFERENCE` §9.13).

---

## 6. Self-critique against the brief

Method: `expo export -p web`, served with an SPA fallback and driven with
Playwright at 390 × 844 @2x across all four render states and the carousel's
last card. Each frame censused for computed font family, text colour,
`linear-gradient`, `backdrop-filter`, `box-shadow` and `border-radius`. Data
came from a throwaway fixture build; the fixture and its `.env` were removed
before commit.

**Zero gradients, zero shadows, zero blur.** `linear-gradient` count 0,
`box-shadow` count 0, `backdrop-filter` count 0, on every state.

**The colour census is the palette, exactly.** Text colours across the
carousel frame: `rgb(255,46,55)` racingRed, `rgb(242,243,245)` textPrimary,
`rgb(138,140,150)` textSecondary, `rgb(11,12,16)` voidBlack (on red),
`rgb(38,39,46)` hairline. The only other value in the document is the
`<noscript>` fallback in `index.html`, outside the app — the same single hit
the map and profile passes found.

**Typography is clean.** Every text node resolves to `Rajdhani_700Bold`,
`Rajdhani_600SemiBold`, `Inter_400Regular`, `JetBrainsMono_400Regular` or
`JetBrainsMono_500Medium`.

**Every number is mono.** The census lists them: `2024`, `B 1234 XYZ`, `300`,
`4.2`, `RWD`, `1,284`, `2,574`, `47`, `1999`, `250`, `5.8`, `2023`, `450`,
`3.3`, `AWD`, `B 77 EV`, `412`, `810`, `39`, `3`, `20`, `1,696`, `2,574`. The
only nodes containing a digit that are *not* mono are two car names
(`Silvia S15`, `Model 3 Performance`), which are names, not readouts.

**Only two radii survive.** `4px` (`radius.sharp`) on the utility rects and
`999px` (`radius.circle`) on the three photo masks. Nothing is a pill.

Things the screenshot pass caught and fixed:

- **The car name was clipped out of the card entirely** (D-3). The card was
  480pt of content in a 379pt box; the name was the casualty.
- **The drive-data strip was sliced in half by the card's bottom edge** —
  now one caption line (D-4).
- **The empty-garage heading and its body line had no gap** between them,
  because the guest state's `gap` was on a style the empty state did not use.

Still imperfect, and visible in the screenshots:

- **The empty-garage state leaves a large dead band** between the centred
  heading block and the bottom-anchored form. That is the original layout —
  the heading is vertically centred, the action is pinned — and closing it
  would mean re-centring the whole state.
- **`make · year · plate` can be a long line** on a car with a long make and
  a long plate; only the make and the plate ellipsize, and they do so
  independently rather than the line truncating as a unit.
- **The card's neighbour peek is ~15pt** at 390 wide, which is enough to
  signal "there is more" but not enough to read.

**The web export cannot verify native behaviour.** Safe-area insets, the
Android status bar and `Alert.alert`'s native sheet are approximated by
react-native-web. Layout, type, colour, shape and the CTA's long-label
behaviour are verified; the per-car menu should be checked on a device.

---

## 7. Checklist additions for the next screen

Everything in `DRIVE_HUB_REFERENCE.md` §6, `MAP_SCREEN_REFERENCE.md` §9 and
`PROFILE_SCREEN_REFERENCE.md` §9 still applies, plus:

18. A link is `textStyle("caption")` in `racingRed` with `hitSlop` and
    `accessibilityRole="link"` — no pill, no border, no chevron. There is one
    link convention; do not add a second.
19. A readout strip inside a surface that already carries the cut is a plain
    rect. Spend the corner once per surface.
20. Do not fix the height of a card whose content is conditional.
    react-native-web clips a `View`, so an overflowing card silently loses
    content rather than showing you it overflowed. Use `minHeight`.
21. A per-entity colour column (car colour, team colour) is data, not a
    style. It may tint a photo or a badge it owns; it may not tint the
    surfaces around it.
