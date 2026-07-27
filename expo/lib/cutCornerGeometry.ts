/**
 * Driveverse — the corner-cut geometry, on its own.
 *
 * The maths behind the brand's 45° cut, with no React, React Native or SVG
 * imports. `components/CutCorner.tsx` re-exports all of it, so existing call
 * sites are unaffected and this file is not a second source of truth — it is
 * the only one, with the components layered on top.
 *
 * Split out so surfaces that need the geometry but not the components can
 * take it without dragging `react-native-svg` in behind it (the frame
 * silhouettes in `components/frames/frameGeometry.ts` are the first such
 * caller), and so the shape can be unit-tested without a renderer.
 */

export type CutCornerName = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

export const DEFAULT_CORNERS: CutCornerName[] = ["topRight"];

/**
 * Vertices of a rectangle with one or more corners cut at 45°, walked
 * clockwise from the top-left.
 *
 * `inset` pulls the polygon in from the edge — pass half the stroke width
 * so a stroked outline sits fully inside the layout box instead of being
 * clipped in half by the SVG viewport.
 */
export function cutCornerPoints(
  width: number,
  height: number,
  size: number,
  corners: CutCornerName[] = DEFAULT_CORNERS,
  inset: number = 0
): [number, number][] {
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;

  // A cut can never eat more than half of either side, or the polygon
  // folds in on itself on small elements (badges, compact buttons).
  const c = Math.max(0, Math.min(size, (x1 - x0) / 2, (y1 - y0) / 2));

  const has = (corner: CutCornerName) => c > 0 && corners.includes(corner);
  const points: [number, number][] = [];

  if (has("topLeft")) points.push([x0 + c, y0]);
  else points.push([x0, y0]);

  if (has("topRight")) points.push([x1 - c, y0], [x1, y0 + c]);
  else points.push([x1, y0]);

  if (has("bottomRight")) points.push([x1, y1 - c], [x1 - c, y1]);
  else points.push([x1, y1]);

  if (has("bottomLeft")) points.push([x0 + c, y1], [x0, y1 - c]);
  else points.push([x0, y1]);

  if (has("topLeft")) points.push([x0, y0 + c]);

  return points;
}

/**
 * The same geometry as a CSS `clip-path` value, in percentages, for web
 * surfaces that are styled outside React Native's style system.
 *
 * Percentages mean the cut is not a fixed 14px — pass the element's size
 * so the utility can convert. Prefer the `CutCorner` components when you can.
 */
export function cutCornerClipPath(
  width: number,
  height: number,
  // Mirrors `cut.md` (14) from the theme, and is inlined rather than
  // imported: `constants/theme.ts` imports `Platform` at runtime, and
  // pulling React Native in here would defeat the point of the split. Keep
  // this in step with `cut.md` by hand if that token ever moves.
  size: number = 14,
  corners: CutCornerName[] = DEFAULT_CORNERS
): string {
  const pts = cutCornerPoints(width, height, size, corners)
    .map(
      ([x, y]) =>
        `${((x / width) * 100).toFixed(3)}% ${((y / height) * 100).toFixed(3)}%`
    )
    .join(", ");
  return `polygon(${pts})`;
}
