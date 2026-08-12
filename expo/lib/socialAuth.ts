/**
 * LAUNCH SAFETY — nothing in this module may run at import time.
 *
 * `useAuthStore` imports this file and `app/_layout.tsx` imports that, so this
 * module is evaluated while Hermes is still loading the bundle, before the
 * app's first frame and outside any React error boundary. Anything that throws
 * up here takes the process down on launch with a blank screen and no
 * diagnosable error — which is how it reaches a store listing and starts
 * looking like "the app just crashes when you open it".
 *
 * Two calls used to sit at module scope and both are now deferred:
 *
 *   WebBrowser.maybeCompleteAuthSession() — reaches into the ExpoWebBrowser
 *     native module. It is a no-op off the web anyway (the native side does
 *     not implement it), so its only effect on a phone was the risk.
 *
 *   Linking.createURL("auth-callback") — throws in a release build when the
 *     expo-constants manifest or its `scheme` is missing. Now built lazily
 *     through `lib/deepLink.ts`, which cannot throw, on the first sign-in
 *     attempt rather than on every launch.
 *
 * DEFERRING THE CALL WAS NOT ENOUGH — deferring the IMPORT is the fix.
 *
 * Both deferrals above were in place and the app still died on open, on iOS
 * and Android alike, because the throw was never in this file. The statement
 *
 *     import * as WebBrowser from "expo-web-browser";
 *
 * is itself the hazard: `expo-web-browser/build/ExpoWebBrowser.js` is one line
 * of module-scope native lookup —
 *
 *     export default requireNativeModule('ExpoWebBrowser');
 *
 * — and `requireNativeModule` THROWS when the native module is not registered
 * (its sibling `requireOptionalNativeModule` returns null instead; that is the
 * whole difference, and it is why `expo-apple-authentication` below was
 * survivable and this was not). Importing the module runs that line, so the
 * process died while Hermes was still evaluating the bundle: before the first
 * frame, above `AppErrorBoundary`, and before `installCrashReporter()` had
 * armed — the black screen with no artefact, every time.
 *
 * `package.json` had `expo-web-browser@^56.0.5` in an SDK 54 app (SDK 54 ships
 * `~15.0.11`), so the JS half was 41 majors ahead of the native half that
 * autolinking actually built. The version is corrected, but a correct version
 * only makes the lookup succeed today. The rule in LAUNCH_SAFETY_REFERENCE.md
 * §1/§2 is that nothing on the launch path may reach a native module at module
 * scope AT ALL, and a static `import` of a package that does hands that
 * decision to the package.
 *
 * AND THAT WAS STILL NOT ENOUGH ON ANDROID (§13).
 *
 * The lazy import fixed iOS, where the failure was a JavaScript throw. Android
 * kept crashing, because there the failure is not in JavaScript at all: Expo
 * registers `WebBrowserModule` during `ReactInstance.<init>`, before any JS
 * runs, and the 56.x module Rork's builder keeps installing dies there looking
 * for a class the SDK 54 core does not have. No import discipline in this file
 * can reach a crash that happens before the bundle is evaluated.
 *
 * So `expo-web-browser` is now excluded from Android autolinking entirely, and
 * every use of it goes through `lib/authBrowser.ts`, which asks whether the
 * native module exists and picks the in-app sheet or the system browser
 * accordingly. Nothing in this file imports `expo-web-browser` any more, on
 * any platform. See `lib/authBrowser.ts` for the full account.
 */

import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { loadWebBrowser, openAuthSession } from "@/lib/authBrowser";
import { parseAuthCallback } from "@/lib/authCallback";
import { createAppLink } from "@/lib/deepLink";
import { withTimeout } from "@/lib/promiseTimeout";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export type SocialProvider = "google" | "apple";

/**
 * How long to wait for a network call *after* the browser has already
 * handed control back to the app — never for the browser step itself, which
 * is bounded by the driver's own pace, not a clock. See `lib/promiseTimeout.ts`.
 */
export const AUTH_NETWORK_TIMEOUT_MS = 15000;

let cachedRedirectTo: string | null = null;

/**
 * The OAuth callback URL, resolved on first use and reused after that.
 *
 * Deferred rather than computed at import, and cached rather than recomputed,
 * so the two round-trips of one sign-in always agree on the same redirect —
 * Supabase matches the callback against the URL the flow started with.
 */
function getRedirectTo(): string {
  if (cachedRedirectTo === null) {
    cachedRedirectTo = createAppLink("auth-callback");
  }
  return cachedRedirectTo;
}

