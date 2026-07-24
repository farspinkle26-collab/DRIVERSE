# Driveverse Design System — Phase 1 Audit & Scope

Companion to `constants/theme.ts`, `components/CutCorner.tsx` and
`hooks/useAppFonts.ts`. Nothing in this document has been fixed yet — this
is the scope estimate for the phases that follow.

Counts were taken across `app/`, `components/` and `lib/` at the commit that
introduced the token system.

---

## 1. Headline numbers

| Category | Occurrences | Distinct values | Where the system replaces it |
|---|---:|---:|---|
| Hardcoded hex colours | 1,260 | 98 | `colors` (6 tokens) |
| Hardcoded `rgba()` / `rgb()` | 388 | 135 | `alpha(colors.x, n)` |
| `padding` / `margin` / `gap` numerics | 1,131 | 29 | `spacing` (7 tokens) |
| `fontSize` numerics | 502 | 21 | `type` (6 tokens) |
| `fontWeight` declarations | 366 | 6 | encoded in `fontFamily` |
| `borderRadius` numerics | 380 | 33 | `radius` (3) + `cut` (3) |
| `shadowColor` / `elevation` blocks | 87 | — | `hairlineBorder` / `surface.raised` |
| `<LinearGradient>` instances | 63 | 15 colour sets | flat `surface` fills |
| `fontFamily` declarations | **1** | 1 | `fontFamily` (8 faces) |

**≈ 4,100 individual values** currently need to route through the token file.

The single most important number is the last row: exactly one `fontFamily`
exists in the entire app (`app/select-car.tsx:755`, `Menlo`/`monospace` for a
plate number). Every other string in Driveverse renders in the platform
system font. That is the largest single contributor to the "AI-templated"
read, and it is also the cheapest thing to fix — the type migration is a
find-and-replace over `fontSize`/`fontWeight` pairs, not a redesign.

---

## 2. Per-file token debt

Sorted by total values to migrate. The top four files are ~60% of the work.

