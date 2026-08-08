import { carRouteFromDirections } from "../useNativeTrip";
import type { DirectionsStep } from "@/lib/mapboxApi";

/**
 * Only the pure half is tested here. The hook itself is a subscription to a
 * native module that does not exist on this machine, and mocking it would test
 * the mock — `lib/__tests__/tripRecorder.test.ts` already pins the part that
 * matters about it (that nothing native is touched before it is checked for).
 */

function step(over: Partial<DirectionsStep> = {}): DirectionsStep {
  return {
    instruction: "Turn right onto Jalan Sudirman",
    street: "Jalan Sudirman",
    maneuverType: "turn",
    maneuverModifier: "right",
    distanceMeters: 200,
    durationSeconds: 30,
    latitude: -6.2088,
    longitude: 106.8456,
    ...over,
  };
}

describe("carRouteFromDirections", () => {
  it("takes the first step as the current maneuver", () => {
    const route = carRouteFromDirections(
      [step(), step({ instruction: "Continue straight" })],
      { distanceMeters: 5000, durationSeconds: 600 },
      "Puncak Pass"
    );
    expect(route?.instruction).toBe("Turn right onto Jalan Sudirman");
    expect(route?.distanceToManeuverMeters).toBe(200);
    expect(route?.remainingMeters).toBe(5000);
    expect(route?.destinationName).toBe("Puncak Pass");
  });

  it("carries every step through for the car to walk", () => {
    // The car advances through the steps itself as the driver moves, so
    // dropping the tail would leave it stuck on the first turn for the whole
    // drive.
    const route = carRouteFromDirections(
      [step(), step(), step()],
      { distanceMeters: 5000, durationSeconds: 600 }
    );
    expect(route?.steps).toHaveLength(3);
  });

  it("returns null when there is no route, so the car screen clears", () => {
    expect(
      carRouteFromDirections([], { distanceMeters: 0, durationSeconds: 0 })
    ).toBeNull();
    expect(carRouteFromDirections(null, null)).toBeNull();
    expect(carRouteFromDirections([step()], null)).toBeNull();
    expect(carRouteFromDirections(undefined, undefined)).toBeNull();
  });

  it("keeps an absent maneuver modifier absent", () => {
    // The Kotlin side maps type + modifier onto the car library's flat enum and
    // falls back to a straight arrow. An empty string is not the same as
    // absent there, so it must not be invented here.
    const route = carRouteFromDirections(
      [step({ maneuverModifier: undefined, maneuverType: "depart" })],
      { distanceMeters: 100, durationSeconds: 10 }
    );
    expect(route?.maneuverModifier).toBeUndefined();
    expect(route?.maneuverType).toBe("depart");
  });
});