/**
 * Closes a lingering auth popup on web. A no-op on iOS and Android, called
 * from the sign-in path instead of at import time.
 */
function completeAnyPendingAuthSession(): void {
  if (Platform.OS !== "web") return;
  try {
    loadWebBrowser()?.maybeCompleteAuthSession();
  } catch (err) {
    console.warn("[Auth] maybeCompleteAuthSession failed:", err);
  }
}

export async function signInWithSocialProvider(provider: SocialProvider): Promise<Session | null> {
  completeAnyPendingAuthSession();

  if (provider === "apple") {
    return signInWithAppleNative();
  }

  return signInWithGoogleOAuth();
}

async function signInWithAppleNative(): Promise<Session | null> {
  console.log("[Auth] Starting Apple NATIVE sign in...");

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple sign-in did not return an identity token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) throw error;

  console.log("[Auth] Apple NATIVE sign in succeeded.");

  return data.session ?? null;
}

/**
 * Thrown when the browser sheet closed without ever handing us a callback.
 *
 * Worth its own message because the cause is almost never in this repo: the
 * sheet lands on the Supabase project's **Site URL** — `http://localhost:3000`
 * in a project nobody has reconfigured since the web prototype — whenever
 * `myapp://auth-callback` is missing from Authentication → URL Configuration →
 * Redirect URLs. GoTrue does not reject an unlisted `redirect_to`; it silently
 * substitutes the Site URL, so the user watches the picker succeed and then
 * gets "Safari cannot open the page because it could not connect to the
 * server", on a host that only ever existed on a developer's laptop. From the
 * app's side that is indistinguishable from a cancel, so it has to be said out
 * loud rather than inferred. See `GOOGLE_SIGNIN_REFERENCE.md`.
 */
const NO_CALLBACK_MESSAGE =
  "Google sign-in did not return to the app. If the browser showed a " +
  "localhost page, this app's redirect URL is not on the Supabase project's " +
  "allow-list yet.";

async function signInWithGoogleOAuth(): Promise<Session | null> {
  const redirectTo = getRedirectTo();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== "web",
      queryParams: {
        // Ask Google for the account chooser every time. The auth session
        // shares Safari's cookie jar, so a phone already signed in to Google
        // otherwise gets bounced straight through the picker it expected to
        // see — which makes a failure further down the redirect chain look
        // like "it never even asked which account I wanted".
        prompt: "select_account",
      },
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No OAuth URL returned from Supabase.");

  if (Platform.OS === "web") {
    // On web, Supabase handles the redirect to the provider directly.
    return null;
  }

  // `lib/authBrowser.ts` picks the transport: the in-app sheet where
  // `expo-web-browser`'s native module is linked (iOS), the system browser
  // plus the `myapp://` deep link where it is not (Android, where the module
  // is excluded from autolinking — see that file's header for why).
  const result = await openAuthSession(data.url, redirectTo);

  // The user backed out. Not an error — return null and let the caller leave
  // the screen as it was, with nothing shown.
  if (result.type === "cancel") {
    return null;
  }

  if (!result.url) {
    throw new Error(NO_CALLBACK_MESSAGE);
  }

  const callback = parseAuthCallback(result.url);

  switch (callback.kind) {
    case "code": {
      // The browser hands control back to the app right as its network
      // state is least settled (backgrounded, radio reclaimed, wifi/cellular
      // handoff) — exactly when a stalled fetch with no server-side timeout
      // is most likely. Without this cap a stall here leaves `loading` true
      // forever and the app sits on the splash — see `lib/promiseTimeout.ts`.
      const { data: sessionData, error: exchangeErr } = await withTimeout(
        supabase.auth.exchangeCodeForSession(callback.code),
        AUTH_NETWORK_TIMEOUT_MS,
        "Signing in is taking too long. Check your connection and try again."
      );
      if (exchangeErr) throw exchangeErr;
      return sessionData.session ?? null;
    }

    case "tokens": {
      // The implicit flow's shape. `lib/supabase.ts` pins `flowType: 'pkce'`
      // so this should not happen — but a session handed back in a form we can
      // use is worth using rather than discarding on principle.
      const { data: sessionData, error: setErr } = await withTimeout(
        supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        }),
        AUTH_NETWORK_TIMEOUT_MS,
        "Signing in is taking too long. Check your connection and try again."
      );
      if (setErr) throw setErr;
      return sessionData.session ?? null;
    }

    case "error":
      throw new Error(callback.message);

    case "none":
      throw new Error(NO_CALLBACK_MESSAGE);
  }
}
