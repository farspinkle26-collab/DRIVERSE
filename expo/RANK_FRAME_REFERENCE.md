# Rank profile frames

The frame drawn around every driver's avatar, earned by rank. Free, and
separate from the Platinum cosmetic frames — the two stack, with Platinum
taking precedence when a subscriber has one equipped.

## Files

| File | What it is |
| --- | --- |
| `constants/rankFrames.ts` | The config table for all 12 tiers, plus `resolveAvatarFrame()` — the one place rank and Platinum meet. |
| `components/frames/AvatarFrame.tsx` | The renderer. Reads a config and draws it; contains no per-tier code. |
| `components/frames/frameGeometry.ts` | Silhouette maths — path, outline length, decoration points, dash patterns. |
| `components/frames/useFrameClock.ts` | One shared animation clock per lap duration, ref-counted. |
| `lib/cutCornerGeometry.ts` | The brand's 45° cut geometry, extracted so it carries no React/SVG dependency. `components/CutCorner.tsx` re-exports it. |
| `constants/__tests__/rankFrames.test.ts` | 44 tests over the config, geometry and resolution. |

## The ladder

12 tiers, not 11 — `constants/ranks.ts` is the source of truth for names,
level bands and colours, and this system never authors a colour of its own.
Each tier's `color` (accent) and `colorDark` (gradient partner) are taken
straight from there.

| Tier | Rank | Levels | Colour | Shape | Ring | Segments | Motion | Corners |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Rookie Driver | 1–9 | `#C9954E` | circle | 0.022 | 1 | — | — |
| 2 | Street Explorer | 10–19 | `#4F9E5A` | circle | 0.026 | 1 | — | — |
| 3 | Street Driver | 20–39 | `#3B82F6` | cut1 | 0.030 | 1 | — | — |
| 4 | Skilled Driver | 40–59 | `#B0894E` | cut2 | 0.030 | 1 | — | ticks |
| 5 | Elite Driver | 60–99 | `#8B5CF6` | cut4 | 0.032 | 1 | — | ticks |
| 6 | Racer | 100–149 | `#B8BDC4` | cut4 | 0.034 | 1 | pulse | ticks |
| 7 | Pro Racer | 150–249 | `#C6CBD2` | cut4 | 0.036 | 2 | pulse | ticks |
| 8 | Master Racer | 250–399 | `#D9B25A` | cut4 | 0.038 | 4 | trail 9s | double |
| 9 | Apex Racer | 400–599 | `#5FA8E0` | cut4 | 0.039 | 6 | trail 8.5s | double |
| 10 | Street Legend | 600–799 | `#FBBF24` | cut4 | 0.041 | 8 | trail 8s | double |
| 11 | Mythic Driver | 800–999 | `#A855F7` | cut4 | 0.044 | 8 | trail 7.5s | notch |
| 12 | King of the Road | 1000+ | `#FFD700` | **octagon** | 0.050 | 8 | **dual trail 7s** | **emblem + sparks** |

Ring thickness is a fraction of the frame box, so it scales with the avatar
rather than going hairline-thin on a 34pt chat avatar.

### Why shape carries the escalation

The rank palette has three near-collisions: tiers 1 and 4 are both bronze,
6 and 7 are both silver (`#B8BDC4` vs `#C6CBD2`), and 10 and 12 are both
gold. Those pairs are indistinguishable side by side. A frame system that
escalated by colour would therefore not read as a ladder at all — so the
silhouette, ring weight, segment count and corner treatment do the work, and
colour only confirms what the shape already said. `rankFrames.test.ts`
asserts that thickness, glow and segment count never decrease as tier rises:
the failure mode being guarded against is a promotion that makes a driver's
frame quieter, which renders perfectly and still feels like a demotion.

The top tier is deliberately not "tier 11 with more turned up" — an octagon
is the only non-square silhouette in the set, and the spark detail and
two-tone edge appear nowhere else. It should be identifiable as max rank by
someone who has never seen the ladder.

## Detail levels

`resolveAvatarFrame({ detail })` degrades a config for its surface. Shape and
colour survive every level; only the expensive parts are dropped.

| | Profile (`full`) | Lists (`list`) | Map (`marker`) |
| --- | --- | --- | --- |
| Shape + colour | yes | yes | yes |
| Ring + segments | yes | yes | yes |
| Corner detail | yes | yes | dropped |
| Inner glow | yes | yes | dropped |
| Animation | full | dual trail → single trail | none |
| Sparks | yes | dropped | dropped |

Reduced motion (`hooks/useReducedMotion.ts`, already used across the app)
forces `animation: none` and disables sparks at every level including tier
12 — no exceptions, per the existing house rule that an animation must render
its end state rather than a faster version of itself.

