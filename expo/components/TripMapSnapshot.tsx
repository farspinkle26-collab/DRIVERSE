/**
 * Driveverse — a real map, turned into a still image for the share card.
 *
 * WHY THIS EXISTS RATHER THAN A MAPVIEW INSIDE THE CARD
 *   The card is exported by `react-native-view-shot`, which walks the React
 *   Native view tree and rasterises it. A native map surface's pixels live
 *   outside that tree, so a `MapView` mounted directly inside the card would
 *   capture as a black rectangle. `@rnmapbox/maps`' `MapView.takeSnap()` asks
 *   the map to render *itself* to an image instead. So the card never
 *   contains a map: it contains an `<Image>` of one, produced here.
 *
 * WHY IT IS ON SCREEN AND NOT AT left: -9999
 *   A map parked far offscreen is free to not render: React Native still lays
 *   it out, but the tile fetch is lazy and a snapshot of it comes back grey.
 *   So the stage sits inside the modal at the real size the card's map block
 *   will be, at 1% opacity behind everything else. It is laid out, composited
 *   and fetching tiles like any visible map, and on a `voidBlack` sheet 1% of
 *   a dark map is not perceptible. Near-zero rather than exactly zero on
 *   purpose: a fully transparent subtree is the thing a compositor is most
 *   likely to skip, which is the failure this placement exists to avoid.
 *
 * WHY THE ROUTE AND ENDPOINTS ARE `ShapeSource`/`CircleLayer`, NOT `MarkerView`
 *   `takeSnap()` captures the map's own native rendering — the Mapbox Maps
 *   SDK's GL surface on Android, the whole view hierarchy on iOS. A
 *   `MarkerView` is a React Native view composited *outside* that GL surface
 *   on Android, so an endpoint drawn as one would be invisible in the
 *   exported PNG there even though it shows fine on iOS and on screen. A
 *   `ShapeSource` + `CircleLayer` point is part of the map's native rendering
 *   on both platforms — the same reason the route itself is a `ShapeSource` +
 *   `LineLayer` (`components/MapPolyline.tsx`) rather than a drawn overlay.
 *
 * THE ROUTE IT DRAWS is the speed heatmap: one `LineLayer` per run of
 * `lib/speedTrace.ts` segments (which is why that module quantises — 400
 * segments is a stutter and a snapshot that takes seconds), under a single
 * dark casing line that keeps the coloured line legible over pale tiles.
 *
 * WHY SCALE IS THE VIEW SIZE, NOT A SNAPSHOT PARAMETER
 *   `takeSnap()` has no width/height/scale arguments — it captures the map at
 *   whatever size it is actually laid out at. So getting a sharper-than-1×
 *   image means rendering the `MapView` itself larger, not asking the
 *   snapshot call to upscale after the fact.
 *
 * FAILURE IS EXPECTED, not exceptional: no Mapbox token, no network, a
 * simulator with no tile cache, a user who dismisses the sheet mid-capture.
 * Every one of those resolves to `onSnapshot(null)` and the card keeps its SVG
 * trace. Nothing here throws into the modal.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
// Type-only import, erased at compile time — see `hooks/useMapboxCamera.ts`'s
// header for why this does not reach the native lookup `@rnmapbox/maps`
// performs at module scope (LAUNCH_SAFETY_REFERENCE.md §20).
import type { MapView as MapboxMapViewRef } from "@rnmapbox/maps";
import { loadMapbox, initMapbox } from "@/lib/mapboxNative";
import { useMapboxCamera } from "@/hooks/useMapboxCamera";
import { pointFeature, toPosition } from "@/lib/mapboxCoords";
import { mapboxStyleUrl } from "@/constants/mapbox";
import MapPolyline from "@/components/MapPolyline";
import type { LatLng } from "@/lib/polyline";
import { heatSegments, SPEED_HEAT_FLAT, type SpeedDomain } from "@/lib/speedTrace";
import { MAPBOX_CONFIGURED } from "@/constants/mapbox";
import { colors } from "@/constants/theme";

/**
 * Whether a map image can be produced at all on this runtime.
 *
 * `constants/mapbox.ts` states the rule: every tile comes from the configured
 * Mapbox account, with no bundled or Google fallback. Honouring that here means
 * an unconfigured build must not mount the stage and snapshot an empty dark
 * rectangle — a blank box is worse on a Story than no map at all — so the modal
 * asks this first and offers the map route style only when it is true.
 */
