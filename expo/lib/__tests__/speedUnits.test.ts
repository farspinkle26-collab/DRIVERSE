import {
  convertSpeed,
  kmhToMph,
  mphToKmh,
  speedUnitForCountry,
  speedUnitLabel,
} from "@/lib/speedUnits";

describe("speedUnitForCountry", () => {
  it("returns mph for the United States", () => {
    expect(speedUnitForCountry("United States")).toBe("mph");
  });

  it("returns mph for the United Kingdom", () => {
    expect(speedUnitForCountry("United Kingdom")).toBe("mph");
  });

  it("returns mph for Myanmar", () => {
    expect(speedUnitForCountry("Myanmar")).toBe("mph");
  });

  it("returns kmh for every other onboarding nation", () => {
    for (const name of ["Indonesia", "Malaysia", "Japan", "Germany", "Canada", "Brazil"]) {
      expect(speedUnitForCountry(name)).toBe("kmh");
    }
  });

  it("defaults to kmh for a missing country rather than guessing", () => {
    expect(speedUnitForCountry(null)).toBe("kmh");
    expect(speedUnitForCountry(undefined)).toBe("kmh");
    expect(speedUnitForCountry("")).toBe("kmh");
  });

  it("defaults to kmh for a country not in the closed list", () => {
    expect(speedUnitForCountry("Atlantis")).toBe("kmh");
  });

  it("is case- and whitespace-insensitive, matching findCountryByName", () => {
    expect(speedUnitForCountry("  united states  ")).toBe("mph");
  });
});

describe("kmhToMph / mphToKmh", () => {
  it("converts a known value both ways", () => {
    expect(kmhToMph(100)).toBeCloseTo(62.1371, 3);
    expect(mphToKmh(62.1371)).toBeCloseTo(100, 3);
  });

  it("round-trips without drift", () => {
    expect(mphToKmh(kmhToMph(87))).toBeCloseTo(87, 6);
  });

  it("zero stays zero", () => {
    expect(kmhToMph(0)).toBe(0);
    expect(mphToKmh(0)).toBe(0);
  });
});

describe("speedUnitLabel", () => {
  it("labels each unit", () => {
    expect(speedUnitLabel("kmh")).toBe("km/h");
    expect(speedUnitLabel("mph")).toBe("mph");
  });
});

describe("convertSpeed", () => {
  it("passes km/h through unchanged for the kmh unit", () => {
    expect(convertSpeed(80, "kmh")).toBe(80);
  });

  it("converts to mph for the mph unit", () => {
    expect(convertSpeed(100, "mph")).toBeCloseTo(62.1371, 3);
  });

  it("clamps a negative reading to zero rather than showing a negative speed", () => {
    expect(convertSpeed(-5, "kmh")).toBe(0);
    expect(convertSpeed(-5, "mph")).toBe(0);
  });

  it("treats a non-finite reading as zero", () => {
    expect(convertSpeed(NaN, "kmh")).toBe(0);
    expect(convertSpeed(Infinity, "mph")).toBe(0);
  });
});