| File | Hex | rgba | Spacing | fontSize | Radius | Shadow | Gradient | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `app/(tabs)/map.tsx` | 278 | 117 | 210 | 105 | 102 | 64 | 0 | **876** |
| `components/ProfileScreen.tsx` | 220 | 67 | 183 | 77 | 62 | 0 | 13 | **622** |
| `app/select-car.tsx` | 74 | 23 | 65 | 24 | 18 | 0 | 10 | **214** |
| `app/route/[id].tsx` | 61 | 12 | 40 | 22 | 11 | 0 | 2 | **148** |
| `app/(tabs)/drive.tsx` | 49 | 16 | 44 | 17 | 17 | 2 | 3 | **148** |
| `app/signup.tsx` | 62 | 10 | 32 | 11 | 9 | 2 | 3 | **129** |
| `app/convoy.tsx` | 38 | 15 | 34 | 12 | 14 | 0 | 2 | **115** |
| `app/community.tsx` | 34 | 6 | 41 | 13 | 10 | 0 | 1 | **105** |
| `app/routes.tsx` | 40 | 7 | 32 | 14 | 6 | 0 | 1 | **100** |
| `components/SaveRouteModal.tsx` | 33 | 15 | 24 | 10 | 9 | 0 | 1 | **92** |
| `app/messages/index.tsx` | 35 | 7 | 28 | 11 | 7 | 0 | 2 | **90** |
| `app/ranks.tsx` | 24 | 7 | 26 | 14 | 6 | 0 | 3 | **80** |
| `app/convoy/[id].tsx` | 30 | 6 | 22 | 11 | 8 | 0 | 3 | **80** |
| `app/login.tsx` | 31 | 7 | 19 | 11 | 6 | 0 | 3 | **77** |
| `app/event/[id].tsx` | 29 | 6 | 20 | 10 | 4 | 0 | 3 | **72** |
| `app/trip/[id].tsx` | 31 | 6 | 18 | 7 | 5 | 0 | 1 | **68** |
| `app/event/[id]/manage.tsx` | 24 | 9 | 17 | 8 | 6 | 0 | 3 | **67** |
| `app/nearby-places.tsx` | 18 | 4 | 24 | 10 | 6 | 0 | 1 | **63** |
| `components/CreateConvoyModal.tsx` | 24 | 10 | 16 | 6 | 5 | 0 | 0 | **61** |
| `app/messages/group/[id].tsx` | 18 | 9 | 18 | 7 | 4 | 0 | 1 | **57** |
| `app/messages/[id].tsx` | 16 | 10 | 16 | 6 | 6 | 0 | 1 | **55** |
| `components/Chat.tsx` | 0 | 0 | 31 | 13 | 9 | 0 | 0 | **53** |
| `components/InteractiveMapView.tsx` | 14 | 4 | 8 | 4 | 5 | 4 | 0 | **39** |
| `components/PlacesLayer.tsx` | 9 | 2 | 14 | 7 | 4 | 2 | 0 | **38** |
| `components/MapboxSearch.tsx` | 2 | 0 | 22 | 6 | 4 | 4 | 0 | **38** |
| `components/EnhancedLocationPicker.tsx` | 0 | 1 | 24 | 10 | 3 | 0 | 0 | **38** |
| `components/MultiImagePicker.tsx` | 0 | 0 | 14 | 7 | 7 | 0 | 0 | **28** |
| `components/RenameModal.tsx` | 9 | 4 | 5 | 3 | 3 | 0 | 1 | **25** |
| `app/terms-and-conditions.tsx` | 0 | 0 | 17 | 6 | 2 | 0 | 0 | **25** |
| `components/MapView.tsx` | 5 | 0 | 8 | 5 | 4 | 0 | 0 | **22** |
| `components/LocationPicker.tsx` | 0 | 0 | 13 | 6 | 1 | 0 | 0 | **20** |
| `components/ImagePicker.tsx` | 0 | 0 | 8 | 5 | 6 | 0 | 0 | **19** |
| `app/(tabs)/_layout.tsx` | 5 | 4 | 3 | 0 | 2 | 4 | 0 | **18** |
| `components/Dropdown.tsx` | 0 | 0 | 9 | 6 | 1 | 0 | 0 | **16** |
| `components/Button.tsx` | 0 | 0 | 7 | 4 | 4 | 0 | 1 | **16** |
| `components/TabIcons.tsx` | 11 | 0 | 0 | 0 | 0 | 0 | 3 | **14** |
| `components/NotificationBanner.tsx` | 1 | 1 | 4 | 2 | 2 | 2 | 0 | **12** |
| `components/Input.tsx` | 0 | 0 | 8 | 3 | 1 | 0 | 0 | **12** |
| `components/RoutePreview.tsx` | 7 | 0 | 0 | 0 | 1 | 0 | 0 | **8** |
| `components/RankBadge.tsx` | 2 | 3 | 0 | 0 | 0 | 0 | 1 | **6** |
| `app/+not-found.tsx` | 1 | 0 | 3 | 2 | 0 | 0 | 0 | **6** |
| `components/EventMeta.tsx` | 5 | 0 | 0 | 0 | 0 | 0 | 0 | **5** |
| `components/LoadingScreen.tsx` | 2 | 0 | 0 | 0 | 0 | 2 | 0 | **4** |
| `app/_layout.tsx` | 4 | 0 | 0 | 0 | 0 | 0 | 0 | **4** |
| `components/Card.tsx` | 0 | 0 | 2 | 0 | 0 | 1 | 0 | **3** |
| `app/modal.tsx`, `app/chat.tsx` | 0 | 0 | 2 | 2 | 0 | 0 | 0 | **4** |

Already clean (no hardcoded values): `app/index.tsx`,
`app/(tabs)/profile.tsx`, `app/user/[id].tsx`,
`app/initial-registration.tsx`, `app/+native-intent.tsx`,
`components/MapboxTileLayer.tsx`.

