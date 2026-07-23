// Public Mapbox access token (pk.*) used by @rnmapbox/maps at runtime and by
// the REST helpers in lib/mapboxApi.ts. Safe to ship in the client bundle.
export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.EXPO_PUBLIC_MAPBOX ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_TOKEN ||
  "pk.eyJ1IjoiZHJpdmVyc2UiLCJhIjoiY21yd3pncGZyMGFtdzM1b25ycWV4czNtZCJ9.RPoVghBq7PNmSj1WvvHmVA";

// Mapbox's own vector styles, built primarily from OpenStreetMap data, used
// directly as the MapView's styleURL (no third-party map engine involved).
export const MAPBOX_STYLE_URL_LIGHT = "mapbox://styles/mapbox/streets-v12";
export const MAPBOX_STYLE_URL_DARK = "mapbox://styles/mapbox/dark-v11";
