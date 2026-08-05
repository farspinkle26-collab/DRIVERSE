/**
 * The one place `@rnmapbox/maps` is loaded, and the one place its access token
 * is set.
 *
 * WHY THIS IS NOT A PLAIN `import` AT THE TOP OF THE MAP SCREEN
 *
 * `@rnmapbox/maps` reaches a native module while it is being evaluated. Its
 * entry re-exports `components/MapView.js`, `components/Camera.js` and
 * `components/ShapeSource.js`, and each of those carries a static
 * `import … from '../specs/Native…Module'` — files whose entire body is:
 *
 *     export default TurboModuleRegistry.getEnforcing('RNMBXMapViewModule');
 *
 * `getEnforcing` **throws** when the native half is not registered. Static
 * `import`s are hoisted, so that throw happens at MODULE SCOPE, the instant
 * anything requires this package — which is LAUNCH_SAFETY_REFERENCE.md §10
 * exactly, the `expo-web-browser` crash, in a different package.
 *
 * And §19 is why a `try/catch` around the require is not the answer: the first
 * time any module is required, Metro's own loader wraps that evaluation in its
 * own try/catch and calls `global.ErrorUtils.reportFatalError(e)` directly,
 * without rethrowing, in production too. The app is dead before any catch
 * block in this file would run. The only thing that works is **not calling
 * require at all on a platform where the module is known to be absent,
 * checked before the call** — the rule `lib/authBrowser.ts` already follows.
 *
 * Hence `loadMapbox()`: a `Platform.OS` gate first, the require second.
 *
 * On native the module IS linked (the config plugin in `app.json` builds it),
 * so the require resolves. If it ever does not, that is a broken build and it
 * fails loudly on the map screen — not a silent black screen at launch, which
 * is the outcome this shape is chosen to avoid.
 *
 * WHY THE TOKEN IS SET IN AN EFFECT AND NOT HERE AT IMPORT TIME
 *
 * `Mapbox.setAccessToken()` is a native call. Every example in the wild puts
 * it at module scope, next to the import. That is §1/§2: no native call at
 * module scope on anything the launch path can reach. `initMapbox()` is
 * therefore something a component calls from a mount effect — after React
 * exists, inside `AppErrorBoundary`, after the crash reporter has armed.
 */

import { Platform } from "react-native";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";

/**
 * The `@rnmapbox/maps` module, or `null` where its native half cannot exist.
 *
 * MUST keep the `Platform.OS` check BEFORE the `require`, and must not be
 * "simplified" into a static import — see this file's header, and §19.
 */
export function loadMapbox(): typeof import("@rnmapbox/maps").default | null {
  if (Platform.OS === "web") {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@rnmapbox/maps").default;
}

/** Set once per process; `setAccessToken` does not need repeating per mount. */
let initialised = false;

/**
 * Hands Mapbox its access token. Safe to call from every map screen's mount
 * effect — the first call does the work and the rest are no-ops.
 *
 * Returns whether the map can be expected to draw, so a caller can render its
 * "not configured" state instead of an empty grey rectangle. Never throws: a
 * map that cannot start is a screen that shows a message, not a crash.
 */
export function initMapbox(): boolean {
  if (!MAPBOX_ACCESS_TOKEN) return false;

  const Mapbox = loadMapbox();
  if (!Mapbox) return false;

  if (initialised) return true;

  try {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
    initialised = true;
    return true;
  } catch {
    return false;
  }
}

/** Test seam — lets a test observe a fresh process. Not for app code. */
export function resetMapboxInitForTests(): void {
  initialised = false;
}
