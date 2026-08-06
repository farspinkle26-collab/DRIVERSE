import { NativeModules, Platform } from "react-native";

/** The native module rnmapbox itself checks for before it throws. */
function withNativeModule(present: boolean) {
  if (present) {
    (NativeModules as Record<string, unknown>).RNMBXModule = { setAccessToken: jest.fn() };
  } else {
    delete (NativeModules as Record<string, unknown>).RNMBXModule;
  }
}

/**
 * These guard LAUNCH_SAFETY_REFERENCE.md §10/§19 for `@rnmapbox/maps`.
 *
 * That package's entry re-exports `MapView`, `Camera` and `ShapeSource`, each
 * of which statically imports a spec file whose whole body is
 * `TurboModuleRegistry.getEnforcing('RNMBX…')` — a throw at module scope when
 * the native half is absent. §19's finding is that Metro reports such a throw
 * as fatal before any `try/catch` in calling code runs, so the ONLY defence is
 * to not call `require` at all on a platform where the module cannot exist.
 *
 * The mock below therefore throws exactly the way the real package would. A
 * regression that moves the `require` above the `Platform.OS` check — or turns
 * it back into a static import — is what makes this fail here, instead of on a
 * driver's phone with a black screen.
 */

describe("loadMapbox", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.resetModules();
    withNativeModule(true);
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    withNativeModule(false);
  });

  it("returns null on web without ever requiring @rnmapbox/maps", () => {
    jest.doMock("@rnmapbox/maps", () => {
      throw new Error("TurboModuleRegistry.getEnforcing('RNMBXMapViewModule')");
    });
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadMapbox } = require("@/lib/mapboxNative");
    expect(loadMapbox()).toBeNull();
  });

  it("returns null when the native half is not linked, without requiring the package", () => {
    // THE CRASH THIS GUARDS: rnmapbox's own entry throws at module scope when
    // NativeModules.RNMBXModule is absent ("native code not available…"), and
    // §19 means nothing downstream can catch it — the app dies the moment the
    // driver opens the map tab. The mock below throws exactly that way, so a
    // regression that drops the NativeModules check fails here instead.
    withNativeModule(false);
    jest.doMock("@rnmapbox/maps", () => {
      throw new Error("@rnmapbox/maps native code not available.");
    });
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadMapbox } = require("@/lib/mapboxNative");
    expect(loadMapbox()).toBeNull();
  });

  it("requires the package on a native platform once the native half is linked", () => {
    const fakeModule = { setAccessToken: jest.fn() };
    jest.doMock("@rnmapbox/maps", () => ({ __esModule: true, default: fakeModule }));
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadMapbox } = require("@/lib/mapboxNative");
    expect(loadMapbox()).toBe(fakeModule);
  });
});

describe("initMapbox", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.resetModules();
    withNativeModule(true);
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    withNativeModule(false);
  });

  function mockToken(token: string | null) {
    jest.doMock("@/constants/mapbox", () => ({
      MAPBOX_ACCESS_TOKEN: token,
      MAPBOX_CONFIGURED: token !== null,
    }));
  }

  it("sets the access token once, however many screens ask", () => {
    // setAccessToken is a native call; mounting three map screens should not
    // mean three trips across the bridge.
    const setAccessToken = jest.fn();
    mockToken("pk.test-token");
    jest.doMock("@rnmapbox/maps", () => ({ __esModule: true, default: { setAccessToken } }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initMapbox } = require("@/lib/mapboxNative");

    expect(initMapbox()).toBe(true);
    expect(initMapbox()).toBe(true);
    expect(initMapbox()).toBe(true);
    expect(setAccessToken).toHaveBeenCalledTimes(1);
    expect(setAccessToken).toHaveBeenCalledWith("pk.test-token");
  });

  it("reports not-configured instead of calling into native with no token", () => {
    const setAccessToken = jest.fn();
    mockToken(null);
    jest.doMock("@rnmapbox/maps", () => ({ __esModule: true, default: { setAccessToken } }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initMapbox } = require("@/lib/mapboxNative");

    expect(initMapbox()).toBe(false);
    expect(setAccessToken).not.toHaveBeenCalled();
  });

  it("returns false on web rather than throwing", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    mockToken("pk.test-token");
    jest.doMock("@rnmapbox/maps", () => {
      throw new Error("TurboModuleRegistry.getEnforcing('RNMBXMapViewModule')");
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initMapbox } = require("@/lib/mapboxNative");
    expect(initMapbox()).toBe(false);
  });

  it("reports false rather than throwing when setAccessToken itself fails", () => {
    // A map that cannot start is a screen showing a message, not a crash.
    mockToken("pk.test-token");
    jest.doMock("@rnmapbox/maps", () => ({
      __esModule: true,
      default: {
        setAccessToken: () => {
          throw new Error("native not ready");
        },
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initMapbox } = require("@/lib/mapboxNative");
    expect(initMapbox()).toBe(false);
  });
});