export function canSnapshotMap(): boolean {
  return Platform.OS !== "web" && MAPBOX_CONFIGURED;
}

export interface TripMapSnapshotProps {
  points: LatLng[];
  speeds: number[];
  domain: SpeedDomain;
  /** Draw one flat `racingRed` line instead of the heatmap. */
  flat?: boolean;
  /** Size of the map block on the card, in points. */
  width: number;
  height: number;
  /**
   * Multiplier for the exported image over the on-card size. The card is
   * rescaled to 1080×1920 on capture, so a 1× snapshot arrives soft. Applied
   * to the `MapView`'s own layout size — see the header.
   */
  scale?: number;
  /** `null` means "no map image is coming" — the caller keeps its fallback. */
  onSnapshot: (uri: string | null) => void;
}

/**
 * How long to let the tiles settle after the style finishes loading before
 * snapshotting. Loading the style is not the same as having drawn every
 * tile — snapshot at that instant and some tiles are still grey. 1.2 s is
 * what a cold tile fetch on a mid-range Android took in testing; the retry
 * below covers the rest.
 */
const SETTLE_MS = 1200;

/** One retry, because the first snapshot after a cold start can come back empty. */
const RETRY_MS = 1400;

/**
 * How far the route is inset from the capture's edges, in *design* points —
 * multiplied by `scale` at the call site, since `edgePadding` is measured on
 * the scaled-up stage. Vertical is the larger of the two: a route is usually
 * taller than it is wide, so the vertical fit is the constrained one and the
 * one whose ends show clipping first.
 */
const EDGE_PADDING_Y = 36;
const EDGE_PADDING_X = 32;

/** Casing under the heat/flat line, and the two circle radii for the endpoints. */
const CASING_WIDTH = 9;
const ROUTE_WIDTH = 5;