## Where it renders

- **Profile** (`components/ProfileScreen.tsx`) — `AvatarFrame`, `full` detail,
  72pt. Composed inside `PlatinumAura`, so a subscriber's aura, their frame
  and the level badge all coexist without any of them moving.
- **Map** (`app/(tabs)/map.tsx`) — `RankFrameRing`, a ring-only variant that
  slots into the marker's existing 42pt outer well.
- **Convoy roster** (`app/convoy/[id].tsx`) — `ListAvatarFrame`, 40pt, inside
  the Platinum aura and outside the convoy border colour.
- **Chat** (`app/messages/index.tsx`, `app/messages/[id].tsx`) —
  `ListAvatarFrame` at 50pt and 34pt. DM rows only; a group row stands for a
  convoy, not a driver, so there is no rank to frame.
- **Leaderboard** — not wired. There is no leaderboard screen in the app yet
  (the only matches for the word are in Platinum badge copy). When one is
  built, it wants `ListAvatarFrame` and nothing else.

### The map marker is a special case

Two constraints the map imposes, both already established in `map.tsx`
before this system existed:

1. **The outer ring slot is contested.** A driver's marker already draws a
   convoy ring or a distress ring in that well, and the inner ring carries
   their livery colour. Precedence is **distress → convoy → rank frame**:
   the first two are live operational state and have to win; rank is
   cosmetic and yields. The livery colour on the inner ring is untouched
   either way.
2. **Marker frames never animate.** This is correctness before performance —
   `react-native-maps` snapshots each marker to a bitmap on Android, so an
   animated frame does not animate, it freezes on whatever moment the
   snapshot caught. `map.tsx` already keeps its "live" event ring and its
   distress ring static for exactly this reason.

## Performance

- **One clock, not one per avatar.** `useFrameClock` ref-counts a single
  looping `Animated.Value` per lap duration. Thirty convoy rows animate off
  one driver instead of thirty, which is both cheaper and visually calmer —
  independently-phased rings read as noise.
- **Static frames schedule nothing.** A disabled clock acquires no loop at
  all, so a map of 30 markers, or any screen under reduced motion, runs zero
  animation loops.
- **Paths are memoised** per `(shape, size, stroke)`, and `AvatarFrame` is
  `memo`-wrapped, so a roster re-rendering on a position tick does not
  recompute or redraw any frame geometry.

### Open item: on-device benchmark

The brief asks for a benchmark at 20–30 markers. **That has not been run** —
there is no device or simulator in the environment this was built in. The map
already ships static frames, so the intended outcome of that benchmark is
pre-applied and there is no known risk to close; the measurement is still
worth taking before relying on animated frames anywhere denser than the
profile page. What to check: scroll a 30-row convoy roster at tier 8+ and
watch for dropped frames from the shared-clock `strokeDashoffset`
interpolation, which is JS-driven (`react-native-svg` cannot use the native
driver for stroke props).

If that measurement ever comes back bad, the fix is one line: degrade `list`
to `none` in `degradeAnimation()`.

## Platinum interaction

Resolution order, implemented once in `resolveAvatarFrame()` so no render
site checks entitlement itself:

```
equipped Platinum frame (and currently entitled)  →  that frame
otherwise                                          →  the rank-tier frame
```

The Platinum set is **already built** — `constants/platinumCosmetics.ts`,
`components/platinum/ProfileFrame.tsx`, `hooks/useCosmeticsStore.ts` — so
this is a real integration, not a stub. `AvatarFrame` delegates to
`ProfileFrame` for the Platinum branch rather than reimplementing the four
chrome silhouettes.

Two properties worth keeping:

- **A selection is not an entitlement.** A lapsed subscriber's stored
  `profiles.profile_frame` is never destroyed; they simply fall back to their
  earned rank frame, and their choice returns intact on resubscribe.
  `resolveProfileFrame()` already guaranteed this and the rank layer inherits it.
- **The rank is still reported underneath a Platinum frame.** `ResolvedFrame`
  keeps `rankId`, `color` and `accent` populated even when `fromPlatinum` is
  true, so callers can still tint a level badge by rank.

## Adding or retuning a tier

Edit `BANDS` (a whole band) or `OVERRIDES` (a single tier) in
`constants/rankFrames.ts`. `RANK_FRAMES` is generated from `RANKS`, so a tier
added to the ladder gets a frame automatically from its band. Nothing in
`AvatarFrame.tsx` should need to change; if it does, the config vocabulary is
missing a field and that is the thing to add.

Run `bun test constants/__tests__/rankFrames.test.ts` after any change — the
monotonicity and top-tier-uniqueness assertions are what stop the ladder
quietly losing its shape.
