/**
 * Driveverse — asking for a Play Store / App Store rating.
 *
 * WHY THE FIRST MILE MILESTONE, NOT ONBOARDING
 *   This used to fire partway through account customization
 *   (`app/customize-profile.tsx`), on the theory that a driver mid-flow is
 *   the one guaranteed moment before they can churn out silently. Apple
 *   rejected the app for it under Guideline 5.6.3: at that point the driver
 *   has entered a photo and a nation and nothing else — no basis to judge
 *   an app they have not used yet.
 *
 *   The prompt now fires once, the first time a driver has completed
 *   `REVIEW_MILESTONE_STEP_COUNT` steps of the First Mile chain
 *   (`constants/mainQuests.ts`) — see `hasReachedReviewMilestone` below and
 *   its call site in `hooks/useMainQuestStore.ts`. Every First Mile step
 *   requires having actually used a real feature (driven, looked at a
 *   finished trip, saved a place, checked a rank, shared a card, and so
 *   on), all of it strictly after onboarding ends, so the milestone cannot
 *   be reached during onboarding, on first launch, or right after install
 *   by construction — there is nothing to gate beyond the step count.
 *
 *   The milestone's own XP reward is granted server-side by the SQL
 *   triggers in `database_migration_main_quests.sql` the instant each step
 *   completes, with no knowledge this prompt exists. This module only ever
 *   asks the OS to show its native sheet in parallel — it does not, and
 *   structurally cannot, condition the reward on the review, since
 *   `SKStoreReviewController` never reports back whether the driver rated
 *   or reviewed anything at all (see `requestStoreReview` below).
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
 * Number of completed First Mile steps at which the milestone trigger fires.
 * Chosen as a genuine handful of real actions: more than the one trip that
 * completes quickest, so the driver has done more than the single easiest
 * thing, but early enough that most drivers who stick around at all reach
 * it. Three of eight steps is comfortably past "just installed."
 */
export const REVIEW_MILESTONE_STEP_COUNT = 3;

/**
 * Whether the driver has reached the milestone this app asks for a rating
 * at — `completedFirstMileSteps` First Mile steps done, out of the chain's
 * eight.
 *
 * Pure and stateless on purpose: it only answers "has the milestone been
 * reached," not "have we already asked." That second half needs persisted,
 * once-per-install state (so a driver who already passed the threshold
 * before this shipped, or who re-opens the app after reaching it, is not
 * asked again and again), which is orchestration rather than policy — see
 * `hooks/useMainQuestStore.ts`, the one call site.
 */
export function hasReachedReviewMilestone(completedFirstMileSteps: number): boolean {
  return completedFirstMileSteps >= REVIEW_MILESTONE_STEP_COUNT;
}
