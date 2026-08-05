/**
 * The camera, in the shape this app already calls it.
 *
 * `react-native-maps` drove the camera through the MapView ref:
 *
 *     mapRef.current?.animateCamera({ center, zoom, pitch, heading }, { duration })
 *     mapRef.current?.fitToCoordinates(coords, { edgePadding, animated })
 *
 * `@rnmapbox/maps` drives it through a separate `<Camera>` ref, with different
 * names, a different coordinate order, and duration as a field of the stop
 * rather than a second argument:
 *
 *     cameraRef.current?.setCamera({ centerCoordinate, zoomLevel, pitch, heading, animationDuration })
 *     cameraRef.current?.fitBounds(ne, sw, padding, animationDuration)
 *
 * There are thirteen call sites in `app/(tabs)/map.tsx` alone — the chase
 * camera on every GPS fix, centre-on-user, POI taps, event taps, the compass
 * reset, fitting a fetched route, fitting every event. Rewriting each one
 * inline would mean thirteen chances to transpose a coordinate pair, in a file
 * where nobody would notice until a driver did.
 *
 * So the translation lives here once, and the call sites keep their existing
 * shape. `cameraStopFor` is pure and tested; the hook is the thin imperative
 * wrapper around it.
 */

import { useCallback, useRef } from "react";
// Type-only imports, erased at compile time — they emit no `require`, so they
// do not reach the native lookup this package performs at module scope
// (LAUNCH_SAFETY_REFERENCE.md §20). `Camera` is the ref type here, not the
// component: the package declares `export type Camera = CameraRef` alongside
// the component of the same name, and `CameraRef` itself is not re-exported
// from the package root. A deep import cannot stand in — the package's
// `exports` map allows only the root.
import type { Camera as CameraRef, CameraStop } from "@rnmapbox/maps";
import type { LatLng } from "@/lib/polyline";
import { boundsForPoints, toPosition } from "@/lib/mapboxCoords";

/** A camera move, named the way this app's existing call sites name one. */
export interface CameraTarget {
  center?: LatLng;
  zoom?: number;
  pitch?: number;
  heading?: number;
}

/** `fitToCoordinates`' padding, kept in its original shape. */
export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Translates a camera target into a Mapbox `CameraStop`.
 *
 * Only the fields the caller actually set are emitted: `setCamera` treats a
 * present-but-undefined key as a value to animate toward, so spreading
 * `{ pitch: undefined }` flattens a tilted map. Several call sites deliberately
 * move only one property — the compass button sets `heading` alone and must
 * leave zoom and pitch where the driver had them.
 */
export function cameraStopFor(target: CameraTarget, durationMs = 0): CameraStop {
  const stop: CameraStop = { animationDuration: durationMs };

  if (target.center) stop.centerCoordinate = toPosition(target.center);
  if (target.zoom != null) stop.zoomLevel = target.zoom;
  if (target.pitch != null) stop.pitch = target.pitch;
  if (target.heading != null) stop.heading = target.heading;

  return stop;
}

/**
 * `fitToCoordinates`' `edgePadding` as Mapbox's padding array.
 *
 * Mapbox takes `[top, right, bottom, left]` — the CSS order, which is also the
 * order the object's keys are conventionally written in, but the array form
 * gives no protection against getting it wrong, so it is built here.
 */
export function paddingArray(edgePadding: EdgePadding): number[] {
  return [edgePadding.top, edgePadding.right, edgePadding.bottom, edgePadding.left];
}

export function useMapboxCamera() {
  const ref = useRef<CameraRef>(null);

  /**
   * The bearing this app last told the camera to take.
   *
   * `react-native-maps` could draw a marker `flat` on the map surface, so the
   * driver's car could be given an absolute `rotation={heading}` and the
   * library worked out the rest. Mapbox's `MarkerView` is always a billboard
   * facing the viewer, so a car pointing the right way has to be rotated by
   * `heading - bearing` in screen space — and something has to know the
   * bearing.
   *
   * Reading it from `onCameraChanged` would be exact, but that fires every
   * frame of every animation, and a `setState` per frame re-renders the whole
   * map screen. Since every camera move in this app goes through `animate()`,
   * recording the commanded bearing here is free and correct for all of them.
   * It goes stale only while the driver is mid-rotate-gesture, and corrects
   * itself on the next camera move or GPS fix.
   */
  const commandedBearing = useRef(0);

  /** `mapRef.animateCamera(target, { duration })`, unchanged at the call site. */
  const animate = useCallback((target: CameraTarget, options?: { duration?: number }) => {
    if (target.heading != null) commandedBearing.current = target.heading;
    ref.current?.setCamera(cameraStopFor(target, options?.duration ?? 0));
  }, []);

  /**
   * `mapRef.fitToCoordinates(points, { edgePadding, animated })`.
   *
   * A path with no points is a no-op rather than a fit to a degenerate box —
   * `boundsForPoints` returns null and the camera stays where the driver left
   * it, which is what "fit every event" should do when there are no events.
   */
  const fitTo = useCallback(
    (points: LatLng[], options?: { edgePadding?: EdgePadding; duration?: number }) => {
      const camera = ref.current;
      if (!camera) return;

      const bounds = boundsForPoints(points);
      if (!bounds) return;

      camera.fitBounds(
        bounds.ne,
        bounds.sw,
        options?.edgePadding ? paddingArray(options.edgePadding) : undefined,
        options?.duration ?? 0
      );
    },
    []
  );

  /**
   * Screen-space rotation for a marker that should lie flat on the map at an
   * absolute compass `heading` — the `flat` + `rotation` pair `MarkerView`
   * does not have. Normalised to 0–360 so the value handed to a CSS transform
   * never goes negative.
   */
  const flatRotation = useCallback(
    (heading: number) => ((heading - commandedBearing.current) % 360 + 360) % 360,
    []
  );

  return { ref, animate, fitTo, flatRotation };
}
