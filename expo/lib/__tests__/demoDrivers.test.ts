import {
  DEMO_DRIVERS_ENABLED,
  demoDrivers,
  withDemoDrivers,
} from "@/lib/demoDrivers";
import type { OnlineUser } from "@/hooks/onlineUsersMerge";

const CENTRE = { latitude: -6.3019, longitude: 106.6528 }; // BSD, roughly

const real: OnlineUser[] = [
  {
    user_id: "real-1",
    name: "Someone",
    level: 5,
    latitude: CENTRE.latitude,
    longitude: CENTRE.longitude,
    heading: 0,
    updated_at: new Date().toISOString(),
  },
];

/**
 * The flag is deliberately ON — this build is for promo capture. The test
 * records that fact rather than enforcing a value, so the state is visible in
 * the run output instead of buried in a constant. When the capture is done
 * and the flag goes back to false, this flips to `toBe(false)` or the whole
 * module gets deleted.
 */
describe("the demo layer's switch", () => {
  it("is currently ON — turn it off before a store upload", () => {
    expect(DEMO_DRIVERS_ENABLED).toBe(true);
  });

  it("adds the cast to whatever the map already had", () => {
    const out = withDemoDrivers(real, CENTRE);
    expect(out.length).toBeGreaterThan(real.length);
    expect(out[0]).toBe(real[0]);
  });

  it("works from an empty list, which is the visibility-off case", () => {
    // The bug the first version had: no real drivers and no presence
    // broadcast still has to produce a populated map.
    expect(withDemoDrivers([], CENTRE).length).toBeGreaterThan(0);
  });

  it("is a no-op with no centre", () => {
    expect(withDemoDrivers(real, null)).toBe(real);
    expect(withDemoDrivers(real, undefined)).toBe(real);
  });
});

describe("demoDrivers", () => {
  it("produces a stable cast", () => {
    const a = demoDrivers(CENTRE, 1_000_000);
    const b = demoDrivers(CENTRE, 1_000_000);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("gives every driver a namespaced id, a name and a plausible level", () => {
    for (const d of demoDrivers(CENTRE, 1_000_000)) {
      expect(d.user_id).toMatch(/^demo-driver-\d+$/);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.level).toBeGreaterThan(0);
      expect(d.level).toBeLessThan(100);
    }
  });

  it("carries no avatar, so no real face is used", () => {
    for (const d of demoDrivers(CENTRE, 1_000_000)) {
      expect(d.avatar).toBeUndefined();
    }
  });

  it("raises no problem signals — a fake SOS is not a prop", () => {
    for (const d of demoDrivers(CENTRE, 1_000_000)) {
      expect(d.problem).toBeNull();
    }
  });

  it("keeps ids unique", () => {
    const ids = demoDrivers(CENTRE, 1_000_000).map((d) => d.user_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays within a couple of kilometres of the centre", () => {
    // Sampled across time, because the worst case is at some phase of the
    // wander, not at t=0.
    for (let t = 0; t < 600; t += 7) {
      for (const d of demoDrivers(CENTRE, t * 1000)) {
        expect(Math.abs(d.latitude - CENTRE.latitude)).toBeLessThan(0.03);
        expect(Math.abs(d.longitude - CENTRE.longitude)).toBeLessThan(0.03);
      }
    }
  });

  it("actually moves between ticks", () => {
    const a = demoDrivers(CENTRE, 1_000_000);
    const b = demoDrivers(CENTRE, 1_000_000 + 5000);
    const moved = a.filter((d, i) => d.latitude !== b[i].latitude);
    expect(moved.length).toBe(a.length);
  });

  it("moves at a believable pace rather than teleporting", () => {
    const a = demoDrivers(CENTRE, 2_000_000);
    const b = demoDrivers(CENTRE, 2_000_000 + 1000);
    for (let i = 0; i < a.length; i++) {
      const dNorth = (b[i].latitude - a[i].latitude) * 111_320;
      const dEast =
        (b[i].longitude - a[i].longitude) *
        111_320 *
        Math.cos((CENTRE.latitude * Math.PI) / 180);
      const metresPerSecond = Math.hypot(dNorth, dEast);
      // Comfortably under motorway speed, and not parked.
      expect(metresPerSecond).toBeLessThan(40);
      expect(metresPerSecond).toBeGreaterThan(0);
    }
  });

  it("reports a heading in range", () => {
    for (const d of demoDrivers(CENTRE, 1_234_567)) {
      expect(d.heading).toBeGreaterThanOrEqual(0);
      expect(d.heading).toBeLessThan(360);
    }
  });

  it("timestamps as now, so the staleness rule keeps them on the map", () => {
    const now = Date.now();
    for (const d of demoDrivers(CENTRE, now)) {
      expect(Date.parse(d.updated_at)).toBe(now);
    }
  });

  it("handles a centre near the poles without exploding the longitude", () => {
    for (const d of demoDrivers({ latitude: 89.999, longitude: 10 }, 500_000)) {
      expect(Number.isFinite(d.latitude)).toBe(true);
      expect(Number.isFinite(d.longitude)).toBe(true);
    }
  });
});
