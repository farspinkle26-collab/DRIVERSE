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

/**
 * The same two styles as `mapbox://` URLs, for the native SDK.
 *
 * The raster-tile constants above serve `react-native-maps`' `UrlTile`, which
 * fetches pre-rendered 256 px PNGs. `@rnmapbox/maps` renders the *vector*
 * style natively instead — the same cartography, but drawn on the device, so
 * it stays sharp under rotation and pitch and labels stay upright. Both forms
 * name the same Mapbox style, so light/dark keeps matching what shipped.
 */
export const MAPBOX_STYLE_URL_LIGHT = `mapbox://styles/mapbox/${MAPBOX_STYLE_LIGHT}`;
export const MAPBOX_STYLE_URL_DARK = `mapbox://styles/mapbox/${MAPBOX_STYLE_DARK}`;

export const mapboxStyleUrl = (dark: boolean): string =>
  dark ? MAPBOX_STYLE_URL_DARK : MAPBOX_STYLE_URL_LIGHT;

export const getMapboxTileUrlTemplate = (styleId: string): string | null => {
  if (!MAPBOX_ACCESS_TOKEN) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`;
};
