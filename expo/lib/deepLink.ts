/**
 * Deep links that cannot take the app down with them.
 *
 * WHY THIS EXISTS
 *   `Linking.createURL()` is not a pure string builder — it reads the app's
 *   scheme out of the `expo-constants` manifest and *throws* when it can't
 *   find one. There are two throwing paths in `expo-linking`'s `resolveScheme`,
 *   and both fire in a release build only:
 *
 *     "expo-linking needs access to the expo-constants manifest ..."   — when
 *       `Constants.expoConfig` comes back empty, which is what a build with no
 *       embedded manifest hands the JS side.
 *     "Cannot make a deep link into a standalone app with no custom scheme
 *       defined"                                                       — when
 *       the manifest is there but carries no `scheme`.
 *
 *   In development neither one throws (the first branch is skipped in the
 *   store client, the second is downgraded to a `console.warn` behind
 *   `__DEV__`), so a build that dies on the device runs perfectly in Expo Go.
 *   That asymmetry is exactly why this is worth wrapping rather than trusting.
 *
 *   `lib/socialAuth.ts` used to call `createURL` at *module scope*, so the
 *   throw landed while Hermes was still evaluating the bundle — before the
 *   first frame, and outside any React error boundary. The result is a process
 *   that dies on launch with no screen and nothing to catch it. Same class of
 *   bug as the module-scope `setNotificationHandler()` call removed from
 *   `hooks/useNotificationStore.ts`.
 *
 * WHAT THIS DOES INSTEAD
 *   Ask `expo-linking` first — it is still the only thing that knows about
 *   development URLs (`exp://10.0.0.4:8081/--/path`), and getting those right
 *   is what makes an OAuth round-trip work on a dev machine. If it throws,
 *   fall back to building the link by hand from the scheme this app is
 *   actually shipped with. A link built from the wrong scheme is a broken
 *   redirect; a `createURL` that throws is a dead app. The first is worth
 *   trading for the second.
 */

import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { buildLink } from "@/lib/deepLinkFormat";

export { buildLink };

/**
 * The scheme declared in `app.json` (`expo.scheme`), mirrored here.
 *
 * Duplicating a config value in code is normally a smell. It is deliberate
 * here: the whole point of the fallback is to keep working in the case where
 * the manifest is what went missing, so reading the scheme back out of the
 * manifest would defeat it. If `app.json`'s `scheme` ever changes, change it
 * here too — `schemeFromManifest()` is tried first, so the two only ever
 * disagree in the broken-manifest case this exists for.
 */
export const APP_SCHEME = "myapp";

/**
 * The app's scheme according to the runtime manifest, when there is one.
 *
 * Guarded as well: this only ever runs after `expo-linking` has already
 * failed to read the manifest, so `expo-constants` is exactly the thing not
 * to trust here.
 */
function schemeFromManifest(): string | null {
  try {
    const scheme = Constants.expoConfig?.scheme;
    if (typeof scheme === "string" && scheme.length > 0) return scheme;
    if (Array.isArray(scheme)) {
      const first = scheme.find((s) => typeof s === "string" && s.length > 0);
      if (first) return first;
    }
  } catch {
    // Fall through to the built-in scheme.
  }
  return null;
}

/**
 * A deep link into this app, or a best-effort one if the manifest can't
 * answer. Never throws.
 *
 * @param path Path to append, without a leading slash — e.g. `route/42`.
 */
export function createAppLink(path = ""): string {
  try {
    return Linking.createURL(path);
  } catch (err) {
    // Release-build-only failure; log it so a broken redirect is traceable to
    // the manifest rather than looking like a Supabase or store problem.
    console.error(
      "[deepLink] Linking.createURL failed; falling back to the built-in " +
        "scheme. The build is missing its expo-constants manifest or its " +
        "`scheme`:",
      err
    );
    return buildLink(schemeFromManifest() ?? APP_SCHEME, path);
  }
}

export default createAppLink;
