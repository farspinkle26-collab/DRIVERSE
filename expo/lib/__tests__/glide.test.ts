import { clamp01, easeOutCubic, lerp, lerpHeadingDeg, lerpLatLng } from "@/lib/glide";

describe("clamp01", () => {
  it("clamps outside 0..1", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe("easeOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("is ahead of linear partway through — fast start, gentle settle", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("clamps out-of-range input", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("lerp", () => {
  it("interpolates and clamps t", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe("lerpLatLng", () => {
  it("interpolates a normal short hop directly", () => {
    const a = { latitude: -6.2, longitude: 106.8 };
    const b = { latitude: -6.3, longitude: 106.9 };
    const mid = lerpLatLng(a, b, 0.5);
    expect(mid.latitude).toBeCloseTo(-6.25, 5);
    expect(mid.longitude).toBeCloseTo(106.85, 5);
  });

  it("returns the start point at t=0 and the end point at t=1", () => {
    const a = { latitude: 1, longitude: 2 };
    const b = { latitude: 3, longitude: 4 };
    expect(lerpLatLng(a, b, 0)).toEqual(a);
    expect(lerpLatLng(a, b, 1)).toEqual(b);
  });

  it("crosses the antimeridian the short way, not the long way", () => {
    // 179° to -179° is a 2° hop across the ±180° line. A naive lerp would
    // drag it the long way through 0°, landing near 0° at t=0.5 instead of
    // near 180°.
    const a = { latitude: 0, longitude: 179 };
    const b = { latitude: 0, longitude: -179 };
    const mid = lerpLatLng(a, b, 0.5);
    expect(Math.abs(mid.longitude)).toBeGreaterThan(179);
  });

  it("crosses the antimeridian correctly in the other direction", () => {
    const a = { latitude: 0, longitude: -179 };
    const b = { latitude: 0, longitude: 179 };
    const mid = lerpLatLng(a, b, 0.5);
    expect(Math.abs(mid.longitude)).toBeGreaterThan(179);
  });
});

describe("lerpHeadingDeg", () => {
  it("interpolates a normal turn directly", () => {
    expect(lerpHeadingDeg(10, 20, 0.5)).toBeCloseTo(15, 5);
  });

  it("takes the shorter arc across 0/360", () => {
    // 350° -> 10° is a 20° turn forward through 0°, not a 340° turn backward.
    const mid = lerpHeadingDeg(350, 10, 0.5);
    expect(mid).toBeCloseTo(0, 5);
  });

  it("takes the shorter arc the other direction across 0/360", () => {
    const mid = lerpHeadingDeg(10, 350, 0.5);
    expect(mid).toBeCloseTo(0, 5);
  });

  it("reaches the exact target at t=1", () => {
    expect(lerpHeadingDeg(350, 10, 1)).toBeCloseTo(10, 5);
  });
});