export default function TripMapSnapshot({
  points,
  speeds,
  domain,
  flat = false,
  width,
  height,
  scale = 2,
  onSnapshot,
}: TripMapSnapshotProps) {
  const Mapbox = loadMapbox();
  const { ref: cameraRef, fitTo: fitToCoordinates } = useMapboxCamera();
  const mapRef = useRef<MapboxMapViewRef>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    initMapbox();
  }, []);

  // Kept in a ref so the capture effect does not restart every time the parent
  // re-renders with a new inline callback — restarting it re-arms the timers
  // and snapshots the same map three times.
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  const segments = React.useMemo(
    () =>
      flat
        ? [{ points, color: SPEED_HEAT_FLAT, speedKmh: 0 }]
        : heatSegments(points, speeds, domain),
    [points, speeds, domain, flat]
  );

  const startFeature = React.useMemo(
    () => (points.length > 0 ? pointFeature(points[0], { role: "start" }) : null),
    [points]
  );
  const endFeature = React.useMemo(
    () => (points.length > 1 ? pointFeature(points[points.length - 1], { role: "end" }) : null),
    [points]
  );

  const handleReady = useCallback(() => {
    if (points.length > 1) {
      fitToCoordinates(points, {
        // Generous padding: a route that touches the frame edge reads as
        // cropped, which is the single clearest "screenshot" tell on a card.
        //
        // Scaled by `scale`, because the stage is rendered at `scale`× and
        // `edgePadding` is in *stage* points. Unscaled, a 36 that was meant
        // to be ~15% of the frame was ~7% of a 2× stage — half the inset it
        // reads as, and the reason routes came out with their ends clipped.
        edgePadding: {
          top: EDGE_PADDING_Y * scale,
          right: EDGE_PADDING_X * scale,
          bottom: EDGE_PADDING_Y * scale,
          left: EDGE_PADDING_X * scale,
        },
        duration: 0,
      });
    }
    setReady(true);
  }, [points, fitToCoordinates, scale]);

  const capture = useCallback(async () => {
    if (doneRef.current || !mapRef.current) return;
    try {
      const uri = await mapRef.current.takeSnap(true);
      if (doneRef.current) return;
      if (typeof uri === "string" && uri.length > 0) {
        doneRef.current = true;
        onSnapshotRef.current(uri);
      }
    } catch {
      // Swallowed on purpose — see the header. The retry, then the give-up
      // timer below, decide what the card ends up showing.
    }
  }, []);

  // Nothing to snapshot on web, or in a build with no Mapbox token. Report it
  // immediately so the card settles on its SVG trace instead of waiting out
  // three timers for an image that was never coming.
  useEffect(() => {
    if (canSnapshotMap() && Mapbox) return;
    onSnapshotRef.current(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canSnapshotMap() || !Mapbox || !ready || points.length < 2) return;
    doneRef.current = false;
    const timers = timersRef.current;
    timers.push(setTimeout(capture, SETTLE_MS));
    timers.push(setTimeout(capture, SETTLE_MS + RETRY_MS));
    // Give up out loud rather than leaving the card waiting forever.
    timers.push(
      setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onSnapshotRef.current(null);
        }
      }, SETTLE_MS + RETRY_MS * 2)
    );
    return () => {
      timers.splice(0).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, capture, points.length]);

  if (!canSnapshotMap() || !Mapbox || points.length < 2) return null;

  const stageWidth = Math.round(width * scale);
  const stageHeight = Math.round(height * scale);

  return (
    <View style={[styles.stage, { width: stageWidth, height: stageHeight }]} pointerEvents="none">
      <Mapbox.MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        // The card is always dark, so the map is too — regardless of the
        // driver's in-app theme. A light map inside a voidBlack card is the
        // composition falling apart, not a preference.
        styleURL={mapboxStyleUrl(true)}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        // Stays ON even though this map is never seen live — the export ends
        // up posted to Instagram/TikTok, which is exactly the kind of
        // end-user-facing map render Mapbox's terms require attribution on.
        // Same rule `app/(tabs)/map.tsx` follows; see that file's header.
        logoEnabled
        attributionEnabled
        onDidFinishLoadingMap={handleReady}
      >
        <Mapbox.Camera ref={cameraRef} defaultSettings={{ centerCoordinate: toPosition(points[0]), zoomLevel: 12 }} />

        {/* Casing first, then the coloured runs on top of it. */}
        <MapPolyline id="snapshot-casing" points={points} width={CASING_WIDTH} color={colors.voidBlack} opacity={0.55} />
        {segments.map((seg, i) => (
          <MapPolyline key={`snapshot-heat-${i}`} id={`snapshot-heat-${i}`} points={seg.points} width={ROUTE_WIDTH} color={seg.color} />
        ))}

        {/* Endpoints — see the header for why these are native circle layers
            and not `MarkerView`s. */}
        {startFeature && (
          <Mapbox.ShapeSource id="snapshot-start" shape={startFeature}>
            <Mapbox.CircleLayer
              id="snapshot-start-fill"
              style={{
                circleRadius: 7,
                circleColor: colors.voidBlack,
                circleStrokeWidth: 3,
                circleStrokeColor: colors.textPrimary,
              }}
            />
          </Mapbox.ShapeSource>
        )}
        {endFeature && (
          <Mapbox.ShapeSource id="snapshot-end" shape={endFeature}>
            <Mapbox.CircleLayer
              id="snapshot-end-halo"
              style={{
                circleRadius: 11,
                // Six-digit hex + a separate opacity, not `alpha()`'s
                // eight-digit hex — Mapbox's style-spec colour parser drops
                // the alpha channel from #RRGGBBAA silently (MapPolyline.tsx
                // hit this first; same parser, same trap).
                circleColor: colors.racingRed,
                circleOpacity: 0.25,
              }}
            />
            <Mapbox.CircleLayer
              id="snapshot-end-fill"
              style={{
                circleRadius: 6,
                circleColor: colors.racingRed,
                circleStrokeWidth: 2,
                circleStrokeColor: colors.voidBlack,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    // On screen, behind everything, effectively invisible — see the header.
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0.01,
    zIndex: -1,
    overflow: "hidden",
    backgroundColor: colors.voidBlack,
  },
});
