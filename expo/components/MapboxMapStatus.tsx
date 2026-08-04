import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { MAPBOX_CONFIGURED } from "@/constants/mapbox";

interface MapboxMapStatusProps {
  style?: StyleProp<ViewStyle>;
}

/** Visible attribution and configuration status for the Mapbox-backed map. */
const MapboxMapStatus: React.FC<MapboxMapStatusProps> = ({ style }) => (
  <View style={[styles.container, style]} pointerEvents="none">
    <Text style={styles.provider}>{MAPBOX_CONFIGURED ? "MAPBOX LIVE" : "MAPBOX NOT CONFIGURED"}</Text>
    <Text style={styles.attribution}>© Mapbox · © OpenStreetMap</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    backgroundColor: "rgba(6, 6, 9, 0.78)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  provider: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  attribution: {
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: 8,
    marginTop: 2,
  },
});

export default MapboxMapStatus;
