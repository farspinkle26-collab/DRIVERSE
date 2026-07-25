import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the OS "reduce motion" setting is on.
 *
 * iOS: Settings → Accessibility → Motion → Reduce Motion.
 * Android: Settings → Accessibility → Remove animations.
 * Web: `prefers-reduced-motion`, which react-native-web maps onto the same
 * AccessibilityInfo API.
 *
 * Every animation in the app should read this and render its end state
 * immediately when it is true — not a faster version of the animation.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch(() => {
        // Platforms that cannot answer default to allowing motion.
      });

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled: boolean) => setReduced(enabled)
    );

    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
