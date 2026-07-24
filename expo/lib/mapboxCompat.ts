// Native (iOS/Android) entry point — re-exports the real @rnmapbox/maps SDK.
// Metro picks this file (not mapboxCompat.web.ts) for native builds.
//
// @rnmapbox/maps throws synchronously the moment it's required if its native
// module isn't linked into the running binary (e.g. Expo Go, or a dev client
// built before the package was added). That throw happens during import
// evaluation, before React ever renders, which crashes the whole app to the
// red error screen. We require it defensively and fall back to no-op stand-ins
// so the rest of the app keeps working — maps just won't render.
import React from "react";
import { View } from "react-native";
// Type-only imports are erased at compile time and never executed, so they
// can't trigger the native-module throw — they just give us back the real
// class types (Camera, MapView, ...) to re-export alongside the runtime values.
import type { default as MapboxType, Camera as CameraType } from "@rnmapbox/maps";

const Noop: React.FC<any> = () => null;

let MapboxExport: typeof MapboxType | any;
let MapViewExport: any;
let CameraExport: typeof CameraType | any = Noop;
let MarkerViewExport: any = Noop;
let PointAnnotationExport: any = Noop;
let ShapeSourceExport: any = Noop;
let LineLayerExport: any = Noop;
let UserLocationExport: any = Noop;
let ImagesExport: any = Noop;
let StyleImportExport: any = Noop;
let isMapboxAvailableExport = false;

try {
  const RNMapbox = require("@rnmapbox/maps");
  MapboxExport = RNMapbox.default ?? RNMapbox;
  MapViewExport = RNMapbox.MapView;
  CameraExport = RNMapbox.Camera;
  MarkerViewExport = RNMapbox.MarkerView;
  PointAnnotationExport = RNMapbox.PointAnnotation;
  ShapeSourceExport = RNMapbox.ShapeSource;
  LineLayerExport = RNMapbox.LineLayer;
  UserLocationExport = RNMapbox.UserLocation;
  ImagesExport = RNMapbox.Images;
  StyleImportExport = RNMapbox.StyleImport;
  isMapboxAvailableExport = true;
} catch (error) {
  console.warn(
    "[mapboxCompat] @rnmapbox/maps native module is unavailable. " +
      "This is expected in Expo Go — @rnmapbox/maps requires a custom development build. " +
      "Run a dev client build (e.g. `expo run:ios` / `expo run:android` or an EAS dev build) to enable maps. " +
      "Falling back to a no-op map so the rest of the app keeps working.",
    error,
  );
  MapViewExport = ({ children, style }: { children?: React.ReactNode; style?: any }) =>
    React.createElement(View, { style }, children);
  MapboxExport = {
    setAccessToken: (_token: string) => {},
    StyleURL: { Street: "", Dark: "" },
  };
}

export default MapboxExport;
export const MapView = MapViewExport;
export const Camera = CameraExport;
export const MarkerView = MarkerViewExport;
export const PointAnnotation = PointAnnotationExport;
export const ShapeSource = ShapeSourceExport;
export const LineLayer = LineLayerExport;
export const UserLocation = UserLocationExport;
export const Images = ImagesExport;
export const StyleImport = StyleImportExport;
// True only when the real @rnmapbox/maps native module loaded successfully —
// false in Expo Go or a dev client built before the module was linked, where
// MapView above is just an empty View standing in for the real map.
export const isMapboxAvailable = isMapboxAvailableExport;

// Type-only re-export so consumers can still write `useRef<Camera>(...)`
// (merges with the value export above — TS keeps type space and value space separate).
export type Camera = CameraType;
