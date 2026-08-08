/**
 * What the car display is allowed to show, as a pure function of trip state.
 *
 * This file is the scope decision from ANDROID_AUTO_REFERENCE.md §2 written as
 * code, and it is deliberately the narrowest module in the Android Auto work:
 * everything the Kotlin side renders comes through `carDisplayModel`, so the
 * question "could this end up on a screen in front of a moving car?" has one
 * place to be answered instead of being re-decided at every render site.
 *
 * THREE RULES, AND WHY THEY ARE RULES RATHER THAN TASTE
 *
 * 1. NO SPEED, EVER — not current, not average, and above all not top speed.
 *    The phone HUD shows all three (`app/(tabs)/map.tsx`, the DIST/TIME/AVG/MAX
 *    strip). The car must not: the vehicle's own cluster owns current speed and
 *    is legally required to be accurate, and a *personal best* top speed in the
 *    driver's eyeline is an app asking someone to beat it. Google's driver
 *    distraction guidelines for the Navigation category are the reason it would
 *    be rejected; not incentivising speeding is the reason it should not be
 *    built regardless.
 *
 * 2. NO XP, NO QUESTS, NO SCORES. The phone awards XP per kilometre live while
 *    driving. Rewarding distance on the car screen is the same problem as (1)
 *    wearing a friendlier hat, and gamification chrome is explicitly outside
 *    the Navigation template set.
 *
 * 3. A STALE FIX IS SHOWN AS STALE, NEVER AS A FROZEN NUMBER. When GPS drops —
 *    a tunnel, a dead phone radio, the disconnection scenarios in §6 — distance
 *    simply stops advancing. A car screen that keeps displaying `47.2 km` from
 *    four minutes ago is lying to the driver, and it is indistinguishable from
 *    a working screen. `staleness` exists so the Kotlin side can say so.
 *
 * Everything here is pure and synchronous so it can be tested without a car,
 * an emulator, or a device — which, given that none of the three are available
 * to CI, is the only kind of verification this logic can actually get.
 */

/** Fixes older than this are not trusted to describe where the car is now. */
export const STALE_FIX_MS = 20_000;

/** Beyond this the trip is treated as interrupted rather than merely lagging. */
export const LOST_FIX_MS = 90_000;

/** Recorder state, mirrored from the native foreground service. */
export type CarRecordingState = "idle" | "recording" | "paused";

/**
 * The active destination route, when the driver set one.
 *
 * Driverse's common case is a drive with no destination at all — someone going
 * for a drive, not to a place. That case has no ETA and no maneuver, which is
 * why every field here is optional at the call site rather than the model
 * assuming navigation is always happening.
 */
export type CarRoute = {
  /** Human-readable next maneuver, e.g. "Turn right onto Jalan Sudirman". */
  instruction: string;
  /** Mapbox maneuver type, mapped to a `Maneuver` icon on the Kotlin side. */
  maneuverType: string;
  /** Mapbox maneuver modifier ("left", "slight right", …), when present. */
  maneuverModifier?: string;
  /** Metres to the maneuver above. */
  distanceToManeuverMeters: number;
  /** Metres remaining to the destination. */
  remainingMeters: number;
  /** Seconds remaining to the destination. */
  remainingSeconds: number;
  /** Destination label, for the trip's title on the car screen. */
  destinationName?: string;
};

/** Everything the car screen is given about the drive in progress. */
export type CarTripState = {
  recording: CarRecordingState;
  /** Metres accumulated so far this drive. */
  distanceMeters: number;
  /** Milliseconds of *moving* time — pause does not accrue. */
  elapsedMs: number;
  /** `Date.now()` of the most recent accepted GPS fix, or null before the first. */
  lastFixAt: number | null;
  /** The destination route, when one is set. */
  route: CarRoute | null;
};

/** How much to trust `distanceMeters` and the route right now. */
export type CarStaleness = "fresh" | "stale" | "lost";

/**
 * The readout under the maneuver card.
 *
 * `kind: "route"` is genuine navigation and carries an ETA. `kind: "free"` is a
 * drive with no destination, and shows the only two values that are meaningful
 * without one.
 */
export type CarReadout =
  | {
      kind: "route";
      remainingMeters: number;
      remainingSeconds: number;
      destinationName?: string;
    }
  | { kind: "free"; distanceMeters: number; elapsedMs: number };

/** An action offered in the car's `ActionStrip`. */
export type CarAction = "start" | "end" | "pause" | "resume";

