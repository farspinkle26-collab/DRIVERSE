// Google "Encoded Polyline Algorithm Format" — encode/decode.
// Lets us store a recorded GPS path as a single compact string in the
// saved_routes.route_polyline column and rebuild it for map previews.

export interface LatLng {
  latitude: number;
  longitude: number;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  let result = "";
  while (sgnNum >= 0x20) {
    result += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }
  result += String.fromCharCode(sgnNum + 63);
  return result;
}

/** Encode an array of {latitude, longitude} into a Google polyline string. */
export function encodePolyline(points: LatLng[]): string {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const p of points) {
    const lat = Math.round(p.latitude * 1e5);
    const lng = Math.round(p.longitude * 1e5);
    result += encodeSignedNumber(lat - prevLat);
    result += encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return result;
}

/** Decode a Google polyline string into {latitude, longitude} points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/**
 * Downsample a dense GPS track to at most `maxPoints`, always keeping the
 * first and last fix. Keeps stored polylines small for long drives.
 */
export function simplifyPath(points: LatLng[], maxPoints = 400): LatLng[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  // Guarantee the true endpoint is preserved
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/** Min/max lat/lng bounds for a path, in the [lng, lat] tuple shape Mapbox's Camera.bounds expects. */
export function boundsForPath(points: LatLng[]): { ne: [number, number]; sw: [number, number] } | null {
  if (points.length === 0) return null;
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

/** Bounding region {latitude, longitude, latitudeDelta, longitudeDelta} for a path. */
export function regionForPath(points: LatLng[], pad = 1.4) {
  if (points.length === 0) {
    return { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const latitudeDelta = Math.max((maxLat - minLat) * pad, 0.005);
  const longitudeDelta = Math.max((maxLng - minLng) * pad, 0.005);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
