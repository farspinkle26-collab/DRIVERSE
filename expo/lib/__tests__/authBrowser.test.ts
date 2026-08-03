import {
  openViaSystemBrowser,
  RETURN_GRACE_MS,
  type AuthBrowserDeps,
} from "@/lib/authBrowser";

/**
 * The system-browser fallback is what Android signs in through now that
 * `expo-web-browser` is excluded from its autolinking, so its two outcomes —
 * the callback arriving, and the driver coming back without one — are worth
 * pinning down. The race between them is the whole reason `RETURN_GRACE_MS`
 * exists (see the constant's comment), and it is the thing most likely to be
 * "simplified" later by someone who has not seen it fail.
 */

function makeDeps() {
  let urlHandler: ((e: { url: string }) => void) | undefined;
  let appHandler: ((s: string) => void) | undefined;
  const removed = { url: false, app: false };

  const deps: AuthBrowserDeps = {
    openURL: jest.fn().mockResolvedValue(true),
    addUrlListener: (h) => {
      urlHandler = h;
      return { remove: () => { removed.url = true; } };
    },
    addAppStateListener: (h) => {
      appHandler = h as (s: string) => void;
      return { remove: () => { removed.app = true; } };
    },
  };

  return {
    deps,
    removed,
    emitUrl: (url: string) => urlHandler?.({ url }),
    emitAppState: (s: string) => appHandler?.(s),
  };
}

describe("openViaSystemBrowser", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("opens the auth URL in the system browser", async () => {
    const { deps, emitUrl } = makeDeps();
    const promise = openViaSystemBrowser("https://accounts.google.com/o/oauth2", deps);

    expect(deps.openURL).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2");

    emitUrl("myapp://auth-callback?code=abc");
    await expect(promise).resolves.toEqual({
      type: "success",
      url: "myapp://auth-callback?code=abc",
    });
  });

  it("resolves success when the callback deep link arrives", async () => {
    const { deps, emitUrl } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitUrl("myapp://auth-callback?code=xyz");

    await expect(promise).resolves.toEqual({
      type: "success",
      url: "myapp://auth-callback?code=xyz",
    });
  });

  it("resolves cancel when the app is foregrounded with no callback", async () => {
    const { deps, emitAppState } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitAppState("active");
    jest.advanceTimersByTime(RETURN_GRACE_MS);

    await expect(promise).resolves.toEqual({ type: "cancel" });
  });

  it("does not call it a cancel while still inside the grace period", async () => {
    // The bug this guards: resolving `cancel` the instant the app is
    // foregrounded loses a successful sign-in whenever the deep link lands a
    // few milliseconds after the app-state change.
    const { deps, emitAppState, emitUrl } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitAppState("active");
    jest.advanceTimersByTime(RETURN_GRACE_MS - 1);
    emitUrl("myapp://auth-callback?code=late");
    jest.advanceTimersByTime(RETURN_GRACE_MS);

    await expect(promise).resolves.toEqual({
      type: "success",
      url: "myapp://auth-callback?code=late",
    });
  });

  it("ignores background/inactive transitions", async () => {
    // Going to the browser is itself an app-state change. Treating any
    // transition as a return would cancel the flow before it started.
    const { deps, emitAppState, emitUrl } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitAppState("background");
    emitAppState("inactive");
    jest.advanceTimersByTime(RETURN_GRACE_MS * 3);
    emitUrl("myapp://auth-callback?code=ok");

    await expect(promise).resolves.toEqual({
      type: "success",
      url: "myapp://auth-callback?code=ok",
    });
  });

  it("resolves cancel when the browser refuses to open", async () => {
    const { deps } = makeDeps();
    (deps.openURL as jest.Mock).mockRejectedValue(new Error("no handler"));

    await expect(openViaSystemBrowser("https://auth", deps)).resolves.toEqual({
      type: "cancel",
    });
  });

  it("removes both listeners once settled", async () => {
    // These outlive the promise otherwise, and a stale url listener would
    // resolve a sign-in that is no longer in progress.
    const { deps, removed, emitUrl } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitUrl("myapp://auth-callback?code=abc");
    await promise;

    expect(removed.url).toBe(true);
    expect(removed.app).toBe(true);
  });

  it("settles once, whatever arrives afterwards", async () => {
    const { deps, emitUrl, emitAppState } = makeDeps();
    const promise = openViaSystemBrowser("https://auth", deps);

    emitUrl("myapp://auth-callback?code=first");
    emitUrl("myapp://auth-callback?code=second");
    emitAppState("active");
    jest.advanceTimersByTime(RETURN_GRACE_MS * 2);

    await expect(promise).resolves.toEqual({
      type: "success",
      url: "myapp://auth-callback?code=first",
    });
  });
});
