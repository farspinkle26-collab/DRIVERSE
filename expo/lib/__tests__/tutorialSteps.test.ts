import {
  TUTORIAL_STEPS,
  paddedRect,
  tooltipTop,
  type Rect,
} from "@/lib/tutorialSteps";

describe("TUTORIAL_STEPS", () => {
  it("starts on welcome and ends on done, both with no spotlight target", () => {
    expect(TUTORIAL_STEPS[0].id).toBe("welcome");
    expect(TUTORIAL_STEPS[0].target).toBeNull();
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].id).toBe("done");
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].target).toBeNull();
  });

  it("spotlights exactly one cluster per real step — a tour, not an inspection", () => {
    const spotlit = TUTORIAL_STEPS.filter((s) => s.target !== null);
    // drive, chrome, social, tabs — one tooltip per cluster.
    expect(spotlit.length).toBe(4);
    expect(new Set(spotlit.map((s) => s.target)).size).toBe(4);
  });

  it("every step has non-empty title and body", () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique step ids", () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the tabs step does not reproduce the steering-wheel confusion it exists to prevent", () => {
    const tabsStep = TUTORIAL_STEPS.find((s) => s.id === "tabs")!;
    expect(tabsStep.body.toLowerCase()).toContain("not a new drive");
  });
});

describe("paddedRect", () => {
  it("grows the rect outward on every side", () => {
    const rect: Rect = { x: 100, y: 200, width: 40, height: 40 };
    expect(paddedRect(rect, 8)).toEqual({ x: 92, y: 192, width: 56, height: 56 });
  });

  it("is a no-op at zero padding", () => {
    const rect: Rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(paddedRect(rect, 0)).toEqual(rect);
  });
});

describe("tooltipTop", () => {
  const SCREEN_H = 800;
  const TOOLTIP_H = 160;
  const SAFE_TOP = 40;
  const SAFE_BOTTOM = 100;

  it("centres when there is no rect (welcome / done, or an unmeasured target)", () => {
    const top = tooltipTop(null, SCREEN_H, TOOLTIP_H, SAFE_TOP, SAFE_BOTTOM);
    expect(top).toBe((SCREEN_H - TOOLTIP_H) / 2);
  });

  it("respects the safe top even when centring would go under it", () => {
    const top = tooltipTop(null, 200, 160, 80, 20);
    expect(top).toBeGreaterThanOrEqual(80);
  });

  it("places below a target near the top of the screen", () => {
    const rect: Rect = { x: 0, y: 100, width: 56, height: 56 };
    const top = tooltipTop(rect, SCREEN_H, TOOLTIP_H, SAFE_TOP, SAFE_BOTTOM);
    expect(top).toBe(rect.y + rect.height + 12);
  });

  it("flips above a target near the bottom of the screen, where below would overflow", () => {
    const rect: Rect = { x: 0, y: 700, width: 56, height: 56 };
    const top = tooltipTop(rect, SCREEN_H, TOOLTIP_H, SAFE_TOP, SAFE_BOTTOM);
    // Below would be 700+56+12=768, +160 tooltip = 928 > 800-100=700 → flips.
    expect(top).toBe(rect.y - 12 - TOOLTIP_H);
    expect(top).toBeLessThan(rect.y);
  });

  it("never places the tooltip above the safe top", () => {
    const rect: Rect = { x: 0, y: 5, width: 56, height: 900 }; // a huge target
    const top = tooltipTop(rect, SCREEN_H, TOOLTIP_H, SAFE_TOP, SAFE_BOTTOM);
    expect(top).toBeGreaterThanOrEqual(SAFE_TOP);
  });

  it("never places the tooltip below the safe bottom", () => {
    const rect: Rect = { x: 0, y: 5, width: 56, height: 900 };
    const top = tooltipTop(rect, SCREEN_H, TOOLTIP_H, SAFE_TOP, SAFE_BOTTOM);
    expect(top + TOOLTIP_H).toBeLessThanOrEqual(SCREEN_H - SAFE_BOTTOM);
  });
});
