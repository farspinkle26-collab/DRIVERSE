/**
 * Only the pure half — `isOnboardingReviewPrompt`. `requestStoreReview`
 * lazily requires a native module and is exercised on device instead (see
 * the module header for why it can't be a static import in the first
 * place, which is also why it can't be jest.mock'd cleanly here).
 */
import { isOnboardingReviewPrompt } from "@/lib/storeReview";

describe("isOnboardingReviewPrompt", () => {
  it("fires on the midpoint of customize-profile's real 4-step flow", () => {
    // STEPS = ["photo", "nation", "car", "identity"] — the prompt fires
    // advancing from "nation" (index 1) into "car" (index 2).
    expect(isOnboardingReviewPrompt(2, 4)).toBe(true);
    expect(isOnboardingReviewPrompt(0, 4)).toBe(false);
    expect(isOnboardingReviewPrompt(1, 4)).toBe(false);
    expect(isOnboardingReviewPrompt(3, 4)).toBe(false);
  });

  it("rounds down for an odd step count, landing on a real step", () => {
    expect(isOnboardingReviewPrompt(2, 5)).toBe(true); // floor(5/2) = 2
    expect(isOnboardingReviewPrompt(1, 5)).toBe(false);
    expect(isOnboardingReviewPrompt(3, 5)).toBe(false);
  });

  it("never fires for a degenerate step count", () => {
    expect(isOnboardingReviewPrompt(0, 0)).toBe(false);
    expect(isOnboardingReviewPrompt(0, -1)).toBe(false);
  });

  it("fires exactly once across a full walkthrough of a flow", () => {
    const stepCount = 4;
    const hits = [0, 1, 2, 3].filter((i) => isOnboardingReviewPrompt(i, stepCount));
    expect(hits).toEqual([2]);
  });
});
