# Rank auras

The glow behind every driver's avatar, earned by rank. Free, and a separate
visual layer from the rank frame — the frame decorates the avatar's edge, the
aura is the light coming off it. Both read their colour from the same rank
record, so they always agree.

## Files

| File | What it is |
| --- | --- |
| `constants/rankAuras.ts` | The config table for all 12 tiers, plus `resolveAura()` — the one place rank and Platinum meet. |
| `components/auras/ProfileAura.tsx` | The renderer, plus the `ListAvatarAura` preset. Reads a config and draws it; contains no per-tier code. |
| `components/auras/RankPageWash.tsx` | The header-section background wash. Renders null below tier 8. |
| `components/frames/useFrameClock.ts` | The shared animation clock, now serving both systems (see [Performance](#performance)). |
| `constants/__tests__/rankAuras.test.ts` | 25 tests over the config, degradation and resolution. |

## Colour comes from the frame system, not from here

This was the first requirement of the brief and it is enforced structurally:
`rankAuras.ts` builds its table by calling `frameForRankId()` and copying
`color` / `accent` off the returned `FrameConfig`. It never reads `ranks.ts`
for colour and never authors a hex value of its own.

```
ranks.ts (RANKS)  →  rankFrames.ts (FrameConfig)  →  rankAuras.ts (AuraConfig)
     the palette          shape + colour                glow + colour
```

Changing a tier's colour in `ranks.ts` moves the frame and the aura together,
and there is no third place to forget. `rankAuras.test.ts` asserts equality
against both `RANK_FRAMES` and `RANKS` so a future refactor cannot quietly
un-route it.

**It is 12 tiers, not 11.** The ladder runs Rookie Driver → King of the Road.
The frame system hit the same discrepancy; `constants/ranks.ts` is the count
that matters.

## The ladder

| Tier | Rank | Colour | Rings | Opacity | Spread | Motion | Breath | Wash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rookie Driver | `#C9954E` | — | — | — | **none** | — | — |
| 2 | Street Explorer | `#4F9E5A` | 1 | 0.05 | 0.14 | static | — | — |
| 3 | Street Driver | `#3B82F6` | 1 | 0.07 | 0.16 | static | — | — |
| 4 | Skilled Driver | `#B0894E` | 1 | 0.09 | 0.18 | pulse | 6.0s | — |
| 5 | Elite Driver | `#8B5CF6` | 1 | 0.11 | 0.20 | pulse | 5.8s | — |
| 6 | Racer | `#B8BDC4` | 1 | 0.13 | 0.22 | pulse | 5.6s | — |
| 7 | Pro Racer | `#C6CBD2` | 1 | 0.15 | 0.24 | pulse | 5.4s | — |
| 8 | Master Racer | `#D9B25A` | 2 | 0.17 | 0.28 | phased | 5.4s | 0.10 |
| 9 | Apex Racer | `#5FA8E0` | 2 | 0.19 | 0.30 | phased | 5.2s | 0.13 |
| 10 | Street Legend | `#FBBF24` | 3 | 0.21 | 0.32 | phased · two-tone | 5.0s | 0.16 |
| 11 | Mythic Driver | `#A855F7` | 3 | 0.23 | 0.34 | phased · two-tone | 4.8s | 0.19 |
| 12 | King of the Road | `#FFD700` | 3 | 0.26 | 0.38 | **sweep** · two-tone | 4.6s | 0.26 |

`spread` is a fraction of the avatar's diameter, so the aura scales with the
avatar rather than becoming a halo on a 34pt chat row.

### Why the escalation is layers and motion, not shape

The frame escalates by *silhouette*, because the rank palette has three
near-collisions (tiers 1/4 both bronze, 6/7 both silver, 10/12 both gold) and
colour alone cannot separate the ladder. A glow has no silhouette to escalate,
so the aura escalates on the axes it does have: ring count, then motion, then
phase, then a background wash, then King's sweep. That is also what keeps the
two systems from competing — one is doing geometry, the other is doing light.

The bands are deliberately offset from the frame's so a promotion always
changes *something*: the aura's steps land at tiers 2, 4, 8 and 12, the
frame's at 3, 4, 8 and 12.

### Tier 1 has no aura on purpose

Not "very faint" — nothing. The step from no aura to any aura is the most
legible one in the system, and spending it on tier 1→2 means every driver
feels it within their first few levels.

### The top tier

King's sweep is a hairline ring that expands from the avatar's edge and fades,
once every 11 seconds, visible for under two of them (`SWEEP_DUTY = 0.18`). It
is the only motion in the set that is not a breath — the same logic that makes
the octagon the only non-square frame silhouette. An 11s gap is the restraint:
it has to read as something you catch, not something that is always happening.

### Restraint is enforced, not just intended

Peak opacity across the whole ladder is 0.26 and no breath is faster than one
per 4 seconds. `rankAuras.test.ts` asserts both ceilings. If a number ever
needs to go up to make the effect "land", the effect is wrong — the tier name
and badge already on the page carry the prestige signal, and the aura is only
there to confirm it quietly.

## Where it renders

| Surface | Detail | Notes |
| --- | --- | --- |
| **Profile** (`components/ProfileScreen.tsx`) | `full` | 72pt, outside `PlatinumAura` → `AvatarFrame` → avatar. Plus `RankPageWash` at 420pt behind the header. |
| **Convoy roster** (`app/convoy/[id].tsx`) | `list` | 40pt, static, tier 8+ only. Receives `isPlatinum` so it stays mutually exclusive with the chrome aura. |
| **Chat list** (`app/messages/index.tsx`) | `list` | 50pt. DM rows only — a group row stands for a convoy, not a driver. |
| **DM header** (`app/messages/[id].tsx`) | `list` | 34pt. |
| **Map** (`app/(tabs)/map.tsx`) | — | **Deliberately not wired.** See below. |
| **Leaderboard** | — | No leaderboard screen exists in the app yet. When one is built it wants `ListAvatarAura` and nothing else. |

### The map is deliberately excluded

There is no `marker` detail level, and that is a design decision rather than an
omission. The frame system already signals rank at marker level; stacking a
soft glow on 30 small, numerous markers would cost frame budget and map
readability for a signal that is already there. `map.tsx` keeps using
`AvatarFrame` alone.

### Why list auras start at tier 8

The point of a list aura is making top-ranked drivers findable in a social
context, and that signal is carried by the *contrast* between rows. A roster
where every row glows communicates nothing, so most rows having no aura is the
mechanism, not a limitation. Tier 8 is also where the frame gains its
travelling trail, so both systems step up on the same row.

List auras are static at every tier. Unlike the frame's trail there is no
cheaper motion to degrade to — a glow with its breath removed is just a glow —
so `resolveAura({ detail: "list" })` returns `effectiveMotion: "none"` always,
and no clock is acquired.

## Detail levels

| | Profile (`full`) | Lists (`list`) |
| --- | --- | --- |
| Colour identity | yes | yes |
| Rings | yes | yes, tier 8+ only |
| Breath / phase | yes | dropped |
| Background wash | yes | dropped (a row has no header to wash) |
| King's sweep | yes | dropped |

**Reduced motion** (`hooks/useReducedMotion.ts`) removes the motion at every
tier including 12, and removes nothing else: ring count, spread, colour and
wash all survive, parked at the midpoint of the breath. Stripping the aura
entirely would remove a rank signal from exactly the users least able to
afford losing signals. This is the same rule `PlatinumAura` already follows.

## Technical approach

The brief specified `react-native-skia` + `react-native-reanimated` as "the
same stack as the Frame system". **Neither is installed, and the frame system
uses neither** — `AvatarFrame.tsx` is react-native-svg plus RN's bundled
`Animated`, and says so in its header. Adding two native modules to a
Rork-managed Expo app would also have put the aura on a *different* animation
stack from the frame it is supposed to coordinate with. So the aura matches
what the frame actually does.

A soft glow without a blur filter is an SVG `RadialGradient` whose stops are
transparent at the centre, peak at the ring's radius, and fall back to
transparent at the outer edge. Layering two or three at stepped radii produces
the falloff a Gaussian blur would, at a fraction of the cost — the GPU draws
gradients instead of sampling a kernel. At the opacities this system uses
(≤ 0.26) the difference from true blur is close to invisible.

`AuraConfig` is deliberately renderer-agnostic — ring count, opacity, spread,
period, phase, wash, sweep flag. Nothing in it names an SVG concept, so a Skia
renderer could be swapped in behind it later without touching a call site.

### The breath

`Animated.Value` has no sine, so the cosine is sampled into an 8-step
piecewise-linear `interpolate()`. At that resolution the corners are well under
a pixel of opacity, and — the actual reason — the result stays a plain
interpolation, which means it can run on the native driver.

## Performance

- **Native driver.** The aura animates only `opacity` and `transform`, so the
  whole thing runs off the JS thread. This is a real difference from the
  frame's trail, which interpolates `strokeDashoffset` and *cannot* — a busy JS
  thread stutters the frame's trail but not the aura.
- **One clock, not one per avatar.** `useFrameClock` was generalised to take a
  `native` flag and key its ref-counted clocks by `period:native`. Native and
  JS clocks cannot share an `Animated.Value` (RN throws when you mix driver
  modes), so they are separate values at the same period — one extra loop at
  worst. Frame call sites are unchanged; the flag defaults to `false`.
- **Static auras schedule nothing.** A disabled clock acquires no loop, so a
  convoy roster, a chat list, or any screen under reduced motion runs zero aura
  animation loops. This is why the list variant being static matters more than
  it being cheap to draw.
- **Gradient ids are per-instance** via `useId()`. Two SVGs sharing a gradient
  id is a long-standing react-native-svg footgun — the second silently adopts
  the first's colours, which on a roster would paint every driver in the top
  row's tier.
- `ProfileAura` is `memo`-wrapped and its geometry is `useMemo`'d, so a roster
  re-rendering on a position tick recomputes nothing.

### Open item: on-device benchmark

Not run — there is no device or simulator in the environment this was built in,
the same open item `RANK_FRAME_REFERENCE.md` carries. The mitigations are
pre-applied (list auras are static and tier-8-gated, so a 30-row roster
schedules zero loops and draws at most a handful of gradients), but the
measurement is still worth taking. What to check: scroll a long convoy roster
where several members are tier 8+ and watch for dropped frames from the
gradient fills. If it ever comes back bad, the fix is one line — raise
`LIST_MIN_TIER`, or return `visible: false` for `detail === "list"` outright.

## Platinum interaction

```
holds Platinum  →  the Platinum aura (components/platinum/PlatinumAura)
otherwise       →  their rank-tier aura
```

Implemented once in `resolveAura()` so no render site checks entitlement itself.

**This is simpler than the frame's resolution, deliberately.** A Platinum
*frame* is a selection — four chrome silhouettes stored in
`profiles.profile_frame` — so `resolveAvatarFrame()` has to check entitlement
*and* choice. The Platinum *aura* is not a selection; it comes with the tier
and there is nothing to pick. So `isPlatinum` is the only input.

**Platinum suppresses the rank aura entirely** — not for precedence reasons but
because they physically overlap. Both occupy the same ring of space around the
same avatar. A Platinum King would otherwise get a chrome bezel, three gold
rings and a sweep in one 72pt circle, which is precisely the "fantasy-game
explosion of effects" the brief rules out. One aura per avatar, always. Same
for the wash: a Platinum driver gets `PlatinumPageGlow`, a high-tier free
driver gets `RankPageWash`, and they can never stack.

The rank fields stay populated when `fromPlatinum` is true, so a caller can
still tint something by rank underneath a Platinum aura, and a lapsed
subscriber falls back to the aura they earned with nothing destroyed.

### Colour collision: it is at tiers 6/7, not tier 12

The brief anticipated a clash between the Platinum aura and the *top* rank
tier. That one is not real: Platinum chrome is `#E8EAED` and King is gold
`#FFD700` — no collision.

The real collision is in the middle of the ladder. **Racer (`#B8BDC4`) and Pro
Racer (`#C6CBD2`) are both silver and sit right next to chrome.** By colour
alone a tier-6 driver's aura and a Platinum aura are near-identical.

They are separated by **form rather than hue**, which is the more robust fix
and needed no palette change:

- The **Platinum aura is a crisp, hard-edged bezel ring** — a bordered view
  with a definite outline, reading like a machined edge.
- Every **rank aura is a soft diffuse gradient** with no hard edge anywhere,
  reading like light.

Different material, not just a different colour, so the two never read as
adjacent points on one scale. Because Platinum also suppresses the rank aura,
the two are never on the same avatar to be compared directly in the first
place — the only comparison a user can make is between two different drivers in
a roster, where the hard/soft distinction does the work.

**If the tier palette is ever retuned**, the constraint to preserve is that
constraint, not the hex values: rank auras stay soft, the Platinum aura stays
hard-edged. Making the Platinum aura a gradient would collapse the distinction
even if the colours were moved apart.

### The second tone

`Rank.colorDark` is a *gradient partner*, picked to sit under the tier colour
in a filled badge, so it is genuinely dark (King's is `#8A6A00`). That works
for the frame, which strokes it as a crisp line, but a diffuse glow in a
near-black tone on `voidBlack` is invisible — it reads as a missing ring, not a
second colour. `secondaryTone()` mixes it 55% back toward the tier colour.

This is the one place the aura system transforms a colour, and it still never
invents one: both endpoints come from `ranks.ts`.

## Adding or retuning a tier

Edit `BANDS` (a whole band) or `OVERRIDES` (a single tier) in
`constants/rankAuras.ts`. `RANK_AURAS` is generated from `RANKS`, so a tier
added to the ladder gets an aura automatically from its band. Nothing in
`ProfileAura.tsx` should need to change; if it does, the config vocabulary is
missing a field and that is the thing to add.

Run `bun test constants/__tests__/rankAuras.test.ts` after any change — the
monotonicity, restraint-budget and top-tier-uniqueness assertions are what stop
the ladder quietly losing its shape.
