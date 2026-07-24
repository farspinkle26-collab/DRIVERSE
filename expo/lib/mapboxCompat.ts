// Native (iOS/Android) entry point — re-exports the real @rnmapbox/maps SDK.
// Metro picks this file (not mapboxCompat.web.ts) for native builds.
import Mapbox, {
  MapView,
  Camera,
  MarkerView,
  PointAnnotation,
  ShapeSource,
  LineLayer,
  UserLocation,
  Images,
  StyleImport,
} from "@rnmapbox/maps";

export default Mapbox;
export { MapView, Camera, MarkerView, PointAnnotation, ShapeSource, LineLayer, UserLocation, Images, StyleImport };
