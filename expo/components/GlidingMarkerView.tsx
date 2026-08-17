import React from "react";
import { loadMapbox } from "@/lib/mapboxNative";
import { toPosition } from "@/lib/mapboxCoords";
import { useGlideLatLng } from "@/hooks/useGlideLatLng";
import type { LatLng } from "@/lib/tripGeoStats";

/**
 * A `Mapbox.MarkerView` whose coordinate eases toward each new `target`
 * instead of snapping — see `hooks/useGlideLatLng.ts` for the mechanics and
 * `lib/glide.ts`'s header for why this exists at all.
 *
 * WHY A SEPARATE COMPONENT, NOT A HOOK CALL INLINE IN THE MARKER LIST
 *   `app/(tabs)/map.tsx` renders one marker per online driver via
 *   `onlineUsers.map(...)`, and each marker needs its OWN glide state — a
 *   hook call cannot legally live inside that callback (React's rules of
 *   hooks: a variable number of hook calls per render is not allowed). One
 *   component per list item, each with its own single top-level hook call,
 *   is the legal and standard way to do this — the same reasoning
 *   `components/SettledMarker.tsx` already follows for the same shape of
 *   problem (many markers, each with its own small piece of local state).
 *   It is also what keeps the animation cheap: only the marker actually
 *   gliding re-renders, not the whole map screen.
 */
export interface GlidingMarkerViewProps {
  target: LatLng;
  /** How long each glide toward a new target takes. */
  glideMs: number;
  /** Farther than this in one update snaps instead of gliding — see the hook. */
  snapThresholdMeters: number;
  anchor?: { x: number; y: number };
  allowOverlap?: boolean;
  /** `Mapbox.MarkerView` takes exactly one element, not an arbitrary node. */
  children: React.ReactElement;
}

export default function GlidingMarkerView({
  target,
  glideMs,
  snapThresholdMeters,
  anchor,
  allowOverlap,
  children,
}: GlidingMarkerViewProps) {
  const Mapbox = loadMapbox();
  const display = useGlideLatLng(target, glideMs, snapThresholdMeters);

  if (!Mapbox) return null;

  return (
    <Mapbox.MarkerView coordinate={toPosition(display)} anchor={anchor} allowOverlap={allowOverlap}>
      {children}
    </Mapbox.MarkerView>
  );
}
