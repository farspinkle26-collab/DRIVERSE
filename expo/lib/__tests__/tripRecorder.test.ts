import { NativeModules, Platform } from "react-native";

/**
 * Two properties are pinned here, and they fail in very different ways.
 *
 * 1. THE LAUNCH-SAFETY ONE. `lib/tripRecorder.ts` must never touch the native
 *    module — including constructing a `NativeEventEmitter` over it — before
 *    it has checked that the module exists, and must never do any of it at
 *    import time. LAUNCH_SAFETY_REFERENCE.md §19: a throw raised while a
 *    module is first evaluated is consumed by Metro and reported as fatal, so
 *    no `try`/`catch` at any call site rescues it. This module is on the
 *    launch path the moment the map screen imports it.
 *
 * 2. THE QUIET ONE. Every command must resolve rather than reject when the
 *    native side is absent. A rejected promise from a button press is an
 *    unhandled rejection in a release build; `lib/crashReporter.ts` would
 *    catch it and show the driver a crash report on next launch for what is
 *    actually the ordinary iOS case.
 */

function setOS(os: string) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

function withNativeModule(mod: Record<string, unknown> | null) {
  if (mod) {
    (NativeModules as Record<string, unknown>).DriverseTripRecorder = mod;
  } else {
    delete (NativeModules as Record<string, unknown>).DriverseTripRecorder;
  }
}

/** A stand-in for the Kotlin module, with the two methods RN's emitter needs. */
function fakeModule(over: Record<string, unknown> = {}) {
  return {
    startTrip: jest.fn().mockResolvedValue(undefined),
    pauseTrip: jest.fn().mockResolvedValue(undefined),
    resumeTrip: jest.fn().mockResolvedValue(undefined),
    stopTrip: jest.fn().mockResolvedValue({
      distanceMeters: 1000,
      durationMs: 60_000,
      startedAt: 1,
      endedAt: 60_001,
      path: [],
    }),
    getState: jest.fn().mockResolvedValue({ recording: "idle" }),
    setRoute: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    ...over,
  };
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.resetModules();
  withNativeModule(null);
  setOS("android");
});

afterEach(() => {
  setOS(originalOS as string);
  withNativeModule(null);
});

describe("availability", () => {
  it("is unavailable on iOS even if a module of that name were registered", () => {
    // CarPlay is out of scope and there is no iOS half of this service. The
    // platform check comes first so iOS never reaches the module at all.
    withNativeModule(fakeModule());
    setOS("ios");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isNativeRecorderAvailable } = require("@/lib/tripRecorder");
    expect(isNativeRecorderAvailable()).toBe(false);
  });

  it("is unavailable on a build that was never prebuilt with the plugin", () => {
    setOS("android");
    withNativeModule(null);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isNativeRecorderAvailable } = require("@/lib/tripRecorder");
    expect(isNativeRecorderAvailable()).toBe(false);
  });

  it("is available on Android once the module is registered", () => {
    withNativeModule(fakeModule());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isNativeRecorderAvailable } = require("@/lib/tripRecorder");
    expect(isNativeRecorderAvailable()).toBe(true);
  });
});

describe("nothing native happens at import time", () => {
  it("importing the module touches no property of the native module", () => {
    // §1/§2: no native call at module scope. The proxy below records every
    // property read, so a regression that builds the emitter (or reads any
    // method) during evaluation shows up as a non-empty list.
    const reads: string[] = [];
    const spy = new Proxy(fakeModule(), {
      get(target, prop) {
        reads.push(String(prop));
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });
    withNativeModule(spy as unknown as Record<string, unknown>);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/lib/tripRecorder");

    expect(reads).toEqual([]);
  });
});

describe("commands degrade instead of rejecting", () => {
  it("resolve falsy when the native module is absent", async () => {
    withNativeModule(null);
    const {
      startNativeTrip,
      pauseNativeTrip,
      resumeNativeTrip,
      stopNativeTrip,
      getNativeTripState,
      setNativeRoute,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("@/lib/tripRecorder");

    await expect(startNativeTrip()).resolves.toBe(false);
    await expect(pauseNativeTrip()).resolves.toBe(false);
    await expect(resumeNativeTrip()).resolves.toBe(false);
    await expect(stopNativeTrip()).resolves.toBeNull();
    await expect(getNativeTripState()).resolves.toBeNull();
    await expect(setNativeRoute(null)).resolves.toBe(false);
  });

  it("resolve falsy when the native side rejects", async () => {
    // The service can refuse — no location permission, or Android killed it.
    // That is a "keep using the JS recorder" signal, not a crash.
    withNativeModule(
      fakeModule({
        startTrip: jest.fn().mockRejectedValue(new Error("permission denied")),
        stopTrip: jest.fn().mockRejectedValue(new Error("not recording")),
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startNativeTrip, stopNativeTrip } = require("@/lib/tripRecorder");

    await expect(startNativeTrip()).resolves.toBe(false);
    await expect(stopNativeTrip()).resolves.toBeNull();
  });

  it("forwards to the native module when it is there", async () => {
    const mod = fakeModule();
    withNativeModule(mod);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startNativeTrip, stopNativeTrip } = require("@/lib/tripRecorder");

    await expect(startNativeTrip()).resolves.toBe(true);
    expect(mod.startTrip).toHaveBeenCalledTimes(1);

    const result = await stopNativeTrip();
    expect(result?.distanceMeters).toBe(1000);
  });
});

describe("subscriptions", () => {
  it("returns a safe unsubscribe when there is nothing to subscribe to", () => {
    withNativeModule(null);
    const {
      subscribeToTrip,
      subscribeToCarCommands,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("@/lib/tripRecorder");

    // A caller must not have to branch on availability just to clean up in an
    // effect's teardown.
    expect(() => subscribeToTrip(() => {})()).not.toThrow();
    expect(() => subscribeToCarCommands(() => {})()).not.toThrow();
  });
});
