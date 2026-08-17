/**
 * Driveverse — smoothing a discrete stream of samples into motion.
 *
 * Every "live" position or number on the map arrives as spaced-out, discrete
 * samples, not a continuous stream: this device's own GPS fix lands roughly
 * once a second (`watchPositionAsync`'s `timeInterval: 1000` in
 * `app/(tabs)/map.tsx`), and another driver's position arrives roughly every
 * four seconds (`LOCATION_BROADCAST_MS` in `hooks/useOnlineUsers.ts`).
 * Rendering each sample as an instant jump the moment it lands — which is
 * what a marker's `coordinate` prop or a speed `<Text>` did before this file
 * existed — reads as stutter, not motion, no matter how accurate the
 * samples are. `hooks/useGlideLatLng.ts` and `hooks/useGlideNumber.ts` are
 * the stateful half that turns a stream of targets into a value that eases
 * toward each new one; this file is the pure math they interpolate with, so
 * the interpolation itself is testable without a marker, a hook, or a map.
 */

import { headingDelta, type LatLng } from "@/lib/tripGeoStats";

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/**
 * Cubic ease-out: fast at the start, settling gently into the target. A
 * linear glide reads as a robot sliding at constant speed; this reads closer
 * to how a real vehicle (or a camera easing onto one) actually arrives.
 */
export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Linear interpolation between two coordinates, safe across the antimeridian.
 *
 * Interpolating longitude naively sweeps the WRONG way around the globe once
 * `a` and `b` are on opposite sides of the ±180° line — e.g. 179° to -179° is
 * a 2° hop across the line, but a plain `lerp(179, -179, t)` drags the
 * marker the long way through 0°. This shifts `b`'s longitude by a full turn
 * first whenever the raw gap exceeds 180°, interpolates on that adjusted
 * value, then wraps the result back into -180..180.
 */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  const rawDelta = b.longitude - a.longitude;
  const adjustedTargetLng =
    rawDelta > 180
      ? b.longitude - 360
      : rawDelta < -180
        ? b.longitude + 360
        : b.longitude;
  const longitude = lerp(a.longitude, adjustedTargetLng, t);
  return {
    latitude: lerp(a.latitude, b.latitude, t),
    longitude: ((longitude + 540) % 360) - 180,
  };
}

/**
 * Interpolates a compass heading (degrees, 0-360) along its shorter arc —
 * 350° → 10° eases forward through 360°/0°, not backward through 180°.
 * Built on `headingDelta`, the same shortest-arc primitive the chase camera
 * already eases toward in this same screen.
 */
export function lerpHeadingDeg(a: number, b: number, t: number): number {
  return (a + headingDelta(a, b) * clamp01(t) + 360) % 360;
}
