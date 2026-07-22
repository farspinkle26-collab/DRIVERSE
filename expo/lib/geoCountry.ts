import * as Location from "expo-location";

// Resolves a real country name from device GPS (or an explicit lat/lng)
// via on-device reverse geocoding — no third-party API key required.
// Used to scope Events and Community crews to "drivers in my country".
export async function resolveCountry(coords?: { latitude: number; longitude: number }): Promise<string | null> {
  try {
    let point = coords;
    if (!point) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    }
    const results = await Location.reverseGeocodeAsync(point);
    return results[0]?.country ?? null;
  } catch {
    return null;
  }
}
