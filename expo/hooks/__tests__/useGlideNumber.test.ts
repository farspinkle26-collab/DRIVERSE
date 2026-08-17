import { act, renderHook } from "@testing-library/react-native";
import { useGlideNumber } from "@/hooks/useGlideNumber";
import { lerpHeadingDeg } from "@/lib/glide";

interface Props {
  target: number;
}

function setup(
  initialTarget: number,
  durationMs: number,
  interpolate?: (from: number, to: number, t: number) => number
) {
  return renderHook<number, Props>(
    ({ target }) => useGlideNumber(target, durationMs, interpolate),
    { initialProps: { target: initialTarget } }
  );
}

describe("useGlideNumber", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number
    );
    jest.spyOn(global, "cancelAnimationFrame").mockImplementation((id: number) => {
      clearTimeout(id as unknown as NodeJS.Timeout);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("snaps to the first value with no animation", async () => {
    const { result } = await setup(42, 200);
    expect(result.current).toBe(42);
  });

  it("does not jump to the new target immediately on a retarget", async () => {
    const { result, rerender } = await setup(40, 200);
    expect(result.current).toBe(40);

    await act(async () => {
      await rerender({ target: 90 });
    });
    expect(result.current).not.toBe(90);
  });

  it("reaches the target once the glide completes", async () => {
    const { result, rerender } = await setup(40, 200);

    await act(async () => {
      await rerender({ target: 90 });
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(result.current).toBe(90);
  });

  it("uses a custom interpolator when given one — heading takes the shorter arc", async () => {
    const { result, rerender } = await setup(350, 200, lerpHeadingDeg);

    await act(async () => {
      await rerender({ target: 10 });
    });
    await act(async () => {
      jest.advanceTimersByTime(20); // early in the 200ms glide, still close to the start
    });

    // A shorter-arc glide from 350° toward 10° passes through 360°/0°, so
    // partway through it must be near 0°, never dip down toward 180° (the
    // long way around, which a plain numeric lerp(350, 10, t) would take).
    expect(result.current).toBeGreaterThan(350);
  });
});
