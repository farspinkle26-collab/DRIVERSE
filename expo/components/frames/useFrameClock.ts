/**
 * Driveverse — one animation clock for every frame on screen.
 *
 * WHY THIS EXISTS
 *   The naive version gives each `<AvatarFrame>` its own `Animated.Value`
 *   and its own `Animated.loop`. Thirty rows of a convoy roster then run
 *   thirty independent loops, each scheduling its own JS-driven update of a
 *   `strokeDashoffset` — which is both a real cost and, visually, thirty
 *   rings drifting out of phase into visual noise.
 *
 *   Instead, frames sharing a lap duration share a single looping value,
 *   ref-counted so the loop starts with the first subscriber and stops with
 *   the last. Thirty rings then animate in lockstep off one driver, which
 *   is cheaper *and* reads as a deliberate system rather than clutter.
 *
 * NATIVE DRIVER
 *   `strokeDashoffset` is an SVG prop, so it cannot use the native driver —
 *   react-native-svg has to marshal it through JS. That is exactly why the
 *   map falls back to static frames (`FrameDetail === "marker"`) and why
 *   trails run on a 7–9 second lap: one shared interpolation at that rate is
 *   cheap, thirty independent ones at spinner speed would not be.
 */

import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

interface Clock {
  value: Animated.Value;
  loop: Animated.CompositeAnimation | null;
  subscribers: number;
}

/** Keyed by lap duration, so tier 8's 9s trail and King's 7s trail each get
 *  their own clock but every tier-8 avatar on screen shares one. */
const clocks = new Map<number, Clock>();

function acquire(periodSeconds: number): Animated.Value {
  let clock = clocks.get(periodSeconds);
  if (!clock) {
    clock = { value: new Animated.Value(0), loop: null, subscribers: 0 };
    clocks.set(periodSeconds, clock);
  }
  clock.subscribers += 1;
  if (!clock.loop) {
    clock.value.setValue(0);
    clock.loop = Animated.loop(
      Animated.timing(clock.value, {
        toValue: 1,
        duration: periodSeconds * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    clock.loop.start();
  }
  return clock.value;
}

function release(periodSeconds: number) {
  const clock = clocks.get(periodSeconds);
  if (!clock) return;
  clock.subscribers -= 1;
  if (clock.subscribers <= 0) {
    clock.loop?.stop();
    clock.loop = null;
    clock.subscribers = 0;
  }
}

/**
 * A shared 0→1 loop running at `periodSeconds`.
 *
 * Pass `enabled: false` — reduced motion, a marker, a static tier — and no
 * clock is acquired at all, so a screen of static frames schedules nothing.
 * The returned value is still a valid `Animated.Value` pinned at 0, so
 * callers never have to branch on null.
 */
export function useFrameClock(
  periodSeconds: number,
  enabled: boolean
): Animated.Value {
  const active = enabled && periodSeconds > 0;

  // A stable parked value covers both the disabled case and the first frame
  // before the effect runs, so the returned identity never flips to null and
  // callers never branch. Held in a ref so it survives re-renders; acquiring
  // the shared clock happens only in the effect, never during render, so a
  // double-invoked render can't leak a subscription.
  const parked = useRef<Animated.Value | null>(null);
  if (parked.current === null) parked.current = new Animated.Value(0);

  const [clock, setClock] = useState<Animated.Value | null>(null);

  useEffect(() => {
    if (!active) {
      setClock(null);
      return;
    }
    const value = acquire(periodSeconds);
    setClock(value);
    return () => {
      release(periodSeconds);
      setClock(null);
    };
  }, [active, periodSeconds]);

  return clock ?? parked.current;
}

export default useFrameClock;
