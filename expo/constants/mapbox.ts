// Mapbox is the map engine everywhere: @rnmapbox/maps (native SDK, no Google
// Maps involved at all) on iOS/Android, and Mapbox's Static Images API for the
// non-interactive web fallback (@rnmapbox/maps has no web/react-native-web build).
export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZHJpdmVyc2UiLCJhIjoiY21yd3pncGZyMGFtdzM1b25ycWV4czNtZCJ9.RPoVghBq7PNmSj1WvvHmVA";

export const MAPBOX_STYLE_LIGHT = "streets-v12";
export const MAPBOX_STYLE_DARK = "dark-v11";

export const MAPBOX_STYLE_URL_LIGHT = `mapbox://styles/mapbox/${MAPBOX_STYLE_LIGHT}`;
export const MAPBOX_STYLE_URL_DARK = `mapbox://styles/mapbox/${MAPBOX_STYLE_DARK}`;

// Mapbox's "Standard" style (v11+ style spec) — unlike the plain streets/dark
// styles above, it supports live config toggles (light/dark preset, POI/transit
// label visibility) via <StyleImport>, which the main map screen uses to
// reproduce the old Google-style-JSON behavior of hiding base-map POI/transit
// labels during normal browsing and showing them while picking a location.
export const MAPBOX_STYLE_URL_STANDARD = "mapbox://styles/mapbox/standard";

export const getMapboxTileUrlTemplate = (styleId: string): string =>
  `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;

// Static, non-interactive preview image — used on web, where @rnmapbox/maps
// (a native-only SDK) can't run.
export const getMapboxStaticImageUrl = (
  latitude: number,
  longitude: number,
  opts?: { zoom?: number; width?: number; height?: number; dark?: boolean }
): string => {
  const zoom = opts?.zoom ?? 14;
  const width = opts?.width ?? 600;
  const height = opts?.height ?? 300;
  const styleId = opts?.dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT;
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/${longitude},${latitude},${zoom}/${width}x${height}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
};