---

## 3. Colour — every hardcoded value found

### 3a. Values that map cleanly onto the new palette

| Current | Count | Role today | New token |
|---|---:|---|---|
| `#FFFFFF` | 277 | primary text, icon fills | `textPrimary` (`#F2F3F5`) |
| `#8A8A9A` | 159 | secondary text | `textSecondary` (`#8A8C96`) |
| `#0A0A0F` | 77 | app background | `voidBlack` |
| `#5A5A6E` | 77 | muted/tertiary text | `textSecondary` |
| `#060609` | 51 | deep background | `voidBlack` |
| `#6A6A7E` | 23 | muted text | `textSecondary` |
| `#000` / `#000000` | 24 | overlays, shadow colour | `voidBlack` |
| `#3A3A4E` | 17 | inactive/disabled | `hairline` |
| `#B0B0BE` | 11 | body text | `textSecondary` |
| `#0A0A14` | 11 | card background | `carbonSurface` |
| `#CACAD5` | 6 | body text | `textSecondary` |
| `#6B6B7D` | 5 | meta text | `textSecondary` |
| `#2A2A3A` | 5 | border | `hairline` |
| `#12121C` | 5 | card background | `carbonSurface` |
| `#E8E8F0` | 4 | near-white text | `textPrimary` |
| `#C0C0CE` | 4 | body text | `textSecondary` |
| `#9A9AB0` | 3 | meta text | `textSecondary` |
| `#EAEAEA`, `#C9C9D4`, `#C4C4D0`, `#B8B8C8` | 2 each | text greys | `textPrimary` / `textSecondary` |
| `#161628`, `#12121A`, `#111119`, `#111111`, `#0E0E18` | 2 each | surfaces | `carbonSurface` |
| `#4A4A5E` | 2 | borders | `hairline` |
| `#F9FAFB`, `#F8F9FA`, `#E5E5EA`, `#E0E0EA`, `#D0D0DC`, `#CCCCCC`, `#B0B0C0` | 1 each | light-theme text | `textPrimary` / `textSecondary` |
| `#2A2A45`, `#2A2A38`, `#1E1E2E`, `#1A1A1A`, `#141420`, `#14141F`, `#12141C`, `#0C0C14` | 1 each | surfaces/borders | `carbonSurface` / `hairline` |

**14 near-identical greys collapse to `textSecondary`; 14 near-black surface
values collapse to `carbonSurface` + `voidBlack`.** This is where most of the
"generic" feel comes from — there is no surface hierarchy, just noise.

### 3b. Legacy brand orange → `racingRed`

The current primary is Horizon orange, not the logo red.

| Current | Count | New token |
|---|---:|---|
| `#FF6B35` | 164 | `racingRed` (`#FF2E37`) |
| `#FF8A50` | 4 | `racingRed` |
| `#FF9F55` | 2 | `racingRed` |
| `#FF9450`, `#FF7A1A`, `#FF6B6B`, `#FF5252` | 1 each | `racingRed` |
| `#FF6B3560`, `#FF6B3520`, `#FF6B3515` | 1 each | `alpha(colors.racingRed, n)` |
| `#E53935`, `#FF2D55`, `#FF1E3C`, `#FF6482` | 5/3/1/1 | `racingRed` |
| `rgba(255,107,53,*)` — 8 opacities | 34 | `alpha(colors.racingRed, n)` |

**Note on volume:** 164 uses of the accent colour is far more than the
palette brief allows. Red is specified as a sparingly-used accent; a 1:1
swap of orange → red would put red on nearly every icon and button and
destroy the accent. The colour migration cannot be mechanical — most current
orange should become `textPrimary` or `textSecondary`, and only the primary
action / active state / route line should stay red. **Budget review time for
this, not just replace time.**

### 3c. Colours flagged for removal — off-brief hues

