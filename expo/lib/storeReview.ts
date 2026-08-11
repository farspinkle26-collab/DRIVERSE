/**
 * Driveverse — asking for a Play Store / App Store rating.
 *
 * WHY MID-ONBOARDING
 *   The obvious place to ask is after a driver has actually driven —
 *   finished a trip, hit a rank-up — but that is also the place every other
 *   app asks, and it means the review pool is entirely people who stuck
 *   around. Prompting partway through account customization (see
 *   `app/customize-profile.tsx`) catches a driver in the one guaranteed
 *   moment before they can churn out silently: they are still here, they
 *   are already tapping through a flow, and Apple/Google's own review
 *   sheet costs one extra tap they can dismiss without leaving the app.
 *
 * WHY A LAZY REQUIRE, NOT A STATIC IMPORT
 *   `expo-store-review`'s native entry
 *   (`expo-store-review/build/ExpoStoreReview.native.js`) is a single line:
 *   `export default requireNativeModule('ExpoStoreReview')` — a lookup that
 *   THROWS if the native module is not linked, run the moment the module is
 *   imported, not when a function is called. This app has crashed on open
 *   from exactly this shape before (LAUNCH_SAFETY_REFERENCE.md §10,
 *   `expo-web-browser`) — a static import hands the decision to the
 *   package. `getStoreReviewModule` below is the same lazy, memoized,
 *   try/catch load `lib/shareCard.ts` uses for `expo-media-library`, and
 *   `customize-profile.tsx` only ever calls it from inside a button press,
 *   never at module scope.
 *
 * WHY THIS NEVER THROWS AND NEVER BLOCKS
 *   `requestReview()` failing, or the module not being linked, or running on
 *   web, must never be the reason onboarding stalls. Every path here
 *   resolves; nothing propagates.
 */

import { Platform } from "react-native";

type StoreReviewModule = {
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

let resolved = false;
let storeReviewModule: StoreReviewModule | null = null;

function getStoreReviewModule(): StoreReviewModule | null {
  if (resolved) return storeReviewModule;
  resolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-store-review");
    const candidate = (mod?.default ?? mod) as Partial<StoreReviewModule>;
    storeReviewModule =
      typeof candidate?.requestReview === "function" &&
      typeof candidate?.isAvailableAsync === "function"
        ? (candidate as StoreReviewModule)
        : null;
  } catch {
    storeReviewModule = null;
  }
  return storeReviewModule;
}

/**
 * Asks the OS to show its native rating prompt. Best-effort and silent:
 * unavailable on web, on a build with the module unlinked, on iOS
 * distributed through TestFlight, or once the OS's own yearly quota is
 * spent — in every one of those cases this simply does nothing, and the
 * caller does not need to check first.
 */
export async function requestStoreReview(): Promise<void> {
  if (Platform.OS === "web") return;
  const StoreReview = getStoreReviewModule();
  if (!StoreReview) return;
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;
    await StoreReview.requestReview();
  } catch {
    // Never the reason onboarding stalls — see the header.
  }
}

/**
 * Whether advancing to `nextStepIndex` (out of `stepCount` total onboarding
 * steps) is the moment to ask — the midpoint, rounded down, so a 4-step flow
 * asks on the way into step index 2 (the third step) and an odd-length flow
 * still lands on a real step rather than between two.
 *
 * Pure so the boundary is testable without touching the native module or the
 * screen: `customize-profile.tsx`'s own step order is what this depends on,
 * and a change to STEPS should be able to move this on purpose, not by
 * accident.
 */
export function isOnboardingReviewPrompt(
  nextStepIndex: number,
  stepCount: number
): boolean {
  if (stepCount <= 0) return false;
  return nextStepIndex === Math.floor(stepCount / 2);
}
