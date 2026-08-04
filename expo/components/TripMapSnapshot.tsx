/**
 * Driveverse — a real map, turned into a still image for the share card.
 *
 * WHY THIS EXISTS RATHER THAN A MAPVIEW INSIDE THE CARD
 *   The card is exported by `react-native-view-shot`, which walks the React
 *   Native view tree and rasterises it. A Google `MapView` is a native
 *   SurfaceView/GLSurfaceView — its pixels live outside that tree, so on
 *   Android it captures as a black rectangle, and on iOS it is unreliable
 *   depending on when the tiles settled. `react-native-maps` has its own
 *   answer, `MapView.takeSnapshot`, which asks the map to render *itself* to
 *   an image. So the card never contains a map: it contains an `<Image>` of
 *   one, produced here.
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
 * THE ROUTE IT DRAWS is the speed heatmap: one native `<Polyline>` per run of
 * `lib/speedTrace.ts` segments (which is why that module quantises — 400
 * polylines is a stutter and a snapshot that takes seconds), under a single
 * dark casing polyline that keeps the coloured line legible over pale tiles.
 *
 * FAILURE IS EXPECTED, not exceptional: no Play services, no network, a
 * simulator with no tile cache, a user who dismisses the sheet mid-capture.
 * Every one of those resolves to `onSnapshot(null)` and the card keeps its SVG
 * trace. Nothing here throws into the modal.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import MapboxTileLayer from "@/components/MapboxTileLayer";
import SettledMarker from "@/components/SettledMarker";
import type { LatLng } from "@/lib/polyline";
import { regionForPath } from "@/lib/polyline";
import { heatSegments, SPEED_HEAT_FLAT, type SpeedDomain } from "@/lib/speedTrace";
import { MAP_STYLE_DARK } from "@/constants/mapStyles";
import { MAPBOX_CONFIGURED } from "@/constants/mapbox";
import { alpha, colors } from "@/constants/theme";

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
   * rescaled to 1080×1920 on capture, so a 1× snapshot arrives soft.
   */
  scale?: number;
  /** `null` means "no map image is coming" — the caller keeps its fallback. */
  onSnapshot: (uri: string | null) => void;
}

/**
 * How long to let the tiles settle after `onMapReady` before snapshotting.
 * `onMapReady` fires when the map is *usable*, not when it has drawn — snapshot
 * at that instant and you get the grey grid. 1.2 s is what a cold tile fetch on
 * a mid-range Android took in testing; the retry below covers the rest.
 */
const SETTLE_MS = 1200;

/** One retry, because the first snapshot after a cold start can come back empty. */
const RETRY_MS = 1400;

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
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const region = React.useMemo(() => regionForPath(points, 1.25), [points]);

  const fit = useCallback(() => {
    if (points.length > 1) {
      mapRef.current?.fitToCoordinates(points, {
        // Generous padding: a route that touches the frame edge reads as
        // cropped, which is the single clearest "screenshot" tell on a card.
        edgePadding: { top: 36, right: 32, bottom: 36, left: 32 },
        animated: false,
      });
    }
  }, [points]);

  const capture = useCallback(async () => {
    if (doneRef.current || !mapRef.current) return;
    try {
      const uri = await mapRef.current.takeSnapshot({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        format: "png",
        quality: 1,
        result: "file",
      });
      if (doneRef.current) return;
      if (typeof uri === "string" && uri.length > 0) {
        doneRef.current = true;
        onSnapshotRef.current(
          uri.startsWith("file://") || uri.startsWith("content://")
            ? uri
            : `file://${uri}`
        );
      }
    } catch {
      // Swallowed on purpose — see the header. The retry, then the give-up
      // timer below, decide what the card ends up showing.
    }
  }, [width, height, scale]);

  // Nothing to snapshot on web, or in a build with no Mapbox token. Report it
  // immediately so the card settles on its SVG trace instead of waiting out
  // three timers for an image that was never coming.
  useEffect(() => {
    if (canSnapshotMap()) return;
    onSnapshotRef.current(null);
  }, []);

  useEffect(() => {
    if (!canSnapshotMap() || !ready || points.length < 2) return;
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
  }, [ready, capture, points.length]);

  if (!canSnapshotMap() || points.length < 2) return null;

  return (
    <View style={[styles.stage, { width, height }]} pointerEvents="none">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        // The card is always dark, so the map is too — regardless of the
        // driver's in-app theme. A light map inside a voidBlack card is the
        // composition falling apart, not a preference.
        mapType="none"
        customMapStyle={MAP_STYLE_DARK}
        onMapReady={() => {
          fit();
          setReady(true);
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic={false}
        showsPointsOfInterest={false}
      >
        <MapboxTileLayer dark />

        {/* Casing first, then the coloured runs on top of it. */}
        <Polyline
          coordinates={points}
          strokeWidth={9}
          strokeColor={alpha(colors.voidBlack, 0.55)}
          lineCap="round"
          lineJoin="round"
        />
        {segments.map((seg, i) => (
          <Polyline
            key={`heat${i}`}
            coordinates={seg.points}
            strokeWidth={5}
            strokeColor={seg.color}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Endpoints go through SettledMarker like every other custom marker in
            the app — a constant `tracksViewChanges={false}` freezes Android's
            bitmap before the dot has drawn, and here that would bake an empty
            marker into the exported PNG. See MAP_MARKER_REFERENCE §10. */}
        <SettledMarker
          coordinate={points[0]}
          anchor={{ x: 0.5, y: 0.5 }}
          settleKey="trip-start"
        >
          <View style={styles.startDot} />
        </SettledMarker>
        <SettledMarker
          coordinate={points[points.length - 1]}
          anchor={{ x: 0.5, y: 0.5 }}
          settleKey="trip-end"
        >
          <View style={styles.endHalo}>
            <View style={styles.endDot} />
          </View>
        </SettledMarker>
      </MapView>
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
  // Fixed marker geometry, deliberately not from the spacing scale: these are
  // rasterised into the snapshot at whatever size they are, and the endpoints
  // have to stay readable next to a 5pt route line.
  startDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.voidBlack,
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
  endHalo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(colors.racingRed, 0.25),
  },
  endDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.racingRed,
    borderWidth: 2,
    borderColor: colors.voidBlack,
  },
});