These violate the "no purple/blue gradients, no pastel accents" rule.

| Colour | Count | Where |
|---|---:|---|
| `#3B82F6` (blue) | 32 | `app/community.tsx:32` (`const ACCENT`), convoy CTA buttons (`app/convoy/[id].tsx:201,204`), `components/CreateConvoyModal.tsx` (7 uses), `app/routes.tsx:41`, `components/EventMeta.tsx:8`, `components/SaveRouteModal.tsx:51`, `app/(tabs)/drive.tsx:147`, `app/(tabs)/map.tsx:380,2159,2397,4656`, `app/route/[id].tsx:347`, `app/trip/[id].tsx:214`, `components/ProfileScreen.tsx:1132,1291` |
| `#8B5CF6` (purple) | 12 | `app/(tabs)/map.tsx:3331` (`CAFE_COLOR`), `app/(tabs)/drive.tsx:117`, `app/nearby-places.tsx:40`, `app/routes.tsx:40`, `components/EventMeta.tsx:6,47`, `components/SaveRouteModal.tsx:50`, `components/ProfileScreen.tsx:1098` |
| `#A78BFA` (pastel purple) | 6 | `app/(tabs)/map.tsx:2247,2251,2701,3332,3407` |
| `#38BDF8` (pastel sky) | 5 | `app/(tabs)/map.tsx:2979–3041`, profile action sheet icons |
| `#4285F4` (Google blue) | 2 | `app/(tabs)/map.tsx:419,423` — user-location dot |
| `#CFE2FF`, `#7FB2F2`, `#9AA4BC`, `#B9C2D8` (pastel weather) | 4 | `app/(tabs)/map.tsx:355–358` — weather icons |
| `#A855F7`, `#EC4899`, `#F472B6`, `#22D3EE`, `#34D399`, `#A3E635`, `#8FA89A`, `#D4A574` | 1 each | `app/(tabs)/map.tsx:363` (`PLAYER_COLORS`), `app/(tabs)/drive.tsx:201`, misc |
| `#00D4AA` "premium teal" secondary | 13 | palette secondary + POI scenic |
| `#FF3B6F` "speed pink" accent | 39 | gradient partner colour throughout |

`PLAYER_COLORS` (`app/(tabs)/map.tsx:363`) is the one legitimate case for a
multi-hue set — convoy members need to be distinguishable on the map. It
still needs re-picking against `voidBlack` in a motorsport register (livery
colours, not pastels).

### 3d. Status colours — an open decision

The palette brief specifies six values and no status colours. These exist and
have no token to land on:

| Colour | Count | Meaning |
|---|---:|---|
| `#22C55E` (+ `#16A34A`, `#0E7A3C`, `#06130B`) | 50 | success / online / EV |
| `#EF4444` (+ `rgba(239,68,68,*)` ×14) | 43 | danger / destructive |
| `#F59E0B` (+ `#FBBF24`, `#FACC15`, `#F2C94C`, `#FB923C`) | 32 | warning / fuel |
| `#FFD700` (+ `#FFD75E`) | 36 | XP / rank gold |

**Recommendation for phase 2:** add a separate, explicitly-labelled
`status` group (3–4 values) rather than stretching the brand palette.
`#FFD700` gold is the awkward one — it collides with `racingRed` as a second
"reward" accent. Suggest folding XP/rank onto `racingRed` per the brief
("route/XP accent color") and dropping gold entirely.

### 3e. Translucent whites — the fake-elevation layer

135 distinct `rgba()` values, dominated by white-on-dark overlays that are
standing in for surfaces and borders:

| Value | Count | Should become |
|---|---:|---|
| `rgba(255,255,255,0.08)` | 60 | `hairline` border |
| `rgba(255,255,255,0.06)` | 57 | `hairline` border |
| `rgba(255,255,255,0.05)` | 25 | `carbonSurface` fill |
| `rgba(255,255,255,0.04)` | 24 | `carbonSurface` fill |
| `rgba(255,255,255,0.03)` / `0.07` / `0.1` / `0.15` / `0.2` / `0.7` | 37 | `hairline` / `carbonSurface` / `textSecondary` |
| `rgba(14,14,24,0.9x)`, `rgba(18,18,30,0.9)` | 17 | `carbonSurface` (opaque) |
| `rgba(0,0,0,0.3–0.9)` | 17 | scrim — keep, tokenise |

**~200 of the 388 rgba values are six barely-distinguishable white overlays.**
Two tokens replace all of them.

---

## 4. Anti-patterns flagged for removal

### 4a. Gradients — 63 instances, 23 files

None of them survive the new direction.

| Gradient | Count | Verdict |
|---|---:|---|
| `["#0A0A0F", "#060609", "#0A0A0F"]` | 31 | Screen background wash. Delete — flat `voidBlack`. This is 6% luminance drift, invisible on most screens, and costs a full-screen `LinearGradient` per route. |
| `["#FF6B35", "#FF3B6F"]` | 12 | Orange→pink brand gradient on CTAs/headers. Replace with flat `racingRed` + `CutCornerButton`. |
| `["#FF6B35", "#FFD700"]` | 2 | Orange→gold on rank/XP. Replace with flat. |
| `[theme.gradientStart, gradientMiddle, gradientEnd]` | 1 | `components/Button.tsx` `variant="gradient"`. Remove the variant. |
| `["rgba(255,107,53,0.18)", "rgba(255,59,111,0.06)"]` | 1 | Card glow. Delete. |
| `["#1A1206", "#0D0A08"]`, `["#22C55E", "#16A34A"]`, `[rank.color, "#FFD700"]`, `[current.color, next.color]`, `[quest.accent_color+"15", "transparent"]`, `[hexToRgba(car.color,0.28), …]`, `[activeColor, "#FF3B6F"]`, `[selectedColor.hex, "#FF8A50"]`, `[rank.color, rank.colorDark]` | 1 each | Per-feature washes. Delete. |

Heaviest users: `components/ProfileScreen.tsx` (13), `app/select-car.tsx`
(10), then 3 each in `TabIcons`, `signup`, `ranks`, `login`, `event/[id]`,
`event/[id]/manage`, `convoy/[id]`, `(tabs)/drive`.

Removing all 63 lets `expo-linear-gradient` be dropped from `package.json`.

### 4b. Glassmorphism / blur — 1 instance

- `app/(tabs)/_layout.tsx:4,23,26` — `BlurView` at `intensity: 25, tint: "dark"`
  behind the iOS tab bar, with a `View` fallback on Android. Replace with an
  opaque `carbonSurface` bar and a top `hairline`. This also removes the
  iOS/Android divergence. `expo-blur` can then be dropped from
  `package.json`.

Also flagged in `constants/colors.ts`:
- `bgGlass: "#1A1A2E50"` — translucent glass surface token.
- `surfaceGlow: "#FF6B3508"`, `primaryGlow: "#FF6B3540"` — glow tokens with no
  place in the new system.

### 4c. Drop shadows — 87 blocks

The palette brief specifies hairlines instead of shadows. Current state:
46 `shadowColor`, 41 `elevation`, plus paired `shadowOffset`/`Opacity`/`Radius`
(~226 declarations total). `app/(tabs)/map.tsx` alone holds 64 of the 87.
`components/Card.tsx` takes `elevation` as a *prop*, so its call sites need
updating too.

Note `constants/colors.ts` defines `shadow: "rgba(255, 107, 53, 0.15)"` — an
**orange** drop shadow. Delete.

### 4d. Rounded-everything

`borderRadius` appears 380 times across 33 distinct values (2 → 95). **89 of
them are ≥ 20px** — pills and heavily-rounded cards, concentrated in
`app/(tabs)/map.tsx` (22), `components/ProfileScreen.tsx` (14),
`app/select-car.tsx` (6), `components/Chat.tsx` (5), `app/route/[id].tsx` (5).

