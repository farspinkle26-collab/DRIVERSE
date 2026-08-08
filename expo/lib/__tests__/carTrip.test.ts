import {
  carActions,
  carDisplayModel,
  fixStaleness,
  shouldHoldNavigationFocus,
  LOST_FIX_MS,
  STALE_FIX_MS,
  type CarTripState,
} from "../carTrip";

/**
 * These tests are the only verification the car display's rules can get in CI:
 * there is no Android SDK, no DHU and no head unit on this machine, so the
 * Kotlin that consumes this model cannot be compiled or run here. What CAN be
 * pinned is that the model never hands the car something it must not show, and
 * never presents a dead GPS fix as a live one.
 */

const NOW = 1_700_000_000_000;

function state(over: Partial<CarTripState> = {}): CarTripState {
  return {
    recording: "recording",
    distanceMeters: 12_400,
    elapsedMs: 900_000,
    lastFixAt: NOW - 1000,
    route: null,
    ...over,
  };
}

describe("fixStaleness", () => {
  it("treats a recent fix as fresh", () => {
    expect(fixStaleness(NOW - 1000, NOW)).toBe("fresh");
  });

  it("goes stale at the threshold, not after it", () => {
    expect(fixStaleness(NOW - STALE_FIX_MS, NOW)).toBe("stale");
    expect(fixStaleness(NOW - (STALE_FIX_MS - 1), NOW)).toBe("fresh");
  });

  it("goes lost at the threshold, not after it", () => {
    expect(fixStaleness(NOW - LOST_FIX_MS, NOW)).toBe("lost");
    expect(fixStaleness(NOW - (LOST_FIX_MS - 1), NOW)).toBe("stale");
  });

  it("reports lost when no fix has ever arrived", () => {
    // Not "fresh". A screen that has never had a position must not claim one.
    expect(fixStaleness(null, NOW)).toBe("lost");
  });

  it("does not report lost for a fix stamped in the future", () => {
    // A clock that jumped (NTP, a timezone change mid-drive) must not read as
    // a GPS failure on a device whose GPS is fine.
    expect(fixStaleness(NOW + 5000, NOW)).toBe("fresh");
  });
});

describe("carActions", () => {
  it("offers only Start when idle", () => {
    expect(carActions("idle")).toEqual(["start"]);
  });

  it("offers Pause and End while recording", () => {
    expect(carActions("recording")).toEqual(["pause", "end"]);
  });

  it("offers Resume and End while paused", () => {
    expect(carActions("paused")).toEqual(["resume", "end"]);
  });

  it("never exceeds the action strip's limit", () => {
    // NavigationTemplate's ActionStrip caps at four, app icon included.
    for (const s of ["idle", "recording", "paused"] as const) {
      expect(carActions(s).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("carDisplayModel", () => {
  it("shows distance and time on a free drive", () => {
    const model = carDisplayModel(state(), NOW);
    expect(model.readout).toEqual({
      kind: "free",
      distanceMeters: 12_400,
      elapsedMs: 900_000,
    });
    expect(model.routing).toBeNull();
    expect(model.message).toBe("Recording drive");
  });

  it("never puts routing and message on the template at once", () => {
    // NavigationTemplate rejects both being set; this is a car-side crash, not
    // a layout quirk, so it is pinned across every reachable state.
    const cases: CarTripState[] = [
      state({ recording: "idle" }),
      state({ recording: "paused" }),
      state(),
      state({ lastFixAt: NOW - LOST_FIX_MS }),
      state({
        route: {
          instruction: "Turn right onto Jalan Sudirman",
          maneuverType: "turn",
          maneuverModifier: "right",
          distanceToManeuverMeters: 200,
          remainingMeters: 5000,
          remainingSeconds: 600,
        },
      }),
    ];
    for (const s of cases) {
      const model = carDisplayModel(s, NOW);
      expect(model.routing != null && model.message != null).toBe(false);
    }
  });

  it("shows the maneuver and an ETA when a destination is set", () => {
    const model = carDisplayModel(
      state({
        route: {
          instruction: "Turn right onto Jalan Sudirman",
          maneuverType: "turn",
          maneuverModifier: "right",
          distanceToManeuverMeters: 200,
          remainingMeters: 5000,
          remainingSeconds: 600,
          destinationName: "Puncak Pass",
        },
      }),
      NOW
    );
    expect(model.routing?.instruction).toBe("Turn right onto Jalan Sudirman");
    expect(model.readout).toEqual({
      kind: "route",
      remainingMeters: 5000,
      remainingSeconds: 600,
      destinationName: "Puncak Pass",
    });
  });

  it("drops the maneuver card and the numbers when the fix is lost", () => {
    // The failure this pins: a tunnel or a dead radio leaves `distanceMeters`
    // frozen, and a frozen number on a car screen is indistinguishable from a
    // working one. It must be replaced, not merely annotated.
    const model = carDisplayModel(
      state({
        lastFixAt: NOW - LOST_FIX_MS,
        route: {
          instruction: "Turn right",
          maneuverType: "turn",
          maneuverModifier: "right",
          distanceToManeuverMeters: 200,
          remainingMeters: 5000,
          remainingSeconds: 600,
        },
      }),
      NOW
    );
    expect(model.routing).toBeNull();
    expect(model.readout).toBeNull();
    expect(model.message).toBe("Waiting for GPS");
    expect(model.staleness).toBe("lost");
  });

  it("keeps showing the drive while merely stale", () => {
    // Twenty seconds without a fix is a lag, not an interruption. Blanking the
    // screen at every traffic light would be its own kind of wrong.
    const model = carDisplayModel(state({ lastFixAt: NOW - STALE_FIX_MS }), NOW);
    expect(model.staleness).toBe("stale");
    expect(model.readout).not.toBeNull();
  });

  it("keeps the totals visible while paused", () => {
    const model = carDisplayModel(state({ recording: "paused" }), NOW);
    expect(model.message).toBe("Drive paused");
    expect(model.readout).toEqual({
      kind: "free",
      distanceMeters: 12_400,
      elapsedMs: 900_000,
    });
  });

  it("says nothing numeric while idle", () => {
    const model = carDisplayModel(
      state({ recording: "idle", distanceMeters: 0, elapsedMs: 0 }),
      NOW
    );
    expect(model.readout).toBeNull();
    expect(model.actions).toEqual(["start"]);
  });

  it("exposes no speed or XP field anywhere in the model", () => {
    // The rule from this module's header, pinned structurally rather than by
    // review: if a `speed`/`xp` key ever appears in the model it lands here.
    const model = carDisplayModel(
      state({
        route: {
          instruction: "Turn right",
          maneuverType: "turn",
          distanceToManeuverMeters: 200,
          remainingMeters: 5000,
          remainingSeconds: 600,
        },
      }),
      NOW
    );
    const serialised = JSON.stringify(model).toLowerCase();
    expect(serialised).not.toContain("speed");
    expect(serialised).not.toContain("xp");
  });
});

describe("shouldHoldNavigationFocus", () => {
  it("holds focus only while actively recording", () => {
    expect(shouldHoldNavigationFocus(state())).toBe(true);
    // A paused drive is not navigating. Holding the host's navigation focus
    // while parked at a petrol station is what gets an app flagged.
    expect(shouldHoldNavigationFocus(state({ recording: "paused" }))).toBe(false);
    expect(shouldHoldNavigationFocus(state({ recording: "idle" }))).toBe(false);
  });
});
