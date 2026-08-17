import { act, renderHook } from "@testing-library/react-native";
import { useGlideLatLng } from "@/hooks/useGlideLatLng";
import type { LatLng } from "@/lib/tripGeoStats";

const A = { latitude: -6.2, longitude: 106.8 };
const B = { latitude: -6.2005, longitude: 106.8005 }; // ~70m away — well under any threshold used below
const FAR = { latitude: 40.7, longitude: -74.0 }; // New York — a "teleport" from Jakarta

interface Props {
  target: LatLng;
}

function setup(initialTarget: LatLng, glideMs: number, snapThresholdMeters: number) {
  return renderHook<LatLng, Props>(
    ({ target }) => useGlideLatLng(target, glideMs, snapThresholdMeters),
    { initialProps: { target: initialTarget } }
  );
}

describe("useGlideLatLng", () => {
  // Modern fake timers also mock Date.now(), which the hook's internal
  // elapsed-time math reads — so jest.advanceTimersByTime drives the glide
  // deterministically instead of depending on real elapsed wall-clock time
  // (which flaked against Jest's own environment teardown in this suite).
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

  it("snaps to the first target with no animation", async () => {
    const { result } = await setup(A, 1000, 500);
    expect(result.current).toEqual(A);
  });

  it("snaps instantly when the new target is farther than the threshold", async () => {
    const { result, rerender } = await setup(A, 1000, 500);
    expect(result.current).toEqual(A);

    await act(async () => {
      await rerender({ target: FAR });
    });
    expect(result.current).toEqual(FAR);
  });

  it("glides toward a nearby target rather than snapping immediately", async () => {
    const { result, rerender } = await setup(A, 1000, 500);
    expect(result.current).toEqual(A);

    await act(async () => {
      await rerender({ target: B });
    });
    // Immediately after the retarget (before any animation frame has run),
    // the displayed position must not have already snapped to B — that
    // would be the exact "stutter" this hook exists to remove.
    expect(result.current).not.toEqual(B);
  });

  it("eventually reaches the target once the glide completes", async () => {
    const { result, rerender } = await setup(A, 200, 500);

    await act(async () => {
      await rerender({ target: B });
    });

    await act(async () => {
      jest.advanceTimersByTime(400); // past the 200ms glide duration
    });

    expect(result.current.latitude).toBeCloseTo(B.latitude, 3);
    expect(result.current.longitude).toBeCloseTo(B.longitude, 3);
  });

  it("re-targets mid-glide toward a second update rather than finishing the first", async () => {
    const { result, rerender } = await setup(A, 200, 500);

    await act(async () => {
      await rerender({ target: B });
    });
    await act(async () => {
      jest.advanceTimersByTime(50); // partway through the glide to B
    });

    const C = { latitude: -6.201, longitude: 106.801 };
    await act(async () => {
      await rerender({ target: C });
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(result.current.latitude).toBeCloseTo(C.latitude, 3);
    expect(result.current.longitude).toBeCloseTo(C.longitude, 3);
  });
});
