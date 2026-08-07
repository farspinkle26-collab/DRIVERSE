import { describe, expect, it } from "bun:test";
import { PING_INTERVAL_MS, isMissingRpc, shouldPing } from "@/lib/lastActive";

const T0 = 1_700_000_000_000;

describe("shouldPing", () => {
  it("always pings when this process has not pinged yet", () => {
    // The launch ping — the one that makes "opened the app and did nothing"
    // countable in the first place.
    expect(shouldPing(null, T0)).toBe(true);
    expect(shouldPing(undefined, T0)).toBe(true);
  });

  it("holds off inside the interval", () => {
    expect(shouldPing(T0, T0)).toBe(false);
    expect(shouldPing(T0, T0 + 1)).toBe(false);
    expect(shouldPing(T0, T0 + PING_INTERVAL_MS - 1)).toBe(false);
  });

  it("pings once the interval has elapsed", () => {
    expect(shouldPing(T0, T0 + PING_INTERVAL_MS)).toBe(true);
    expect(shouldPing(T0, T0 + 6 * 60_000)).toBe(true);
  });

  it("honours a caller-supplied interval", () => {
    expect(shouldPing(T0, T0 + 30_000, 60_000)).toBe(false);
    expect(shouldPing(T0, T0 + 60_000, 60_000)).toBe(true);
  });

  it("pings when the clock has moved backwards", () => {
    // An NTP correction or a manual time change. Waiting for real time to
    // catch up with a bad reading would silence the device for hours.
    expect(shouldPing(T0 + 3_600_000, T0)).toBe(true);
  });

  it("treats a non-finite stored reading as no reading", () => {
    expect(shouldPing(NaN, T0)).toBe(true);
    expect(shouldPing(Infinity, T0)).toBe(true);
  });
});

describe("isMissingRpc", () => {
  it("recognises PostgREST's missing-function code", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
  });

  it("recognises the message when the code is absent", () => {
    expect(
      isMissingRpc({ message: "Could not find the function public.touch_last_active" }),
    ).toBe(true);
    expect(isMissingRpc({ message: 'function public.touch_last_active() does not exist' })).toBe(true);
  });

  it("does not swallow transient failures", () => {
    // These must stay retryable — disabling the ping for the life of the
    // process on a dropped request would lose the whole session.
    expect(isMissingRpc({ message: "Network request failed" })).toBe(false);
    expect(isMissingRpc({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
    expect(isMissingRpc(undefined)).toBe(false);
  });
});
