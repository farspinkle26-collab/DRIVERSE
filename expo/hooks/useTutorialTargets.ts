/**
 * Driveverse — where the first-launch tutorial's spotlight targets actually
 * are on screen, shared across two files that cannot ref each other.
 *
 * `app/(tabs)/map.tsx` owns the Drive button and the chrome/social button
 * clusters; `app/(tabs)/_layout.tsx` owns the floating tab bar. A tutorial
 * overlay mounted in either file has no ref into the other's tree — they are
 * siblings under the router, not parent/child. This context is the shared
 * place each target registers its measured position into, and the one place
 * `components/MapTutorial.tsx` reads all four from, regardless of which
 * screen it happens to be rendered alongside.
 *
 * Mounted once, at the app root (`app/_layout.tsx`), same as every other
 * `createContextHook` provider in this app.
 *
 * WHY THIS ALSO KEEPS THE LIVE NODE, NOT JUST THE LAST RECT
 *   The first shipped version only ever measured on `onLayout` and trusted
 *   that value until the target's own flex layout changed. That is wrong on
 *   this specific screen: the map's chrome sits under `useSafeAreaInsets()`
 *   padding, and those insets can still read as their zero default on the
 *   very first layout pass and settle to the device's real values a frame or
 *   two later — on Android, after the first tutorial step is already on
 *   screen. A rect measured against the zero-inset pass is stale in a way
 *   `onLayout` does not reliably refire for, because from the layout
 *   engine's point of view the flex box never actually changed shape — only
 *   its parent's padding did, later, off-thread. The symptom is exactly "the
 *   spotlight sits near the button, not on it."
 *
 *   So every registered node stays reachable (`remeasure`), and
 *   `MapTutorial` calls it the moment a step becomes the active one, rather
 *   than trusting whatever `onLayout` happened to capture earlier.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useRef, useState } from "react";
import type { View } from "react-native";
import type { Rect, TutorialTargetId } from "@/lib/tutorialSteps";

export type { TutorialTargetId } from "@/lib/tutorialSteps";

export const [TutorialTargetsProvider, useTutorialTargets] = createContextHook(
  () => {
    const [rects, setRects] = useState<Partial<Record<TutorialTargetId, Rect>>>(
      {}
    );
    // Not React state on purpose: a node reference changing should not itself
    // cause a re-render — only a measured rect (`rects`, above) should.
    const nodesRef = useRef<Partial<Record<TutorialTargetId, View>>>({});

    const measureNode = useCallback(
      (id: TutorialTargetId, node: View, retriesLeft: number) => {
        node.measureInWindow((x, y, width, height) => {
          // The node may have been swapped or unmounted while this callback
          // was in flight; only apply the result if it is still the current
          // one, or a stale-but-larger race can clobber a fresher measurement.
          if (nodesRef.current[id] !== node) return;
          if (width === 0 && height === 0 && retriesLeft > 0) {
            requestAnimationFrame(() => measureNode(id, node, retriesLeft - 1));
            return;
          }
          if (width === 0 && height === 0) return; // genuinely not on screen
          setRects((prev) => ({ ...prev, [id]: { x, y, width, height } }));
        });
      },
      []
    );

    /**
     * Registers `node` under `id` and measures it. Called from
     * `TutorialTarget`'s `onLayout`, so this fires once per real layout pass
     * — the routine path. `null` deregisters (the target unmounted, e.g. the
     * screen's `hudIdle` gate hiding the button cluster), so `remeasure`
     * cannot later call `measureInWindow` on a detached native view.
     */
    const measure = useCallback(
      (id: TutorialTargetId, node: View | null) => {
        nodesRef.current[id] = node ?? undefined;
        if (!node) return;
        measureNode(id, node, 1);
      },
      [measureNode]
    );

    /**
     * Re-measures whatever node is currently registered for `id`, ignoring
     * whatever rect was captured before. A no-op if the target has never
     * mounted or is currently unmounted — the caller keeps its last-known
     * rect (or the "not measured yet" fallback) in that case, same as it
     * always could.
     */
    const remeasure = useCallback(
      (id: TutorialTargetId) => {
        const node = nodesRef.current[id];
        if (!node) return;
        measureNode(id, node, 2);
      },
      [measureNode]
    );

    return { rects, measure, remeasure };
  }
);
