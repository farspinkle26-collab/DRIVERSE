/**
 * The map screen's connection to the native trip recorder.
 *
 * WHAT THIS CHANGES ABOUT THE MAP SCREEN
 *
 * Before Android Auto, `app/(tabs)/map.tsx` both produced and owned the drive:
 * its `watchPositionAsync` callback accumulated distance, speed and the path in
 * React state. With a car display in the picture that stops being tenable — the
 * host can start the car app with the phone screen unmounted or the app never
 * opened — so `TripRecorderService` produces the drive and the map screen
 * becomes one of two subscribers to it.
 *
 * This hook is that subscription. It deliberately does NOT replace the screen's
 * own recorder: on iOS, on web, and on any Android build predating the config
 * plugin, `isNativeRecorderAvailable()` is false and the screen keeps doing
 * exactly what it does today. CarPlay is out of scope, so iOS has no native
 * half to fall back to, and removing the JS path would take iOS trip recording
 * with it.
 *
 * So there are two modes, and `active` is which one you are in:
 *
 *   active === true   the service owns distance and elapsed time; the screen
 *                     mirrors them and must not accumulate its own.
 *   active === false  nothing changed; the screen's own recorder is the drive.
 *
 * WHY THE CAR COMMANDS MATTER AS MUCH AS THE STATE
 *
 * The driver can end a drive on the head unit with the phone in their pocket.
 * Nothing about that reaches React on its own, so without `onCarCommand` the
 * phone sits on a recording HUD for a drive that has already finished and will
 * never be saved. That is the specific bug this half of the hook prevents.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNativeTripState,
  isNativeRecorderAvailable,
  pauseNativeTrip,
  resumeNativeTrip,
  setNativeRoute,
  startNativeTrip,
  stopNativeTrip,
  subscribeToCarCommands,
  subscribeToTrip,
  type NativeTripResult,
  type NativeTripState,
} from "@/lib/tripRecorder";
import type { CarRoute } from "@/lib/carTrip";
import type { DirectionsStep } from "@/lib/mapboxApi";

export type CarCommand = "start" | "pause" | "resume" | "end";

type Options = {
  /**
   * Called when the driver presses something on the car display.
   *
   * The screen should treat this exactly as if the equivalent button had been
   * pressed on the phone — the drive has already started or stopped in the
   * service by the time this arrives; this is the phone catching up, not the
   * phone deciding.
   */
  onCarCommand?: (command: CarCommand) => void;
};

export type NativeTripBinding = {
  /** Whether the service is the source of truth on this build. */
  active: boolean;
  /** The latest snapshot, or null before the first update. */
  state: NativeTripState | null;
  start: () => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  stop: () => Promise<NativeTripResult | null>;
  /** Publishes the destination route to the car, or clears it with null. */
  publishRoute: (route: CarRoute | null) => Promise<boolean>;
};

export function useNativeTrip(options: Options = {}): NativeTripBinding {
  // Read once, into state rather than recomputed per render: the answer cannot
  // change during a process, and `isNativeRecorderAvailable` touches
  // `NativeModules`, which is not something to do on every render of the app's
  // busiest screen.
  const [active] = useState(() => isNativeRecorderAvailable());
  const [state, setState] = useState<NativeTripState | null>(null);

  // Held in a ref so the subscription effect does not tear down and rebuild
  // every time the screen re-renders with a new closure — which, on the map
  // screen, is several times a second while recording.
  const onCarCommandRef = useRef(options.onCarCommand);
  useEffect(() => {
    onCarCommandRef.current = options.onCarCommand;
  }, [options.onCarCommand]);

  useEffect(() => {
    if (!active) return;

    // Ask for the current state immediately rather than waiting for the next
    // 1 Hz tick. The case this covers is the important one: the app opening
    // during a drive that the car started, where waiting means a second of the
    // screen claiming nothing is happening.
    let cancelled = false;
    void getNativeTripState().then((initial) => {
      if (!cancelled && initial) setState(initial);
    });

    const unsubscribeState = subscribeToTrip((next) => setState(next));
    const unsubscribeCommands = subscribeToCarCommands(({ action }) => {
      if (
        action === "start" ||
        action === "pause" ||
        action === "resume" ||
        action === "end"
      ) {
        onCarCommandRef.current?.(action);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribeCommands();
    };
  }, [active]);

  const publishRoute = useCallback(
    (route: CarRoute | null) => setNativeRoute(route),
    []
  );

  return {
    active,
    state,
    start: startNativeTrip,
    pause: pauseNativeTrip,
    resume: resumeNativeTrip,
    stop: stopNativeTrip,
    publishRoute,
  };
}

/**
 * Turns the phone's directions result into what the car screen needs.
 *
 * Pure, and exported separately from the hook so it can be tested without a
 * native module. The shape difference is the point: the phone's route is a
 * whole list of steps plus a geometry it draws, and the car needs the same
 * steps but keyed for `TripGeo.currentStepIndex` to walk through as the driver
 * moves.
 *
 * Returns null when there is nothing worth publishing, so a caller can pass the
 * result straight to `publishRoute` and have "no route" clear the car screen.
 */
export function carRouteFromDirections(
  steps: DirectionsStep[] | null | undefined,
  totals: { distanceMeters: number; durationSeconds: number } | null | undefined,
  destinationName?: string
): (CarRoute & { steps: DirectionsStep[] }) | null {
  if (!steps || steps.length === 0 || !totals) return null;

  const first = steps[0];
  return {
    instruction: first.instruction,
    maneuverType: first.maneuverType,
    maneuverModifier: first.maneuverModifier,
    distanceToManeuverMeters: first.distanceMeters,
    remainingMeters: totals.distanceMeters,
    remainingSeconds: totals.durationSeconds,
    destinationName,
    // The native side reads `steps` off the same object. Carried alongside the
    // summary fields rather than replacing them so that `CarRoute` stays the
    // one type both sides of the bridge agree on.
    steps,
  };
}
