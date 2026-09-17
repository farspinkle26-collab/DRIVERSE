/**
 * Driveverse — keeping the screen on while a driver is actively navigating
 * or recording a trip.
 *
 * WHY A LAZY REQUIRE, NOT A STATIC IMPORT
 *   Same reasoning as `lib/storeReview.ts`: `expo-keep-awake`'s native entry
 *   is `requireNativeModule('ExpoKeepAwake')` at module scope — a lookup
 *   that THROWS if the native module is not linked, run the moment the
 *   module is imported, not when a function is called. It ships bundled
 *   with the Expo SDK itself, so the native half is always present in a
 *   build of this app, but `LAUNCH_SAFETY_REFERENCE.md`'s rule is "no
 *   native call at module scope on anything reachable from
 *   `app/_layout.tsx`," with no carve-out for a package that's "supposed
 *   to" always be linked — that exact assumption is what broke on
 *   `expo-web-browser` (§10). Lazy, memoized, try/catch — the same shape
 *   `lib/shareCard.ts` and `lib/storeReview.ts` already use.
 *
 * WHY THIS NEVER THROWS AND NEVER BLOCKS
 *   A driver's screen turning off because this module failed to load is a
 *   minor inconvenience; a driver's app crashing because it didn't is not a
 *   trade worth making for a nice-to-have.
 */

/** One tag for this app's single use of the feature — see the header. */
const TAG = "driverse-driving";

type KeepAwakeModule = {
  activateKeepAwakeAsync: (tag?: string) => Promise<void>;
  deactivateKeepAwake: (tag?: string) => Promise<void>;
};

let resolved = false;
let keepAwakeModule: KeepAwakeModule | null = null;

function getKeepAwakeModule(): KeepAwakeModule | null {
  if (resolved) return keepAwakeModule;
  resolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-keep-awake");
    keepAwakeModule =
      typeof mod?.activateKeepAwakeAsync === "function" &&
      typeof mod?.deactivateKeepAwake === "function"
        ? (mod as KeepAwakeModule)
        : null;
  } catch {
    keepAwakeModule = null;
  }
  return keepAwakeModule;
}

/**
 * Prevents the screen from sleeping. Safe to call repeatedly or on a
 * platform/build without the module — a no-op either way.
 */
export function keepScreenAwake(): void {
  const mod = getKeepAwakeModule();
  if (!mod) return;
  mod.activateKeepAwakeAsync(TAG).catch(() => {});
}

/** Lets the screen sleep again on its normal timeout. */
export function allowScreenSleep(): void {
  const mod = getKeepAwakeModule();
  if (!mod) return;
  mod.deactivateKeepAwake(TAG).catch(() => {});
}