/**
 * What the car screen renders.
 *
 * `message` and `routing` are mutually exclusive by construction, because
 * `NavigationTemplate` accepts exactly one of `MessageInfo` and `RoutingInfo`
 * and passing both is a runtime error on the car side rather than a layout
 * quirk.
 */
export type CarDisplayModel = {
  /** Non-null when the template should show a `RoutingInfo` maneuver card. */
  routing: CarRoute | null;
  /** Non-null when the template should show a `MessageInfo` instead. */
  message: string | null;
  /** The stats line. Null while idle, when there is nothing true to say. */
  readout: CarReadout | null;
  /** Buttons, in the order they should appear. */
  actions: CarAction[];
  staleness: CarStaleness;
};

/**
 * How old the last fix is, bucketed.
 *
 * `null` for `lastFixAt` means no fix has ever arrived — treated as `lost`
 * rather than `fresh`, because "we have never known where you are" is the
 * stronger of the two claims, not the weaker one.
 */
export function fixStaleness(
  lastFixAt: number | null,
  now: number
): CarStaleness {
  if (lastFixAt == null) return "lost";
  const age = now - lastFixAt;
  // A fix timestamped in the future is a clock that moved (NTP, timezone,
  // the driver crossing into a new one). Trust it rather than reporting
  // "lost" on a device whose GPS is working perfectly.
  if (age < 0) return "fresh";
  if (age >= LOST_FIX_MS) return "lost";
  if (age >= STALE_FIX_MS) return "stale";
  return "fresh";
}

/**
 * The buttons for a given recorder state.
 *
 * Deliberately short. Four actions is already at the edge of what a driver
 * should be picking between at speed, and `NavigationTemplate`'s action strip
 * caps at four including the app icon.
 */
export function carActions(recording: CarRecordingState): CarAction[] {
  switch (recording) {
    case "idle":
      return ["start"];
    case "recording":
      return ["pause", "end"];
    case "paused":
      return ["resume", "end"];
  }
}

/**
 * The whole car screen, derived.
 *
 * Note what is NOT reachable from here: `CarTripState` has no speed field and
 * no XP field, so rule 1 and rule 2 above are enforced by the type rather than
 * by remembering. Adding either to the state type should be treated as
 * reopening the scope decision, not as a small change.
 */
export function carDisplayModel(
  state: CarTripState,
  now: number
): CarDisplayModel {
  const staleness = fixStaleness(state.lastFixAt, now);
  const actions = carActions(state.recording);

  if (state.recording === "idle") {
    return {
      routing: null,
      message: "Ready to drive",
      readout: null,
      actions,
      staleness,
    };
  }

  if (state.recording === "paused") {
    return {
      routing: null,
      message: "Drive paused",
      readout: {
        kind: "free",
        distanceMeters: state.distanceMeters,
        elapsedMs: state.elapsedMs,
      },
      actions,
      staleness,
    };
  }

  // Recording. A lost fix outranks everything else there is to say: the
  // maneuver card would be describing a position we no longer have, and the
  // distance has silently stopped counting.
  if (staleness === "lost") {
    return {
      routing: null,
      message: "Waiting for GPS",
      readout: null,
      actions,
      staleness,
    };
  }

  if (state.route) {
    return {
      routing: state.route,
      message: null,
      readout: {
        kind: "route",
        remainingMeters: state.route.remainingMeters,
        remainingSeconds: state.route.remainingSeconds,
        destinationName: state.route.destinationName,
      },
      actions,
      staleness,
    };
  }

  // A free drive. `MessageInfo` rather than an empty maneuver card, because
  // there is no next turn to describe and inventing one would be worse.
  return {
    routing: null,
    message: "Recording drive",
    readout: {
      kind: "free",
      distanceMeters: state.distanceMeters,
      elapsedMs: state.elapsedMs,
    },
    actions,
    staleness,
  };
}

/**
 * Whether `NavigationManager.navigationStarted()` should be in effect.
 *
 * The car app must tell the host when it is actively navigating so the host can
 * grant the audio focus for guidance and stop other nav apps — and must call
 * `navigationEnded()` when it is not, or the host eventually stops trusting the
 * app entirely. A *paused* drive is not navigating: the driver has stopped, and
 * holding navigation focus at a petrol station is the behaviour that gets an
 * app flagged.
 */
export function shouldHoldNavigationFocus(state: CarTripState): boolean {
  return state.recording === "recording";
}
