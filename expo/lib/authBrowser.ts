/**
 * Opens the OAuth page and waits for the callback, by whichever route works.
 *
 * WHY THIS EXISTS — `expo-web-browser` is excluded from Android autolinking.
 *
 * Rork's cloud builder resolves `expo-web-browser` 56.x into an SDK 54 app no
 * matter what `package.json` says. Three attempts failed to change that: the
 * corrected `dependencies` entry (#167), an exact `overrides`/`resolutions`
 * pin (#170), and removing `@rork-ai/toolkit-sdk`, whose `"*"` peer was
 * pulling it (#171). Every build after every one of those still shipped the
 * 56.x native module and died on open:
 *
 *     NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeCache
 *       at expo.modules.webbrowser.WebBrowserModule.definition
 *
 * That crash happens while Expo REGISTERS its native modules, inside
 * `ReactInstance.<init>`, before a single line of JavaScript runs — so nothing
 * in this repo's JavaScript could ever prevent it. What can is refusing to
 * link the module at all: `expo.autolinking.android.exclude` in `package.json`.
 * An excluded module is never registered, so `definition()` never runs and the
 * class it wants is never looked up, whatever version the builder installed.
 *
 * The exclusion is **Android only**. iOS links `expo-web-browser` normally and
 * keeps the in-app `SFSafariViewController` sheet, which works today; there is
 * no reason to degrade it for an Android build problem.
 *
 * So Android has no `ExpoWebBrowser` native module, and this file is the
 * consequence: the OAuth page opens in the system browser via `Linking`
 * instead, and the callback comes back through the app's `myapp://` deep link.
 * Same PKCE flow, same redirect, same `parseAuthCallback` on the other side —
 * the only difference the driver sees is a browser app-switch rather than a
 * sheet sliding up.
 *
 * The transport is chosen by ASKING, not by checking `Platform.OS`: if the
 * native module is present it is used. That way iOS keeps its sheet, Android
 * falls back, and if a future build ever does link a correct
 * `expo-web-browser` on Android, it silently starts using the better route
 * with no code change.
 */

import { AppState, Linking, type AppStateStatus, type EmitterSubscription } from "react-native";
import type * as WebBrowserTypes from "expo-web-browser";

/** What the caller needs to know: a callback URL, or the user backing out. */
export type AuthSessionResult =
  | { type: "success"; url: string }
  | { type: "cancel" };

/**
 * How long to wait, after the app comes back to the foreground, before calling
 * it a cancel.
 *
 * Returning from the browser and receiving the deep link are two separate
 * events with no guaranteed order: Android may deliver the `url` event just
 * before, during, or just after the `active` transition. Resolving `cancel` the
 * instant the app is foregrounded therefore races a successful sign-in and
 * loses it roughly at random.
 *
 * A short grace period removes the race. The cost of waiting is 400 ms of
 * nothing on a genuine cancel; the cost of not waiting is a driver who
 * completed Google sign-in being told it was cancelled.
 */
export const RETURN_GRACE_MS = 400;

/**
 * Injectable seam — the real `Linking`/`AppState` by default, fakes in tests.
 * Kept to exactly the four calls this module makes, so a test double is small
 * enough to read.
 */
export interface AuthBrowserDeps {
  openURL: (url: string) => Promise<unknown>;
  addUrlListener: (handler: (event: { url: string }) => void) => { remove: () => void };
  addAppStateListener: (handler: (state: AppStateStatus) => void) => { remove: () => void };
}

const nativeDeps: AuthBrowserDeps = {
  openURL: (url) => Linking.openURL(url),
  addUrlListener: (handler) =>
    Linking.addEventListener("url", handler) as unknown as EmitterSubscription,
  addAppStateListener: (handler) => AppState.addEventListener("change", handler),
};

/**
 * Resolves `expo-web-browser`, or null when its native module is not linked.
 *
 * `require` rather than a static import, and inside a `try`, for two reasons.
 * The package's entry is one line of `requireNativeModule('ExpoWebBrowser')`,
 * which THROWS when the module is absent — which is exactly the state Android
 * is now deliberately in. And a static import would put that throw on the
 * launch path, which is the rule in LAUNCH_SAFETY_REFERENCE.md §1/§2.
 */
export function loadWebBrowser(): typeof WebBrowserTypes | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-web-browser") as typeof WebBrowserTypes;
  } catch {
    return null;
  }
}

/**
 * Opens the OAuth page in the system browser and resolves when the app is
 * handed the callback deep link — or when the driver comes back without one.
 *
 * Exported for its tests; `openAuthSession` picks it automatically.
 */
export function openViaSystemBrowser(
  authUrl: string,
  deps: AuthBrowserDeps = nativeDeps
): Promise<AuthSessionResult> {
  return new Promise((resolve) => {
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: AuthSessionResult) => {
      if (settled) return;
      settled = true;
      if (graceTimer) clearTimeout(graceTimer);
      urlSub.remove();
      appSub.remove();
      resolve(result);
    };

    const urlSub = deps.addUrlListener(({ url }) => {
      finish({ type: "success", url });
    });

    const appSub = deps.addAppStateListener((state) => {
      if (state !== "active" || settled || graceTimer) return;
      graceTimer = setTimeout(() => finish({ type: "cancel" }), RETURN_GRACE_MS);
    });

    // A browser that refuses to open is a cancel, not a crash: the caller
    // shows its own "sign-in didn't complete" state either way.
    deps.openURL(authUrl).catch(() => finish({ type: "cancel" }));
  });
}

/**
 * The one call `lib/socialAuth.ts` makes. Uses the in-app browser sheet when
 * the native module is linked (iOS), the system browser when it is not
 * (Android), and reports both in the same shape.
 */
export async function openAuthSession(
  authUrl: string,
  redirectTo: string
): Promise<AuthSessionResult> {
  const browser = loadWebBrowser();

  if (!browser) {
    return openViaSystemBrowser(authUrl);
  }

  const result = await browser.openAuthSessionAsync(authUrl, redirectTo);

  if (result.type === "success" && result.url) {
    return { type: "success", url: result.url };
  }

  // `cancel` and `dismiss` are the driver backing out. Anything else is a
  // session that ended without handing us a URL, which the caller reports as a
  // failed callback rather than a cancel — so only the two explicit
  // back-out types map to `cancel`.
  if (result.type === "cancel" || result.type === "dismiss") {
    return { type: "cancel" };
  }

  return { type: "success", url: "" };
}
