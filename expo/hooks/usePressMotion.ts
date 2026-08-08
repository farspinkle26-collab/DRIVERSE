/**
 * Driveverse — the press depression shared by every primary surface.
 *
 * One hook so a button, a card and a filter chip cannot drift into three
 * different ideas of what being pressed feels like. It returns a transform
 * style to spread onto an `Animated.View` and the two Pressable handlers that
 * drive it.
 *
 * WHY `Animated` AND NOT REANIMATED
 *   Reanimated is not a dependency of this app, and the brief that asked for
 *   this assumed it was. Adding it would mean a new native module plus a Babel
 *   plugin that has to be ordered last — precisely the class of change
 *   `LAUNCH_SAFETY_REFERENCE.md` §9 and §10 are both about, on a repo where a
 *   version-drifted Babel preset and an off-SDK package have each already
 *   killed a store build. What is animated here is a 2pt translate and a 1.5%
 *   scale: `Animated` with `useNativeDriver` runs both on the UI thread, off
 *   the JS thread, which is the only property that actually mattered. The
 *   dependency buys nothing here and costs a native surface.
 *
 * WHY THE SHADOW IS NOT ANIMATED
 *   `useNativeDriver` carries `transform` and `opacity` and nothing else, so
 *   animating `shadowOpacity` would drop the whole press onto the JS thread —
 *   the one thing that makes a press feel late on a budget Android. The
 *   elevation step is swapped discretely at press-in instead. At a 90ms
 *   press-in over a 2pt travel the swap and the motion read as one event.
 */

import { useCallback, useMemo, useRef } from "react";
import { Animated } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { duration, press as pressTokens } from "@/constants/theme";

export type PressMotionKind = "sink" | "scale";

export interface PressMotion {
  /** Spread onto the `Animated.View` wrapping the surface. */
  style: { transform: { translateY: Animated.AnimatedInterpolation<number> }[] }
    | { transform: { scale: Animated.AnimatedInterpolation<number> }[] };
  onPressIn: () => void;
  onPressOut: () => void;
}

/**
 * `sink` (buttons) translates down; `scale` (cards) shrinks. A large card
 * sliding 2pt looks loose rather than pressed, and a small button scaling
 * looks like it is being inflated — hence two shapes of the same cue rather
 * than one applied everywhere.
 *
 * Under reduce-motion the end state is applied instantly, per the convention
 * in `hooks/useReducedMotion.ts`: the press confirmation is kept, the travel
 * to it is not.
 */
export function usePressMotion(kind: PressMotionKind = "sink"): PressMotion {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const onPressIn = useCallback(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: duration.press,
      useNativeDriver: true,
    }).start();
  }, [progress, reduced]);

  const onPressOut = useCallback(() => {
    if (reduced) {
      progress.setValue(0);
      return;
    }
    // Tightly damped — this settles, it does not overshoot. See the note on
    // `duration` in constants/theme.ts.
    Animated.spring(progress, {
      toValue: 0,
      damping: 18,
      stiffness: 320,
      mass: 0.5,
      useNativeDriver: true,
    }).start();
  }, [progress, reduced]);

  const style = useMemo(() => {
    if (kind === "scale") {
      return {
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, pressTokens.scale],
            }),
          },
        ],
      };
    }
    return {
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, pressTokens.translateY],
          }),
        },
      ],
    };
  }, [kind, progress]);

  return { style, onPressIn, onPressOut };
}

export default usePressMotion;
