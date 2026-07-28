/**
 * Driveverse — per-category marker colours for the map.
 *
 * ─────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE USING ANY VALUE IN THIS FILE
 *
 * This file deliberately contradicts a documented decision. `theme.ts` caps
 * the palette at six values; `MAP_SCREEN_REFERENCE.md` §2 and its checklist
 * item 10 say **category is shape, state is colour**, and the Phase 3 pass
 * deleted both `PLACE_CATEGORY_COLORS` and a seven-hue `CAT_COLORS` map to
 * get there.
 *
 * The map-marker rebuild asked for category-specific accent colours anyway,
 * to match a reference design. That was raised, the conflict was put in
 * writing, and the call was to try colour first and judge it on screen.
 * This file is that attempt.
 *
 * It is quarantined here rather than added to `theme.ts` for a reason: the
 * six-value palette is still the palette. Nothing outside the map surface
 * may import from this file, and reverting the experiment is deleting this
 * file plus the `color` lookups in `placesCategories.ts` — not unpicking ten
 * hues from the token system.
 * ─────────────────────────────────────────────────────────────────────
 *
 * HOW THE TEN WERE PICKED
 *
 * Three constraints, in order:
 *
 * 1. **Red is not available.** `racingRed` is the selected-marker state and
 *    the primary action. A red *category* would make "this is a restaurant"
 *    and "this is the one you tapped" the same signal. Nothing here sits
 *    between hue 340° and 10°.
 *
 * 2. **Both tile themes.** The map has a light/dark tile toggle
 *    (`mapStyleDark`), so a marker cannot be tuned for a dark ground the way
 *    the rest of the app can. Every value below is mid-luminance: pastels
 *    dissolve on light tiles, near-blacks dissolve on dark ones.
 *
 * 3. **One ink colour.** Badges are filled with the category colour and the
 *    glyph is drawn in `voidBlack` on top. That only works if every hue
 *    holds a dark glyph, so all ten are kept above ~0.20 relative luminance
 *    (≥ 4.5:1 against the ink). Do not add a hue darker than `restaurant`
 *    without switching that badge's ink, and do not switch one badge's ink
 *    in isolation — mixed ink across a marker set reads as a bug.
 *
 * WHERE HUE ALONE IS NOT ENOUGH
 *   Ten mutually-distinguishable hues do not fit cleanly on the wheel once
 *   red is excluded, and the warm end is where they collide: `restaurant`
 *   (17°), `cafe` (33°) and `gas_station` (47°) are within 30° of each
 *   other. They are separated on *luminance* instead — a deliberate
 *   dark → mid → bright ramp — so they stay apart at 24px and in greyscale.
 *   This is the seam to look at first if the coloured version reads badly.
 */

import type { PlaceCategory } from "@/constants/mapLayers";

/** Every layer that can carry a category colour. `users` is absent on
 *  purpose — a driver marker takes its colour from their rank tier, which
 *  `ranks.ts` owns. There is exactly one rank-colour source of truth. */
export type ColouredLayer = PlaceCategory | "events";

export const CATEGORY_COLORS: Record<ColouredLayer, string> = {
  /** Burnt sienna. The dark step of the warm ramp. */
  restaurant: "#D2694A",
  /** Muted copper — roasted, not orange. The mid step. */
  cafe: "#CE9155",
  /** Bright gold. The light step, and the loudest warm value. */
  gas_station: "#E8B62C",
  /** Chartreuse. Sits in the gap between the warm ramp and the greens,
   *  which is the widest unused arc left once red is excluded. */
  events: "#A8C63C",
  /** Signal green — energy, the one association worth spending a hue on. */
  ev_charger: "#46B45C",
  /** Teal. Water. */
  car_wash: "#2AA9A2",
  /** Steel blue. Mechanical, and the coolest of the service pair. */
  workshop: "#4E8FBF",
  /** Indigo. Infrastructure rather than a destination. */
  parking: "#7986D8",
  /** Violet — evening, social. */
  hangout: "#A47BDA",
  /** Magenta. Retail, and the far end of the wheel from the fuel gold. */
  shopping: "#C2519A",
};

/**
 * The ink drawn on top of a filled category badge. One value for all ten,
 * by design — see constraint 3 above.
 */
export const ON_CATEGORY = "#0B0C10";

/** The category colour for a layer, or `null` for layers that have none
 *  (`users`, whose colour comes from rank). */
export function categoryColor(layer: string): string | null {
  return (CATEGORY_COLORS as Record<string, string>)[layer] ?? null;
}
