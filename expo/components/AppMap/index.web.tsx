// Web build: @rnmapbox/maps has no web target, so this renders a lightweight
// placeholder instead of a live map. Same exported API as the native module
// (index.tsx) so screens don't need platform branching at the call site.
import React, { forwardRef, useImperativeHandle } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface AppMapViewHandle {
  animateCamera: (...args: any[]) => void;
  fitToCoordinates: (...args: any[]) => void;
}

interface AppMapViewProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
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

const AppMapView = forwardRef<AppMapViewHandle, AppMapViewProps>(function AppMapView({ style, dark }, ref) {
  useImperativeHandle(ref, () => ({
    animateCamera: () => {},
    fitToCoordinates: () => {},
  }));

  return (
    <View style={[styles.placeholder, style, dark ? styles.dark : styles.light]}>
      <Text style={[styles.text, dark ? styles.textDark : styles.textLight]}>Map preview isn't available on web</Text>
    </View>
  );
});

export default AppMapView;

export function Marker(_props: {
  coordinate: LatLng;
  onPress?: () => void;
  anchor?: { x: number; y: number };
  children?: React.ReactNode;
  rotation?: number;
  flat?: boolean;
  tracksViewChanges?: boolean;
  zIndex?: number;
}) {
  return null;
}

export function Polyline(_props: {
  coordinates: LatLng[];
  strokeWidth?: number;
  strokeColor?: string;
  lineCap?: string;
  lineJoin?: string;
}) {
  return null;
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  light: { backgroundColor: "#E5E5EA" },
  dark: { backgroundColor: "#1A1A22" },
  text: { fontSize: 13, fontWeight: "600" },
  textLight: { color: "#3A3A3C" },
  textDark: { color: "#9A9AA5" },
});
