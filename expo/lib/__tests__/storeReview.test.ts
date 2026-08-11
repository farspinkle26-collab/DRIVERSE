/**
 * Only the pure half — `isOnboardingReviewPrompt`. `requestStoreReview`
 * lazily requires a native module and is exercised on device instead (see
 * the module header for why it can't be a static import in the first
 * place, which is also why it can't be jest.mock'd cleanly here).
 */
import { isOnboardingReviewPrompt } from "@/lib/storeReview";

describe("isOnboardingReviewPrompt", () => {
  it("fires on the midpoint of customize-profile's real 6-step flow", () => {
    // STEPS = ["welcome", "benefits", "photo", "nation", "car", "identity"]
    // — the prompt fires advancing from "photo" (index 2) into "nation"
    // (index 3), i.e. once the driver is halfway and has entered something.
    expect(isOnboardingReviewPrompt(3, 6)).toBe(true);
    [0, 1, 2, 4, 5].forEach((i) =>
      expect(isOnboardingReviewPrompt(i, 6)).toBe(false)
    );
  });

  it("tracks the flow's length rather than a hardcoded step", () => {
    // The whole point of deriving from STEPS.length: the two value screens
    // were added later, and the prompt moved with them instead of staying
    // pinned to what used to be the middle.
    expect(isOnboardingReviewPrompt(2, 4)).toBe(true);
    expect(isOnboardingReviewPrompt(2, 6)).toBe(false);
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
