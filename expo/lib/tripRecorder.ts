/**
 * The JS side of the native trip recorder.
 *
 * WHY THERE IS A NATIVE RECORDER AT ALL
 *
 * Until Android Auto, trip recording lived entirely in `app/(tabs)/map.tsx`:
 * an `expo-location` `watchPositionAsync` subscription inside a `useEffect`,
 * with distance, elapsed time and the speed profile accumulated in React
 * state. That works exactly as long as the screen is mounted and the app is
 * alive, and Android Auto breaks both assumptions at once — the host can start
 * `DriverseCarAppService` with the phone app backgrounded, its activity
 * destroyed, or never launched this boot. There is no React tree to read state
 * from at that point, and no `watchPositionAsync` running to produce any.
 *
 * So the recorder moved to `TripRecorderService`, an Android foreground
 * service, and became the single source of truth for a drive in progress. The
 * phone UI and the car screen are now two subscribers to the same recording
 * rather than one owner and one mirror. This file is the phone's subscription.
 *
 * HOW IT IS LOADED — LAUNCH_SAFETY_REFERENCE.md §19 AND §20
 *
 * Every native access here goes through `nativeRecorder()`, which reads
 * `NativeModules.DriverseTripRecorder` and returns null when it is absent,
 * BEFORE touching anything on it. That is the same shape as
 * `lib/mapboxNative.ts` and for the same reason: on iOS, on web, and in any
 * checkout that has not been `expo prebuild`-ed since this landed, the module
 * is not registered, and §19 established that a `try`/`catch` cannot rescue a
 * throw raised while a module is first being evaluated — Metro's own loader
 * consumes it and calls `reportFatalError` without rethrowing.
 *
 * There is no `requireNativeModule` and no `getEnforcing` in this file for the
 * same reason. `NativeModules.X` returns `undefined` for an unregistered
 * module instead of throwing, so asking the question is free.
 *
 * WHAT HAPPENS WHEN IT IS ABSENT
 *
 * `isNativeRecorderAvailable()` returns false and the caller keeps its existing
 * JS recording path. That is not a fallback bolted on for tidiness — it is what
 * keeps iOS working unchanged, since CarPlay is explicitly out of scope and
 * there is no iOS half of this service.
 */

import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import type { CarRecordingState, CarRoute } from "@/lib/carTrip";

/** One GPS fix as the native service reports it. */
export type NativeFix = {
  latitude: number;
  longitude: number;
  /** Epoch millis the fix was taken, from the location provider. */
  t: number;
};

/**
 * The recorder's state, as it crosses the bridge.
 *
 * Note what is here that `CarTripState` does not have: `speedKmh`,
 * `topSpeedKmh` and the path. The phone HUD needs all three; the car display is
 * forbidden them (`lib/carTrip.ts`). They are separated at the point the car
 * model is built, not here, because the service genuinely does record them —
 * the drive still ends in a `trips` row with a speed profile.
 */
export type NativeTripState = {
  recording: CarRecordingState;
  distanceMeters: number;
  elapsedMs: number;
  lastFixAt: number | null;
  speedKmh: number;
  topSpeedKmh: number;
  startedAt: number | null;
  /** Fixes since the last update, appended by the subscriber. */
  fixes: NativeFix[];
};

/** The finished drive, returned by `stopTrip`. */
export type NativeTripResult = {
  distanceMeters: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  path: NativeFix[];
};

type RecorderModule = {
  startTrip(): Promise<void>;
  pauseTrip(): Promise<void>;
  resumeTrip(): Promise<void>;
  stopTrip(): Promise<NativeTripResult>;
  getState(): Promise<NativeTripState>;
  /** Publishes the active destination route so the car screen can show it. */
  setRoute(route: CarRoute | null): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
};

/** Event name the service emits state updates on. */
export const TRIP_UPDATE_EVENT = "DriverseTripUpdate";

/**
 * Event the CAR emits when the driver uses a car-screen button.
 *
 * The car can start and end drives with the phone's UI nowhere in sight, so
 * the phone has to learn about it rather than being the one to decide. Without
 * this the driver ends a drive on the head unit, picks up their phone, and
 * finds it still counting.
 */
export const CAR_COMMAND_EVENT = "DriverseCarCommand";

