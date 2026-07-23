import React from "react";
import { Platform } from "react-native";
import { UrlTile } from "react-native-maps";
import { MAPBOX_ACCESS_TOKEN, MAPBOX_STYLE_LIGHT, MAPBOX_STYLE_DARK, getMapboxTileUrlTemplate } from "@/constants/mapbox";

interface MapboxTileLayerProps {
  dark?: boolean;
}

// Renders Mapbox raster tiles on top of the native (iOS/Android) map so the app
// uses Mapbox's map imagery. No-op on web and when no token is configured.
const MapboxTileLayer: React.FC<MapboxTileLayerProps> = ({ dark = false }) => {
  if (Platform.OS === "web" || !MAPBOX_ACCESS_TOKEN) return null;

  return (
    <UrlTile
      urlTemplate={getMapboxTileUrlTemplate(dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT)}
      maximumZ={19}
      flipY={false}
      tileSize={512}
      shouldReplaceMapContent
    />
  );
};

export default MapboxTileLayer;
