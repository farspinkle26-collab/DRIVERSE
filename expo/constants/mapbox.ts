// Mapbox raster tile overlay used on top of react-native-maps for iOS/Android.
// We keep react-native-maps (Google-backed on native) as the map engine and simply
// paint Mapbox's raster tiles over it via <UrlTile>, so no native SDK / prebuild is needed.
export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZHJpdmVyc2UiLCJhIjoiY21yd3pncGZyMGFtdzM1b25ycWV4czNtZCJ9.RPoVghBq7PNmSj1WvvHmVA";

export const MAPBOX_STYLE_LIGHT = "streets-v12";
export const MAPBOX_STYLE_DARK = "dark-v11";

export const getMapboxTileUrlTemplate = (styleId: string): string =>
  `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
