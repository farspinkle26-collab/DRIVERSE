/**
 * Only the pure half — `hasReachedReviewMilestone`. `requestStoreReview`
 * lazily requires a native module and is exercised on device instead (see
 * the module header for why it can't be a static import in the first
 * place, which is also why it can't be jest.mock'd cleanly here).
 */
import {
  hasReachedReviewMilestone,
  REVIEW_MILESTONE_STEP_COUNT,
} from "@/lib/storeReview";

describe("hasReachedReviewMilestone", () => {
  it("is false below the threshold", () => {
    expect(hasReachedReviewMilestone(0)).toBe(false);
    expect(hasReachedReviewMilestone(1)).toBe(false);
    expect(hasReachedReviewMilestone(REVIEW_MILESTONE_STEP_COUNT - 1)).toBe(false);
  });

  it("is true at and above the threshold", () => {
    expect(hasReachedReviewMilestone(REVIEW_MILESTONE_STEP_COUNT)).toBe(true);
    expect(hasReachedReviewMilestone(REVIEW_MILESTONE_STEP_COUNT + 1)).toBe(true);
    expect(hasReachedReviewMilestone(8)).toBe(true); // the full First Mile chain
  });

  it("the threshold itself is a genuine handful, not the trivial first step", () => {
    // Regression pin: this used to fire mid-onboarding (App Store 5.6.3
    // rejection). One completed step alone must not be enough.
    expect(REVIEW_MILESTONE_STEP_COUNT).toBeGreaterThan(1);
    expect(hasReachedReviewMilestone(1)).toBe(false);
  });
});
