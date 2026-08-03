// Mapbox raster tile overlay used on top of react-native-maps for iOS/Android.
/**
 * Publishable Mapbox token inlined by Expo at build time.
 *
 * The map intentionally has no bundled or Google fallback: every map tile,
 * search result, reverse geocode, and route must come from the configured
 * Mapbox account. A missing token is surfaced by the map status overlay instead
 * of quietly rendering a different provider or mock data.
 */
export const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() || null;
export const MAPBOX_CONFIGURED = MAPBOX_ACCESS_TOKEN !== null;

export const MAPBOX_STYLE_LIGHT = "streets-v12";
export const MAPBOX_STYLE_DARK = "dark-v11";

export const getMapboxTileUrlTemplate = (styleId: string): string | null => {
  if (!MAPBOX_ACCESS_TOKEN) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
};
