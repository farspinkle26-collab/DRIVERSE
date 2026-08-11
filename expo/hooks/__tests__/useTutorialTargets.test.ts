/**
 * The first-launch tutorial's target registry.
 *
 * The bug this guards against: a rect measured once on `onLayout` and never
 * revisited, even though the same node's real on-screen position can change
 * later (safe-area insets resolving after the first layout pass, on this
 * app's own map screen). `remeasure()` exists to re-read the CURRENT
 * position of whatever node is registered, on demand — this is what
 * `MapTutorial` calls the moment a step becomes active, per its own header.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { TutorialTargetsProvider, useTutorialTargets } from "@/hooks/useTutorialTargets";

/** A fake `View` whose `measureInWindow` returns whatever the test wants next. */
function fakeNode(result: [number, number, number, number]) {
  return {
    measureInWindow: (
      cb: (x: number, y: number, width: number, height: number) => void
    ) => cb(...result),
  } as unknown as import("react-native").View;
}

async function setup() {
  const rendered = await renderHook(() => useTutorialTargets(), {
    wrapper: TutorialTargetsProvider,
  });
  // `@nkzw/create-context-hook` resolves its value a tick after the first
  // render — `result.current` is null until then.
  await waitFor(() => expect(rendered.result.current).not.toBeNull());
  return rendered;
}

test("measure() registers the first reading", async () => {
  const { result } = await setup();

  await act(async () => {
    result.current.measure("drive", fakeNode([10, 900, 56, 56]));
  });

  expect(result.current.rects.drive).toEqual({ x: 10, y: 900, width: 56, height: 56 });
});

test("remeasure() re-reads the node's CURRENT position, correcting a stale rect", async () => {
  // The exact scenario reported: onLayout fires once against a zero-inset
  // pass, then the real safe-area inset lands and the button's true position
  // moves — with nothing to make onLayout fire again on its own.
  const { result } = await setup();
  const node = fakeNode([10, 900, 56, 56]);

  await act(async () => {
    result.current.measure("drive", node);
  });
  expect(result.current.rects.drive).toEqual({ x: 10, y: 900, width: 56, height: 56 });

  // The node's real position has moved (the caller mutates what
  // measureInWindow will report — this stands in for the inset settling).
  node.measureInWindow = (cb) => cb(10, 860, 56, 56);

  await act(async () => {
    result.current.remeasure("drive");
  });
  expect(result.current.rects.drive).toEqual({ x: 10, y: 860, width: 56, height: 56 });
});

test("remeasure() is a no-op for a target that has never mounted", async () => {
  const { result } = await setup();

  await act(async () => {
    result.current.remeasure("chrome");
  });

  expect(result.current.rects.chrome).toBeUndefined();
});

test("measure(id, null) deregisters — remeasure() afterwards changes nothing", async () => {
  // The unmount path: a target inside a conditional render (hudIdle) can
  // unmount and remount. Once unmounted, remeasure() must not call
  // measureInWindow on a node React has already detached.
  const { result } = await setup();
  const node = fakeNode([10, 900, 56, 56]);

  await act(async () => {
    result.current.measure("drive", node);
  });
  expect(result.current.rects.drive).toEqual({ x: 10, y: 900, width: 56, height: 56 });

  await act(async () => {
    result.current.measure("drive", null);
  });

  // If remeasure still held the old node, this would silently "succeed" and
  // leave the stale rect in place — same rect either way, so assert the node
  // itself was never asked, not just the outcome.
  let wasCalled = false;
  node.measureInWindow = (cb) => {
    wasCalled = true;
    cb(10, 900, 56, 56);
  };

  await act(async () => {
    result.current.remeasure("drive");
  });

  expect(wasCalled).toBe(false);
});

test("re-registering under the same id (a remount) reads the new node", async () => {
  // `id="social"` sits inside the map's `hudIdle` conditional and can
  // unmount/remount as the driver interacts with the map — a fresh
  // registration must win, not the old node's last-known rect.
  const { result } = await setup();

  await act(async () => {
    result.current.measure("social", fakeNode([120, 950, 96, 44]));
  });
  expect(result.current.rects.social).toEqual({ x: 120, y: 950, width: 96, height: 44 });

  await act(async () => {
    result.current.measure("social", fakeNode([200, 900, 96, 44]));
  });
  expect(result.current.rects.social).toEqual({ x: 200, y: 900, width: 96, height: 44 });
});
