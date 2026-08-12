import {
  CUSTOM_PLACE_CATEGORY,
  generateCustomPlaceId,
  savedPlaceLabel,
} from "@/lib/savedPlaceDisplay";

describe("generateCustomPlaceId", () => {
  it("is prefixed so a saved_places row is recognisable as a territory pin", () => {
    expect(generateCustomPlaceId()).toMatch(/^custom-\d+-[a-z0-9]+$/);
  });

  it("never collides across consecutive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCustomPlaceId()));
    expect(ids.size).toBe(50);
  });
});

describe("savedPlaceLabel", () => {
  it("labels a territory pin distinctly from every provider category", () => {
    expect(savedPlaceLabel(CUSTOM_PLACE_CATEGORY)).toBe("My place");
  });

  it("falls back to the shared category label for a provider bookmark", () => {
    expect(savedPlaceLabel("cafe")).toBe("Cafe");
    expect(savedPlaceLabel("ev_charger")).toBe("Charging");
  });
});