Under the new shape policy each of these resolves to one of three outcomes:
brand surface → `CutCornerCard` / `CutCornerButton` / `CutCornerBadge`;
utility surface → `radius.sharp` (4) or 0; true circle (avatar) →
`radius.circle`.

---

## 5. Typography — current state

**There is no typography system.** One `fontFamily` declaration exists in the
whole app:

- `app/select-car.tsx:755` — `Platform.OS === "ios" ? "Menlo" : "monospace"`
  (licence-plate field). This is the *only* place the codebase already agrees
  with the new direction; it becomes `fontFamily.dataMedium`.

Everything else is system font, styled with:

**21 distinct `fontSize` values, 502 declarations** — collapsing to 6 tokens:

| Current sizes | Count | New token |
|---|---:|---|
| 24, 25, 26, 28, 30, 32 | 11 | `displayXl` (32) |
| 18, 19, 20, 22 | 41 | `displayMd` (20) |
| 14, 15, 16, 17 | 209 | `body` (15) |
| 6, 8, 9, 10, 11, 12, 13 | 241 | `caption` (12) — many are genuinely too small today |

**6 distinct `fontWeight` values, 366 declarations:**

| Weight | Count |
|---|---:|
| `"700"` | 128 |
| `"800"` | 122 |
| `"600"` | 69 |
| `"500"` | 33 |
| `"bold"` | 8 |
| `"900"` | 6 |

256 of 366 are 700+. Nearly everything is bold, which is another reason
nothing reads as hierarchy. Under the new system weight is carried by the
font face, so **all 366 `fontWeight` declarations get deleted, not
converted** — leaving them in place alongside a custom `fontFamily` causes
synthetic double-bolding on Android.

### Numeric displays that must move to JetBrains Mono

Files rendering speed / distance / duration / XP / coordinates:
`app/(tabs)/drive.tsx`, `app/(tabs)/map.tsx`, `app/convoy.tsx`,
`app/convoy/[id].tsx`, `app/nearby-places.tsx`, `app/ranks.tsx`,
`app/route/[id].tsx`, `app/routes.tsx`, `app/select-car.tsx`,
`app/trip/[id].tsx`, `components/Chat.tsx`,
`components/InteractiveMapView.tsx`, `components/MapView.tsx`,
`components/PlacesLayer.tsx`, `components/ProfileScreen.tsx`,
`components/RoutePreview.tsx`, `components/SaveRouteModal.tsx`.

**17 files.** This is the highest-leverage part of the type migration — it is
what makes the app read as telemetry rather than as a social app.

---

## 6. Spacing — worst offenders

29 distinct values across 1,131 declarations. Off-scale values (anything not
0/4/8/12/16/24/32/48) account for **~46% of all spacing in the app**:

| Off-scale value | Count |
|---|---:|
| 10 | 115 |
| 14 | 82 |
| 6 | 77 |
| 2 | 44 |
| 5 | 28 |
| 3 | 21 |
| 18 | 19 |
| 20 | 55 |
| 1, 7, 9, 11, 13, 15, 22, 28, 30, 36, 40, 60, 80 | 77 combined |

### Screens that deviate most

| File | Off-scale / total | % off-scale |
|---|---|---:|
| `app/(tabs)/map.tsx` | 128 / 210 | 61% |
| `components/ProfileScreen.tsx` | 94 / 183 | 51% |
| `app/select-car.tsx` | 33 / 65 | 51% |
| `app/routes.tsx` | 22 / 32 | 69% |
| `app/route/[id].tsx` | 20 / 40 | 50% |
| `app/convoy.tsx` | 18 / 34 | 53% |
| `app/community.tsx` | 18 / 41 | 44% |
| `app/(tabs)/drive.tsx` | 16 / 44 | 36% |
| `app/ranks.tsx` | 12 / 26 | 46% |
| `app/messages/group/[id].tsx` | 11 / 18 | 61% |
| `components/SaveRouteModal.tsx` | 11 / 24 | 46% |
| `app/signup.tsx` | 11 / 32 | 34% |
| `app/messages/[id].tsx` | 10 / 16 | 63% |
| `app/trip/[id].tsx` | 10 / 18 | 56% |
| `app/nearby-places.tsx` | 10 / 24 | 42% |

