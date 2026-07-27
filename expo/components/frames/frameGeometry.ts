/**
 * Driveverse — frame silhouette geometry.
 *
 * Turns a `FrameShape` into an SVG path plus the points the corner
 * treatments hang off. Kept out of the component so the paths can be
 * memoised per (shape, box) and shared by every avatar on a screen —
 * a 30-row convoy list at one size computes each path exactly once.
 *
 * All shapes are built on the same square box and walked CLOCKWISE from
 * the top-left, so `strokeDasharray` offsets travel the same direction
 * whatever the silhouette. That is what lets one animation clock drive a
 * circle, a cut square and an octagon without per-shape special cases.
 */

// Straight from the geometry module, not the component — the silhouette
// maths must not pull `react-native-svg` in behind it.
import { cutCornerPoints, type CutCornerName } from "@/lib/cutCornerGeometry";
import type { FrameShape } from "@/constants/rankFrames";

export interface FrameGeometry {
  /** The silhouette outline, closed. */
  path: string;
  /** Total outline length — the denominator for every dash calculation. */
  length: number;
  /** Where corner ticks / notches / the spark detail attach. */
  corners: { x: number; y: number; angle: number }[];
  /** True when the silhouette is a plain circle, which SVG can draw better. */
  isCircle: boolean;
  cx: number;
  cy: number;
  r: number;
}

/** Which corners each shape cuts. `octagon` is handled separately. */
const SHAPE_CORNERS: Record<Exclude<FrameShape, "circle" | "octagon">, CutCornerName[]> = {
  cut1: ["topRight"],
  cut2: ["topRight", "bottomLeft"],
  cut4: ["topLeft", "topRight", "bottomRight", "bottomLeft"],
};

function polygonLength(pts: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    total += Math.hypot(x1 - x0, y1 - y0);
  }
  return total;
}

function toPath(pts: [number, number][]): string {
  return (
    pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ") + " Z"
  );
}

/**
 * A regular octagon inscribed in the box. Distinct from `cut4` — that is a
 * square with the corners taken off, this has eight equal sides, which is
 * what makes the top tier read as a different object rather than a bigger
 * version of tier 11.
 */
function octagonPoints(box: number, inset: number): [number, number][] {
  const c = box / 2;
  const r = c - inset;
  // Rotated by half a step so the octagon sits flat-topped, matching the
  // horizon line the rest of the app's angular surfaces sit on.
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 4) * i - Math.PI / 2 + Math.PI / 8;
    return [c + r * Math.cos(angle), c + r * Math.sin(angle)] as [number, number];
  });
}

/**
 * Geometry for a silhouette drawn inside `box`, stroked at `stroke` weight.
 *
 * `inset` is half the stroke so the outline sits fully inside the SVG
 * viewport instead of being clipped down its middle — the same correction
 * `CutCornerSurface` makes.
 */
export function frameGeometry(
  shape: FrameShape,
  box: number,
  stroke: number
): FrameGeometry {
  const inset = stroke / 2;
  const c = box / 2;
  const r = c - inset;

  if (shape === "circle") {
    return {
      path: `M${c},${inset} A${r},${r} 0 1 1 ${c - 0.01},${inset} Z`,
      length: 2 * Math.PI * r,
      corners: [],
      isCircle: true,
      cx: c,
      cy: c,
      r,
    };
  }

  if (shape === "octagon") {
    const pts = octagonPoints(box, inset);
    return {
      path: toPath(pts),
      length: polygonLength(pts),
      corners: pts.map(([x, y]) => ({
        x,
        y,
        angle: (Math.atan2(y - c, x - c) * 180) / Math.PI,
      })),
      isCircle: false,
      cx: c,
      cy: c,
      r,
    };
  }

  // The cut shapes reuse the brand primitive so the frame's 45° is provably
  // the same 45° as every card and button in the app.
  const cornerNames = SHAPE_CORNERS[shape];
  const cutSize = box * 0.26;
  const pts = cutCornerPoints(box, box, cutSize, cornerNames, inset);

  // A "corner" for decoration purposes is the midpoint of each cut edge —
  // the diagonal itself, not the square corners it replaced.
  const corners: FrameGeometry["corners"] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const dx = x1 - x0;
    const dy = y1 - y0;
    // Cut edges are the only diagonals in these polygons.
    if (Math.abs(Math.abs(dx) - Math.abs(dy)) > 0.5 || dx === 0 || dy === 0) continue;
    corners.push({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  return {
    path: toPath(pts),
    length: polygonLength(pts),
    corners,
    isCircle: false,
    cx: c,
    cy: c,
    r,
  };
}

/**
 * Dash pattern for a segmented ring: `segments` equal marks with equal gaps.
 * `segments === 1` returns undefined, meaning a continuous stroke.
 */
export function segmentDash(length: number, segments: number): string | undefined {
  if (segments <= 1) return undefined;
  const slot = length / segments;
  // 72/28 mark-to-gap. Enough gap to read as segmented at 40px, not so much
  // that the ring stops reading as a ring.
  return `${(slot * 0.72).toFixed(2)},${(slot * 0.28).toFixed(2)}`;
}

/**
 * Dash pattern for the travelling trail: one short lit arc, then a gap the
 * length of the whole outline so exactly one trail is visible at a time.
 */
export function trailDash(length: number): { dash: string; span: number } {
  const span = length * 0.18;
  return { dash: `${span.toFixed(2)},${(length - span).toFixed(2)}`, span };
}
