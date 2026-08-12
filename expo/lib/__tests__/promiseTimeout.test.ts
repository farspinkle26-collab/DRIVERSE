import { withTimeout } from "@/lib/promiseTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves with the inner value when it settles before the deadline", async () => {
    const inner = Promise.resolve("done");
    const result = withTimeout(inner, 1000, "too slow");
    await expect(result).resolves.toBe("done");
  });

  it("rejects with the inner error when it rejects before the deadline", async () => {
    const inner = Promise.reject(new Error("boom"));
    const result = withTimeout(inner, 1000, "too slow");
    await expect(result).rejects.toThrow("boom");
  });

  it("rejects with the timeout message when the promise never settles", async () => {
    const inner = new Promise<string>(() => {
      // Never resolves or rejects — the exact shape a stalled fetch takes.
    });
    const result = withTimeout(inner, 1000, "too slow");
    const assertion = expect(result).rejects.toThrow("too slow");
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it("does not fire the timeout once the promise has already settled", async () => {
    const inner = Promise.resolve("fast");
    const result = withTimeout(inner, 1000, "too slow");
    await expect(result).resolves.toBe("fast");
    // If the timer were still armed, advancing it would try to reject an
    // already-settled promise — jest would fail on an unhandled rejection
    // if `clearTimeout` had not run.
    jest.advanceTimersByTime(2000);
  });
});