/**
 * The native module, or null where it cannot exist.
 *
 * MUST keep the platform check and the null check BEFORE any property access —
 * see this file's header and LAUNCH_SAFETY_REFERENCE.md §19/§20.
 */
function nativeRecorder(): RecorderModule | null {
  if (Platform.OS !== "android") return null;
  const mod = NativeModules.DriverseTripRecorder;
  if (mod == null) return null;
  return mod as RecorderModule;
}

/**
 * Whether the drive can be recorded natively.
 *
 * False on iOS and web by design, and false on an Android build that predates
 * the config plugin. A caller seeing false should keep its own recorder — it
 * means the car display is not available on this build either, so nothing is
 * being left unrecorded.
 */
export function isNativeRecorderAvailable(): boolean {
  return nativeRecorder() != null;
}

let emitter: NativeEventEmitter | null = null;

function recorderEmitter(): NativeEventEmitter | null {
  const mod = nativeRecorder();
  if (!mod) return null;
  // Constructed lazily and once. `new NativeEventEmitter(module)` reaches the
  // native module, which is exactly what must not happen at import time.
  if (!emitter) emitter = new NativeEventEmitter(mod as never);
  return emitter;
}

/**
 * Subscribe to recorder updates.
 *
 * Returns an unsubscribe function that is safe to call whether or not the
 * native module existed, so a caller never has to branch on availability just
 * to clean up.
 */
export function subscribeToTrip(
  onUpdate: (state: NativeTripState) => void
): () => void {
  const em = recorderEmitter();
  if (!em) return () => {};
  const sub = em.addListener(TRIP_UPDATE_EVENT, onUpdate);
  return () => sub.remove();
}

/** Subscribe to Start/Pause/Resume/End pressed on the car display. */
export function subscribeToCarCommands(
  onCommand: (command: { action: string }) => void
): () => void {
  const em = recorderEmitter();
  if (!em) return () => {};
  const sub = em.addListener(CAR_COMMAND_EVENT, onCommand);
  return () => sub.remove();
}

/*
 * The commands.
 *
 * Each resolves to a boolean rather than throwing when the module is absent, so
 * a caller can treat "there is no native recorder" and "the native recorder
 * refused" the same way: keep using the JS path. None of them reject on a
 * missing module — a promise rejection from a button press is an unhandled
 * rejection in a release build, which the crash reporter would (correctly)
 * capture and show the driver on next launch.
 */

export async function startNativeTrip(): Promise<boolean> {
  const mod = nativeRecorder();
  if (!mod) return false;
  try {
    await mod.startTrip();
    return true;
  } catch {
    return false;
  }
}

export async function pauseNativeTrip(): Promise<boolean> {
  const mod = nativeRecorder();
  if (!mod) return false;
  try {
    await mod.pauseTrip();
    return true;
  } catch {
    return false;
  }
}

export async function resumeNativeTrip(): Promise<boolean> {
  const mod = nativeRecorder();
  if (!mod) return false;
  try {
    await mod.resumeTrip();
    return true;
  } catch {
    return false;
  }
}

/** Ends the drive and returns what was recorded, or null if nothing was. */
export async function stopNativeTrip(): Promise<NativeTripResult | null> {
  const mod = nativeRecorder();
  if (!mod) return null;
  try {
    return await mod.stopTrip();
  } catch {
    return null;
  }
}

/** Reads current state without waiting for the next update tick. */
export async function getNativeTripState(): Promise<NativeTripState | null> {
  const mod = nativeRecorder();
  if (!mod) return null;
  try {
    return await mod.getState();
  } catch {
    return null;
  }
}

/**
 * Publishes the destination route to the car screen, or clears it.
 *
 * The route is computed on the JS side (`lib/mapboxApi.ts` already fetches
 * turn-by-turn steps for the phone's navigation card) and pushed down, rather
 * than being fetched again in Kotlin. Duplicating the directions call would
 * mean two subtly different routes on two screens in the same car.
 */
export async function setNativeRoute(route: CarRoute | null): Promise<boolean> {
  const mod = nativeRecorder();
  if (!mod) return false;
  try {
    await mod.setRoute(route);
    return true;
  } catch {
    return false;
  }
}

/** Test seam — lets a test observe a fresh process. Not for app code. */
export function resetTripRecorderForTests(): void {
  emitter = null;
}
