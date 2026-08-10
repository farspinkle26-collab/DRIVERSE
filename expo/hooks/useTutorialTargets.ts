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
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useState } from "react";
import type { View } from "react-native";
import type { Rect, TutorialTargetId } from "@/lib/tutorialSteps";

export type { TutorialTargetId } from "@/lib/tutorialSteps";

export const [TutorialTargetsProvider, useTutorialTargets] = createContextHook(
  () => {
    const [rects, setRects] = useState<Partial<Record<TutorialTargetId, Rect>>>(
      {}
    );

    /**
     * Measures `node` and records it under `id`. One retry on the next frame
     * if the first measurement comes back zero-sized — the layout pass that
     * makes `measureInWindow` meaningful can land a frame after `onLayout`
     * fires, and a spotlight cut at (0,0) is worse than one frame late.
     */
    const measure = useCallback((id: TutorialTargetId, node: View | null) => {
      if (!node) return;
      const attempt = (retriesLeft: number) => {
        node.measureInWindow((x, y, width, height) => {
          if (width === 0 && height === 0 && retriesLeft > 0) {
            requestAnimationFrame(() => attempt(retriesLeft - 1));
            return;
          }
          if (width === 0 && height === 0) return; // genuinely not on screen
          setRects((prev) => ({ ...prev, [id]: { x, y, width, height } }));
        });
      };
      attempt(1);
    }, []);

    return { rects, measure };
  }
);
