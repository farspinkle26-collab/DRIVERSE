// Web entry point. @rnmapbox/maps is a native-only SDK with no web build, so
// every screen that renders a map gates on Platform.OS === "web" and shows a
// static Mapbox preview image there instead (see getMapboxStaticImageUrl).
// These stand-ins exist purely so the shared import names resolve on web —
// they are never actually rendered.
import React from "react";
import { View } from "react-native";

const Noop: React.FC<any> = () => null;

export const MapView: React.FC<any> = ({ children, style }) => React.createElement(View, { style }, children);
export const Camera: React.FC<any> = Noop;
export const MarkerView: React.FC<any> = Noop;
export const PointAnnotation: React.FC<any> = Noop;
export const ShapeSource: React.FC<any> = Noop;
export const LineLayer: React.FC<any> = Noop;
export const UserLocation: React.FC<any> = Noop;
export const Images: React.FC<any> = Noop;
export const StyleImport: React.FC<any> = Noop;

const Mapbox = {
  setAccessToken: (_token: string) => {},
  StyleURL: { Street: "", Dark: "" },
};

export default Mapbox;
