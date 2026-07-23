// Thin compatibility layer over @rnmapbox/maps that mimics the small slice of
// react-native-maps' API this app used, so screens keep working with almost no
// call-site changes while the actual map engine/tiles are 100% Mapbox + OSM
// (no Google Maps anywhere, on either platform).
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_URL_DARK, MAPBOX_STYLE_URL_LIGHT } from "@/constants/mapbox";

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AppMapViewHandle {
  animateCamera: (
    config: { center?: LatLng; zoom?: number; pitch?: number; heading?: number },
    opts?: { duration?: number }
  ) => void;
  fitToCoordinates: (coordinates: LatLng[], opts?: { edgePadding?: EdgePadding; animated?: boolean }) => void;
}

function zoomFromLatitudeDelta(latitudeDelta: number): number {
  return Math.max(2, Math.min(20, Math.log2(360 / latitudeDelta)));
}

function regionToBounds(region: Region) {
  return {
    ne: { latitude: region.latitude + region.latitudeDelta / 2, longitude: region.longitude + region.longitudeDelta / 2 },
    sw: { latitude: region.latitude - region.latitudeDelta / 2, longitude: region.longitude - region.longitudeDelta / 2 },
  };
}

interface AppMapViewProps {
  style?: StyleProp<ViewStyle>;
  initialRegion: Region;
  dark?: boolean;
  showsUserLocation?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  pitchEnabled?: boolean;
  rotateEnabled?: boolean;
  onPress?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  onLongPress?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  onRegionChangeComplete?: (region: Region) => void;
  onMapReady?: () => void;
  onLayout?: () => void;
  children?: React.ReactNode;
}

const AppMapView = forwardRef<AppMapViewHandle, AppMapViewProps>(function AppMapView(
  {
    style,
    initialRegion,
    dark,
    showsUserLocation,
    scrollEnabled = true,
    zoomEnabled = true,
    pitchEnabled = true,
    rotateEnabled = true,
    onPress,
    onLongPress,
    onRegionChangeComplete,
    onMapReady,
    onLayout,
    children,
  },
  ref
) {
  const cameraRef = useRef<MapboxGL.Camera>(null);

  useImperativeHandle(ref, () => ({
    animateCamera: (config, opts) => {
      cameraRef.current?.setCamera({
        centerCoordinate: config.center ? [config.center.longitude, config.center.latitude] : undefined,
        zoomLevel: config.zoom,
        pitch: config.pitch,
        heading: config.heading,
        animationDuration: opts?.duration ?? 0,
        animationMode: "easeTo",
      });
    },
    fitToCoordinates: (coordinates, opts) => {
      if (!coordinates.length) return;
      const lats = coordinates.map((c) => c.latitude);
      const lngs = coordinates.map((c) => c.longitude);
      const pad = opts?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 };
      cameraRef.current?.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [pad.top, pad.right, pad.bottom, pad.left],
        opts?.animated === false ? 0 : 500
      );
    },
  }));

  const initialBounds = useMemo(() => regionToBounds(initialRegion), [initialRegion]);

  return (
    <MapboxGL.MapView
      style={style ?? StyleSheet.absoluteFill}
      styleURL={dark ? MAPBOX_STYLE_URL_DARK : MAPBOX_STYLE_URL_LIGHT}
      compassEnabled={false}
      scaleBarEnabled={false}
      attributionPosition={{ bottom: 4, right: 4 }}
      scrollEnabled={scrollEnabled}
      zoomEnabled={zoomEnabled}
      pitchEnabled={pitchEnabled}
      rotateEnabled={rotateEnabled}
      onDidFinishLoadingMap={onMapReady}
      onLayout={onLayout}
      onPress={(feature) => {
        const [longitude, latitude] = (feature as any).geometry.coordinates;
        onPress?.({ nativeEvent: { coordinate: { latitude, longitude } } });
      }}
      onLongPress={(feature) => {
        const [longitude, latitude] = (feature as any).geometry.coordinates;
        onLongPress?.({ nativeEvent: { coordinate: { latitude, longitude } } });
      }}
      onRegionDidChange={(feature) => {
        if (!onRegionChangeComplete) return;
        const props: any = (feature as any).properties ?? {};
        const [longitude, latitude] = (feature as any).geometry.coordinates;
        const bounds = props.visibleBounds as [[number, number], [number, number]] | undefined;
        const latitudeDelta = bounds ? Math.abs(bounds[0][1] - bounds[1][1]) : initialRegion.latitudeDelta;
        const longitudeDelta = bounds ? Math.abs(bounds[0][0] - bounds[1][0]) : initialRegion.longitudeDelta;
        onRegionChangeComplete({ latitude, longitude, latitudeDelta, longitudeDelta });
      }}
    >
      <MapboxGL.Camera
        ref={cameraRef}
        defaultSettings={{
          centerCoordinate: [initialRegion.longitude, initialRegion.latitude],
          zoomLevel: zoomFromLatitudeDelta(initialRegion.latitudeDelta),
        }}
        bounds={{
          ne: [initialBounds.ne.longitude, initialBounds.ne.latitude],
          sw: [initialBounds.sw.longitude, initialBounds.sw.latitude],
        }}
      />
      {showsUserLocation ? <MapboxGL.UserLocation visible /> : null}
      {children}
    </MapboxGL.MapView>
  );
});

export default AppMapView;

interface MarkerProps {
  coordinate: LatLng;
  onPress?: () => void;
  anchor?: { x: number; y: number };
  children?: React.ReactNode;
  zIndex?: number;
  // Screen-space rotation in degrees (matches react-native-maps' `rotation`
  // for a `flat` marker closely enough for a heading puck; true map-bearing-
  // relative rotation would need to track camera heading separately).
  rotation?: number;
  flat?: boolean;
  // Accepted for react-native-maps API compatibility; MarkerView always
  // renders real views on both platforms, so there's no bitmap snapshot to
  // freeze/unfreeze and this is a no-op.
  tracksViewChanges?: boolean;
}

export function Marker({ coordinate, onPress, anchor, children, rotation }: MarkerProps) {
  return (
    <MapboxGL.MarkerView coordinate={[coordinate.longitude, coordinate.latitude]} anchor={anchor ?? { x: 0.5, y: 1 }}>
      <Pressable
        onPress={onPress}
        style={rotation ? { transform: [{ rotate: `${rotation}deg` }] } : undefined}
      >
        {children}
      </Pressable>
    </MapboxGL.MarkerView>
  );
}

interface PolylineProps {
  coordinates: LatLng[];
  strokeWidth?: number;
  strokeColor?: string;
  lineCap?: "round" | "butt" | "square";
  lineJoin?: "round" | "bevel" | "miter";
}

let lineSeq = 0;

export function Polyline({ coordinates, strokeWidth = 3, strokeColor = "#000000", lineCap = "round", lineJoin = "round" }: PolylineProps) {
  const id = useMemo(() => `polyline-${lineSeq++}`, []);
  const shape = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coordinates.map((c) => [c.longitude, c.latitude]),
      },
    }),
    [coordinates]
  );

  if (coordinates.length < 2) return null;

  return (
    <MapboxGL.ShapeSource id={`${id}-src`} shape={shape}>
      <MapboxGL.LineLayer
        id={id}
        style={{
          lineWidth: strokeWidth,
          lineColor: strokeColor,
          lineCap,
          lineJoin,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}
