import React from "react";
import { Platform } from "react-native";
import { UrlTile } from "react-native-maps";
import {
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_STYLE_LIGHT,
  MAPBOX_STYLE_DARK,
  getMapboxTileUrlTemplate,
} from "@/constants/mapbox";

interface MapboxTileLayerProps {
  dark?: boolean;
}

// Mapbox is the actual visual map source. react-native-maps supplies the
// native camera/gesture surface while this tile layer replaces its base map
// content with Mapbox style tiles. No provider or mock-data fallback is used.
const MapboxTileLayer: React.FC<MapboxTileLayerProps> = ({ dark = false }) => {
  const urlTemplate = getMapboxTileUrlTemplate(dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT);
  if (Platform.OS === "web" || !MAPBOX_ACCESS_TOKEN || !urlTemplate) return null;

  return (
    <UrlTile
      urlTemplate={urlTemplate}
      maximumZ={19}
      flipY={false}
      tileSize={512}
      shouldReplaceMapContent
      // Without this prop present at all, Android's native `MapUrlTile`
      // (node_modules/react-native-maps/android/.../MapTileProvider.java)
      // never enters "custom mode" and every tile request goes through
      // Google Play Services' own built-in UrlTileProvider fetcher instead
      // of react-native-maps' own. That built-in path logs nothing on
      // failure — success or fail, logcat is silent — which is exactly why
      // a blank map produced zero diagnostic signal anywhere. Setting this
      // prop, to any value, unconditionally flips `customTileProviderNeeded`
      // true in `MapUrlTile.setDoubleTileSize()`, routing every tile
      // through react-native-maps' own fetch path instead, which does log.
      doubleTileSize={false}
    />
  );
};

export default MapboxTileLayer;