`app/(tabs)/map.tsx` and `components/ProfileScreen.tsx` together hold 222 of
the 518 off-scale values. Fixing those two files fixes 43% of the spacing
problem.

---

## 7. The other legacy surface: `constants/colors.ts`

Still live, still imported through `useTheme()` by every screen. 85 hex
values across a dark and a light theme. It carries:

- A **light theme** (`driveverseLight`) with a white background —
  incompatible with the new palette, which is dark-only. `hooks/useThemeStore.ts`
  **defaults to `"light"`**, so the persisted user preference determines which
  palette is active. Phase 2 needs a decision: keep light mode (and design a
  second token set for it) or drop it and pin dark.
- Legacy aliases kept for compatibility (`text`, `textLight`, `textDark`,
  `card`, `border`, `background`, `textOnGradient`).
- Gradient tokens (`gradientStart`/`Middle`/`End`), glow tokens
  (`primaryGlow`, `surfaceGlow`), glass token (`bgGlass`) and the orange
  shadow — all removable.
- 8 POI colours (`poiWorkshop` … `poiEmergency`) spanning orange, purple,
  amber, green, pink, teal, blue, red. Needs a deliberate re-pick.

Recommended migration order: `theme.ts` (done) → rewrite `colors.ts` as a
thin shim that re-exports the new tokens under the old key names → delete the
shim once screens are migrated. That lets screens move one at a time without
a big-bang change.

---

## 8. Suggested phase order

1. **Chrome and shell** — `app/_layout.tsx`, `app/(tabs)/_layout.tsx`
   (removes the last blur), `components/LoadingScreen.tsx`. Small, high
   visibility, proves the tokens.
2. **Shared components** — `Button`, `Card`, `Input`, `Chat`, `RankBadge`,
   `TabIcons`, the modals. ~250 values, but every screen inherits the result.
3. **`app/(tabs)/map.tsx`** — 876 values on its own. Deserves its own pass,
   and probably its own file split.
4. **`components/ProfileScreen.tsx`** — 622 values.
5. **The remaining 20 screens** — 60–215 values each.
6. **Delete** `expo-linear-gradient` and `expo-blur` from `package.json`;
   collapse `constants/colors.ts`.

---

## 9. Font licensing

All three families are **SIL Open Font License 1.1**, which permits bundling
and redistribution inside a compiled application, including paid App Store
and Play Store distribution. No in-app attribution is required. The licence
text must travel with the fonts, so it is checked in beside them.

| Family | Copyright | Licence | Bundled faces |
|---|---|---|---|
| Rajdhani | Indian Type Foundry | OFL 1.1 (`assets/fonts/OFL-Rajdhani.txt`) | SemiBold 600, Bold 700 |
| Inter | The Inter Project Authors | OFL 1.1 (`assets/fonts/OFL-Inter.txt`) | Regular 400, Medium 500, SemiBold 600 |
| JetBrains Mono | The JetBrains Mono Project Authors | OFL 1.1 (`assets/fonts/OFL-JetBrainsMono.txt`) | Regular 400, Medium 500, Bold 700 |

The two OFL restrictions worth knowing: the fonts may not be sold on their
own, and a *modified* font may not keep its Reserved Font Name. Driveverse
does neither — the faces ship unmodified.

Total bundled weight: **2.1 MB** across 8 `.ttf` files. They are loaded from
local assets rather than Google's CDN so the app renders correctly offline
and shows no fallback-font flash on cold start.
